"""Second opinions on the grades. They never change a grade; they say whether another source agrees.

Honesty rules (from review):
- AppEEARS heat/green uses the SAME MODIS data as Earth Engine: it checks our calculation and is
  labelled "same result via NASA AppEEARS", never "independent confirmation".
- MODIS MOD44W water map and NOAA stations are independent sources.
- A station measures air temperature, MODIS the ground surface: only trend DIRECTION is compared.
"""

from __future__ import annotations

from .grading import ALPHA
from .stats import Trend, trend


def _trend(series: dict[int, float]) -> Trend | None:
    ys = sorted(series)
    return trend(ys, [series[y] for y in ys], ALPHA)


def _points(series: dict[int, float]) -> list[dict]:
    return [{"year": y, "value": v} for y, v in sorted(series.items())]


def _trend_out(tr: Trend | None) -> dict | None:
    return None if tr is None else tr.as_dict()


def station_check(station, tmax: dict[int, float] | None, satellite: Trend | None) -> dict:
    """NOAA station vs MODIS heat trend, comparing direction only."""
    if station is None:
        return {"source": "noaa_station", "independent": True, "status": "unavailable", "key": "verify.station.none", "params": {}}
    tr = _trend(tmax or {})
    if tr is None or satellite is None:
        return {"source": "noaa_station", "independent": True, "status": "unavailable", "key": "verify.station.short",
                "params": {"name": station.name}}
    agrees = tr.direction == satellite.direction
    return {
        "source": "noaa_station",
        "independent": True,
        "status": "agrees" if agrees else "differs",
        "key": "verify.station.agrees" if agrees else "verify.station.differs",
        "params": {"name": station.name, "km": station.distance_km, "dir": f"@trend.{tr.direction}"},
        "station": {"id": station.id, "name": station.name, "distance_km": station.distance_km, "elev_m": station.elev_m},
        "series": {"id": "station_tmax", "unit": "°C", "resolution_m": 0, "source_id": "noaa_ghcn",
                   "points": _points(tmax), "trend": _trend_out(tr)},
    }


def appeears_same_data_check(source_id: str, series: dict[int, float] | None, ours: Trend | None, unit: str,
                             status: str) -> dict:
    """AppEEARS recalculation of a MODIS trend (same data, different tool)."""
    base = {"source": "appeears", "dataset": source_id, "independent": False}
    if status != "done":
        return {**base, "status": status, "key": f"verify.appeears.{status}", "params": {}}
    tr = _trend(series or {})
    if tr is None or ours is None:
        return {**base, "status": "unavailable", "key": "verify.appeears.unavailable", "params": {}}
    same = tr.direction == ours.direction
    return {
        **base,
        "status": "same" if same else "differs",
        "key": "verify.appeears.same" if same else "verify.appeears.differs",
        "params": {"change": round(tr.change, 2 if unit == "NDVI" else 1), "unit": "" if unit == "NDVI" else unit,
                   "sig": "@significant" if tr.significant else "@not_significant"},
        "series": {"id": f"appeears_{source_id}", "unit": unit, "points": _points(series), "trend": _trend_out(tr)},
    }


def mod44w_check(water_years: dict[int, int] | None, landsat_wet_years: int | None, status: str) -> dict:
    """MODIS MOD44W yearly water map (independent of Landsat) vs our Landsat water years."""
    base = {"source": "appeears", "dataset": "mod44w", "independent": True}
    if status != "done":
        return {**base, "status": status, "key": f"verify.appeears.{status}", "params": {}}
    if not water_years or landsat_wet_years is None:
        return {**base, "status": "unavailable", "key": "verify.appeears.unavailable", "params": {}}
    n = sum(1 for v in water_years.values() if v)
    agrees = (n > 0) == (landsat_wet_years > 0)
    return {
        **base,
        "status": "agrees" if agrees else "differs",
        "key": "verify.mod44w.agrees" if agrees else "verify.mod44w.differs",
        "params": {"n": n, "total": len(water_years), "first": min(water_years), "last": max(water_years)},
    }
