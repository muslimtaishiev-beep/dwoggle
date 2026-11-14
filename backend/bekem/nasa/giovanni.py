"""NASA Giovanni Time Series API: rainfall (GPM IMERG) and hydrology (GLDAS) at a point.

This is the same service behind NASA's "Hydrology Time Series" tool, which replaced Data Rods.
API: https://api.giovanni.earthdata.nasa.gov/timeseries (Earthdata bearer token, monthly quota).
Each call returns all years in about 3-5 s, so the three calls run in parallel.
"""

from __future__ import annotations

import calendar
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime

import httpx

from .earthdata import EarthdataToken

API = "https://api.giovanni.earthdata.nasa.gov"

RAIN = "GPM_3IMERGDF_07_precipitation"  # daily, mm/day, 0.1 deg (~11 km)
RUNOFF = "GLDAS_NOAH025_M_2_1_Qs_acc"  # monthly mean of 3-hourly storm runoff, kg m-2 per 3 h, 0.25 deg (~28 km)
SOIL = "GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst"  # monthly topsoil (0-10 cm) moisture, kg m-2 = mm, 0.25 deg

SEASON = range(3, 10)  # Mar-Sep: the rain, flood and mudflow season in Kyrgyzstan
SEASON_DAYS_MIN = 200  # of 214 days, or the year is skipped


def parse_csv(text: str) -> list[tuple[datetime, float]]:
    """Giovanni CSV: a key,value header block, a blank line, then 'Timestamp (UTC),Data' rows."""
    undef = None
    rows: list[tuple[datetime, float]] = []
    in_data = False
    for line in text.splitlines():
        if not in_data:
            if line.startswith("undef,"):
                undef = float(line.split(",", 1)[1])
            elif line.startswith("Timestamp"):
                in_data = True
            continue
        if not line.strip():
            continue
        ts, val = line.split(",", 1)
        try:
            v = float(val)
        except ValueError:
            continue
        if undef is not None and abs(v - undef) < 1e-6:
            continue
        rows.append((datetime.strptime(ts.strip(), "%Y-%m-%d %H:%M"), v))
    return rows


def rain_by_year(daily: list[tuple[datetime, float]]) -> tuple[dict[int, float], dict[int, float]]:
    """Daily mm -> (Mar-Sep total per year, wettest Mar-Sep day per year), complete seasons only."""
    days: dict[int, list[float]] = {}
    for ts, v in daily:
        if ts.month in SEASON:
            days.setdefault(ts.year, []).append(v)
    total = {y: round(sum(v), 1) for y, v in sorted(days.items()) if len(v) >= SEASON_DAYS_MIN}
    wettest = {y: round(max(days[y]), 1) for y in total}
    return total, wettest


def runoff_peak_by_year(monthly: list[tuple[datetime, float]]) -> dict[int, float]:
    """Monthly mean 3-hourly runoff -> mm in the wettest Mar-Sep month, complete seasons only."""
    months: dict[int, list[float]] = {}
    for ts, v in monthly:
        if ts.month in SEASON:
            mm = v * 8 * calendar.monthrange(ts.year, ts.month)[1]  # 8 three-hour steps per day
            months.setdefault(ts.year, []).append(mm)
    return {y: round(max(v), 2) for y, v in sorted(months.items()) if len(v) == len(SEASON)}


def soil_by_year(monthly: list[tuple[datetime, float]]) -> dict[int, float]:
    """Mean May-Sep topsoil moisture (mm in the top 10 cm), complete seasons only."""
    months: dict[int, list[float]] = {}
    for ts, v in monthly:
        if 5 <= ts.month <= 9:
            months.setdefault(ts.year, []).append(v)
    return {y: round(sum(v) / len(v), 2) for y, v in sorted(months.items()) if len(v) == 5}


class Giovanni:
    def __init__(self, token: EarthdataToken, timeout: float = 20.0):
        self.token = token
        self.timeout = timeout

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token.get()}"}

    def timeseries(self, variable: str, lat: float, lon: float, start: str, end: str) -> list[tuple[datetime, float]]:
        r = httpx.get(
            f"{API}/timeseries",
            params={"data": variable, "location": f"[{lat},{lon}]", "time": f"{start}/{end}"},
            headers=self._headers(),
            timeout=self.timeout,
        )
        r.raise_for_status()
        return parse_csv(r.text)

    def quota(self) -> float | None:
        r = httpx.get(f"{API}/quota", headers=self._headers(), timeout=self.timeout)
        r.raise_for_status()
        return r.json().get("quota")

    def fetch(self, lat: float, lon: float) -> dict[str, dict[int, float]]:
        """All flood-context series for a point, from three parallel Giovanni calls."""
        end = f"{date.today():%Y-%m-%d}T00:00:00"
        jobs = {
            "rain": (RAIN, "2000-06-01T00:00:00"),
            "runoff": (RUNOFF, "2000-01-01T00:00:00"),
            "soil": (SOIL, "2000-01-01T00:00:00"),
        }
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = {k: pool.submit(self.timeseries, var, lat, lon, start, end) for k, (var, start) in jobs.items()}
            raw = {k: f.result() for k, f in futures.items()}
        total, wettest = rain_by_year(raw["rain"])
        return {
            "rain_season_mm": total,
            "rain_max_day_mm": wettest,
            "runoff_peak_mm": runoff_peak_by_year(raw["runoff"]),
            "soil_moisture_mm": soil_by_year(raw["soil"]),
        }
