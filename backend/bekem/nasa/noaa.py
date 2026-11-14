"""Nearest NOAA weather station: summer air temperature trend, as a ground check for the heat grade.

Data: NOAA NCEI Global Summary of the Month (the archive behind Climate Data Online), no token.
A station measures AIR temperature at 2 m; MODIS measures the GROUND SURFACE. The numbers are
not comparable, so Bekem only compares the direction of the two trends.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import httpx

from ..config import BASE_DIR

DATA_URL = "https://www.ncei.noaa.gov/access/services/data/v1"
STATIONS_PATH = BASE_DIR / "data" / "noaa_stations_kg.json"
MIN_SUMMERS = 15
MAX_DISTANCE_KM = 30.0
MAX_ELEV_DIFF_M = 500.0  # a mountain station says little about a valley plot


@dataclass(frozen=True)
class Station:
    id: str
    name: str
    lat: float
    lon: float
    elev_m: float
    distance_km: float


@lru_cache(maxsize=2)
def _stations(path: str) -> tuple[dict, ...]:
    p = Path(path)
    return tuple(json.loads(p.read_text(encoding="utf-8"))) if p.exists() else ()


def _km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(a))


def nearest_station(lat: float, lon: float, elev_m: float | None, path: Path = STATIONS_PATH) -> Station | None:
    """Closest station within 30 km and 500 m of elevation, or None (outside Kyrgyzstan there are none)."""
    best = None
    for s in _stations(str(path)):
        d = _km(lat, lon, s["lat"], s["lon"])
        if d > MAX_DISTANCE_KM:
            continue
        if elev_m is not None and abs(s["elev_m"] - elev_m) > MAX_ELEV_DIFF_M:
            continue
        if best is None or d < best.distance_km:
            best = Station(s["id"], s["name"], s["lat"], s["lon"], s["elev_m"], round(d, 1))
    return best


def parse_summer_tmax(records: list[dict]) -> dict[int, float]:
    """GSOM records -> {year: mean Jun-Aug TMAX}, only for years with all three months."""
    by_year: dict[int, dict[str, float]] = {}
    for rec in records:
        month = rec.get("DATE", "")[5:7]
        if month not in ("06", "07", "08") or rec.get("TMAX") in (None, ""):
            continue
        by_year.setdefault(int(rec["DATE"][:4]), {})[month] = float(rec["TMAX"])
    return {y: round(sum(m.values()) / 3, 2) for y, m in sorted(by_year.items()) if len(m) == 3}


def fetch_summer_tmax(station_id: str, timeout: float = 20.0) -> dict[int, float]:
    r = httpx.get(
        DATA_URL,
        params={"dataset": "global-summary-of-the-month", "stations": station_id, "dataTypes": "TMAX",
                "startDate": "2000-01-01", "endDate": "2026-12-31", "format": "json"},
        timeout=timeout,
    )
    r.raise_for_status()
    return parse_summer_tmax(r.json())
