"""NASA AppEEARS client (LP DAAC): point samples of MODIS products over 25 years.

AppEEARS is a task queue: submit, wait (minutes to hours), download CSV. Too slow for a live tap,
so Bekem uses it for the demo plots and as a background cross-check.
API docs: https://appeears.earthdatacloud.nasa.gov/api/
"""

from __future__ import annotations

import csv
import io
import json
import logging
import math
import threading
import time
from datetime import date

import httpx

log = logging.getLogger(__name__)

API = "https://appeears.earthdatacloud.nasa.gov/api"

LAYERS = [
    {"product": "MOD11A2.061", "layer": "LST_Day_1km"},  # land surface temperature, 1 km
    {"product": "MOD13Q1.061", "layer": "_250m_16_days_NDVI"},  # vegetation, 250 m
    {"product": "MOD44W.061", "layer": "water_mask"},  # yearly land/water map, 250 m
]


class AppEEARSError(RuntimeError):
    pass


def ring_points(lat: float, lon: float, offset_m: float = 250.0) -> list[dict]:
    """The plot centre plus 4 points offset_m to the N, E, S and W."""
    dlat = offset_m / 111_320.0
    dlon = offset_m / (111_320.0 * math.cos(math.radians(lat)))
    pts = [("c", lat, lon), ("n", lat + dlat, lon), ("e", lat, lon + dlon), ("s", lat - dlat, lon), ("w", lat, lon - dlon)]
    return [{"id": pid, "latitude": round(la, 6), "longitude": round(lo, 6), "category": "plot"} for pid, la, lo in pts]


class AppEEARS:
    def __init__(self, username: str, password: str, timeout: float = 60.0):
        if not username or not password:
            raise AppEEARSError(
                "NASA Earthdata login is missing. Put BEKEM_EARTHDATA_USERNAME and BEKEM_EARTHDATA_PASSWORD in backend/.env "
                "(free account: https://urs.earthdata.nasa.gov/users/new)."
            )
        self._auth = (username, password)
        self._client = httpx.Client(base_url=API, timeout=timeout, follow_redirects=True)
        self._token: str | None = None

    def login(self) -> str:
        r = self._client.post("/login", auth=self._auth)
        if r.status_code in (401, 403):
            raise AppEEARSError("NASA Earthdata rejected the username/password. Check them at https://urs.earthdata.nasa.gov.")
        r.raise_for_status()
        self._token = r.json()["token"]
        return self._token

    def _headers(self) -> dict:
        if self._token is None:
            self.login()
        return {"Authorization": f"Bearer {self._token}"}

    def submit_points(self, name: str, lat: float, lon: float, start: date | None = None, end: date | None = None) -> str:
        start = start or date(2000, 1, 1)
        end = end or date.today()
        task = {
            "task_type": "point",
            "task_name": name,
            "params": {
                "dates": [{"startDate": start.strftime("%m-%d-%Y"), "endDate": end.strftime("%m-%d-%Y")}],
                "layers": LAYERS,
                "coordinates": ring_points(lat, lon),
            },
        }
        r = self._client.post("/task", json=task, headers=self._headers())
        if r.status_code >= 400:
            raise AppEEARSError(f"AppEEARS refused the task ({r.status_code}): {r.text[:300]}")
        return r.json()["task_id"]

    def status(self, task_id: str) -> str:
        r = self._client.get(f"/task/{task_id}", headers=self._headers())
        r.raise_for_status()
        return r.json().get("status", "unknown")

    def files(self, task_id: str) -> list[dict]:
        r = self._client.get(f"/bundle/{task_id}", headers=self._headers())
        r.raise_for_status()
        return r.json().get("files", [])

    def download(self, task_id: str, file_id: str) -> bytes:
        r = self._client.get(f"/bundle/{task_id}/{file_id}", headers=self._headers())
        r.raise_for_status()
        return r.content


# --- Results ---------------------------------------------------------------------------------

def _column(fieldnames: list[str], suffix: str) -> str | None:
    return next((f for f in fieldnames if f.endswith(suffix)), None)


def parse_results(csv_texts: list[str]) -> dict[str, dict[int, float]]:
    """AppEEARS point-sample CSVs -> yearly series matching what Earth Engine computes.

    lst:   Jun-Aug mean daytime LST at the plot pixel, deg C
    ndvi:  May-Sep mean NDVI over the plot + 4 points at 250 m
    water: 1 if MOD44W marked water at the plot or any of the 4 points that year, else 0
    """
    lst: dict[int, list[float]] = {}
    ndvi: dict[int, list[float]] = {}
    water: dict[int, int] = {}
    for text in csv_texts:
        reader = csv.DictReader(io.StringIO(text))
        cols = reader.fieldnames or []
        c_lst, c_ndvi, c_water = _column(cols, "_LST_Day_1km"), _column(cols, "_250m_16_days_NDVI"), _column(cols, "_water_mask")
        for row in reader:
            try:
                year, month = int(row["Date"][:4]), int(row["Date"][5:7])
            except (KeyError, ValueError):
                continue
            if c_lst and row.get(c_lst) and row.get("ID", "c") == "c" and 6 <= month <= 8:
                v = float(row[c_lst])
                if v > 0:  # 0 = fill
                    lst.setdefault(year, []).append(v - 273.15 if v > 200 else v)
            if c_ndvi and row.get(c_ndvi) and 5 <= month <= 9:
                v = float(row[c_ndvi])
                if abs(v) > 1.5:  # unscaled integer
                    v *= 0.0001
                if -0.2 <= v <= 1.0:
                    ndvi.setdefault(year, []).append(v)
            if c_water and row.get(c_water) not in (None, ""):
                v = int(float(row[c_water]))
                if v in (0, 1):
                    water[year] = max(water.get(year, 0), v)
    return {
        "lst": {y: round(sum(v) / len(v), 2) for y, v in sorted(lst.items()) if len(v) >= 6},
        "ndvi": {y: round(sum(v) / len(v), 4) for y, v in sorted(ndvi.items()) if len(v) >= 10},
        "water": dict(sorted(water.items())),
    }


def download_results(api: AppEEARS, task_id: str) -> dict[str, dict[int, float]]:
    texts = [api.download(task_id, f["file_id"]).decode("utf-8") for f in api.files(task_id) if f["file_name"].endswith(".csv")]
    return parse_results(texts)


# --- Background manager ----------------------------------------------------------------------

RUNNING = ("submitted", "pending", "queued", "processing")


class AppEEARSManager:
    """One AppEEARS task per snapped cell. Polls in the background; results are kept forever."""

    def __init__(self, cache, username: str, password: str, max_pending: int = 5, poll_s: int = 120):
        self.cache = cache
        self.max_pending = max_pending
        self.poll_s = poll_s
        self._creds = (username, password)
        self._api: AppEEARS | None = None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        cache.execute(
            "CREATE TABLE IF NOT EXISTS appeears (key TEXT PRIMARY KEY, lat REAL, lon REAL, task_id TEXT, "
            "status TEXT, result TEXT, updated REAL)"
        )

    @staticmethod
    def key(lat: float, lon: float) -> str:
        return f"{lat:.3f}:{lon:.3f}"

    def api(self) -> AppEEARS:
        if self._api is None:
            self._api = AppEEARS(*self._creds)
        return self._api

    def get(self, lat: float, lon: float) -> tuple[str, dict | None]:
        """(status, result) where status is done | pending | unavailable."""
        row = self.cache.query_one("SELECT status, result FROM appeears WHERE key = ?", (self.key(lat, lon),))
        if row is None:
            return "unavailable", None
        status, result = row
        if status == "done" and result:
            data = json.loads(result)
            return "done", {k: {int(y): v for y, v in s.items()} for k, s in data.items()}
        return ("pending" if status in RUNNING else "unavailable"), None

    def import_done(self, lat: float, lon: float, result: dict, task_id: str = "") -> None:

        self.cache.execute(
            "INSERT OR REPLACE INTO appeears VALUES (?, ?, ?, ?, 'done', ?, ?)",
            (self.key(lat, lon), lat, lon, task_id, json.dumps(result), time.time()),
        )

    def track(self, lat: float, lon: float, task_id: str) -> None:
        """Adopt a task submitted elsewhere (e.g. scripts/appeears_demo.py) unless we already have it."""

        if self.cache.query_one("SELECT 1 FROM appeears WHERE key = ?", (self.key(lat, lon),)) is None:
            self.cache.execute(
                "INSERT INTO appeears VALUES (?, ?, ?, ?, 'submitted', NULL, ?)",
                (self.key(lat, lon), lat, lon, task_id, time.time()),
            )

    def request(self, lat: float, lon: float) -> None:
        """Queue a task for this cell if it has none and the queue has room. Never raises."""
        with self._lock:
            if self.cache.query_one("SELECT 1 FROM appeears WHERE key = ?", (self.key(lat, lon),)):
                return
            running = self.cache.query_one(
                f"SELECT COUNT(*) FROM appeears WHERE status IN ({','.join('?' * len(RUNNING))})", RUNNING
            )[0]
            if running >= self.max_pending:
                return
            try:
                task_id = self.api().submit_points(f"bekem-{self.key(lat, lon)}", lat, lon)
                status = "submitted"
            except Exception:  # noqa: BLE001
                log.exception("AppEEARS submit failed")
                task_id, status = "", "error"
            self.cache.execute(
                "INSERT OR REPLACE INTO appeears VALUES (?, ?, ?, ?, ?, NULL, ?)",
                (self.key(lat, lon), lat, lon, task_id, status, time.time()),
            )

    def poll_once(self) -> None:
        rows = self.cache.query_all(
            f"SELECT key, lat, lon, task_id FROM appeears WHERE status IN ({','.join('?' * len(RUNNING))})", RUNNING
        )
        for key, lat, lon, task_id in rows:
            try:
                status = self.api().status(task_id)
                if status == "done":
                    self.import_done(lat, lon, download_results(self.api(), task_id), task_id)
                    log.info("AppEEARS task for %s done", key)
                else:
                    self.cache.execute("UPDATE appeears SET status = ?, updated = ? WHERE key = ?", (status, time.time(), key))
            except Exception:  # noqa: BLE001
                log.exception("AppEEARS poll failed for %s", key)

    def pending_count(self) -> int:
        return self.cache.query_one(
            f"SELECT COUNT(*) FROM appeears WHERE status IN ({','.join('?' * len(RUNNING))})", RUNNING
        )[0]

    def start(self) -> None:

        def loop():
            while not self._stop.wait(self.poll_s):
                self.poll_once()

        threading.Thread(target=loop, daemon=True, name="appeears-poller").start()
