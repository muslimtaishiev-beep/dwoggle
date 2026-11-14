"""Google Earth Engine provider: 25+ years of NASA data around one point, in a single request.

The whole computation is built as one server-side graph and pulled with a single getInfo(),
so a report costs one round trip to Earth Engine (typically 3-15 s cold).

Datasets
- Water history: NASA/USGS Landsat, processed by JRC Global Surface Water YearlyHistory v1.4
  (2000-2021) and by our own Landsat 8/9 Collection 2 MNDWI water classification (2022+).
- Elevation and slope: NASADEM (NASA/NASADEM_HGT/001), 30 m.
- Rainfall and hydrology come from NASA Giovanni instead (bekem/nasa/giovanni.py).
- Land surface temperature: MODIS MOD11A2 v061, daytime, 1 km.
- Vegetation: MODIS MOD13Q1 v061 NDVI, 250 m.
- Landslide susceptibility (optional): NASA Global Landslide Susceptibility Map, uploaded as an asset.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from datetime import date
from pathlib import Path

from ..config import BASE_DIR, Settings
from .base import JRC_LAST_YEAR, RawMetrics

log = logging.getLogger(__name__)

NODATA = -9999  # sentinel for "Earth Engine returned nothing"; becomes None client-side
FIRST_YEAR = 2000

_init_lock = threading.Lock()
_initialized = False


def init_earth_engine(settings: Settings) -> None:
    global _initialized
    import ee

    with _init_lock:
        if _initialized:
            return
        project = settings.ee_project or None
        if settings.ee_service_account_key_json or settings.ee_service_account_key:
            key_path = Path(settings.ee_service_account_key)
            if settings.ee_service_account_key and not key_path.is_absolute():
                key_path = BASE_DIR / key_path  # relative paths are relative to backend/
            key_data = settings.ee_service_account_key_json or key_path.read_text()
            info = json.loads(key_data)
            creds = ee.ServiceAccountCredentials(info["client_email"], key_data=key_data)
            ee.Initialize(credentials=creds, project=project or info.get("project_id"))
        else:
            # Uses credentials saved by `earthengine authenticate`.
            ee.Initialize(project=project)
        ee.data.setDeadline(settings.ee_timeout_s * 1000)
        _initialized = True
        log.info("Earth Engine initialised (project=%s)", project)


def explain_ee_error(exc: Exception) -> str:
    """Turn an Earth Engine error into one instruction a beginner can follow."""
    msg = str(exc)
    low = msg.lower()
    if "authorize" in low or "authenticate" in low or "credentials" in low:
        return "Not logged in to Earth Engine. Run: earthengine authenticate"
    if "does not have required permission to use project" in low:
        return (
            "Your Google login can't use this project. Usually one of: (1) the project ID in BEKEM_EE_PROJECT has a typo; "
            "(2) the project belongs to a different Google account than the one you picked in `earthengine authenticate` "
            "(fix: .\\.venv\\Scripts\\earthengine.exe authenticate --force and pick the project owner's account); "
            "(3) the project was created minutes ago (wait 5 min). Check at https://console.cloud.google.com/home/dashboard"
        )
    if "not registered" in low or "no project" in low or ("project" in low and "not found" in low):
        return (
            "Your Google Cloud project is not registered for Earth Engine. Register it (free, noncommercial) at "
            "https://code.earthengine.google.com/register and put its id in BEKEM_EE_PROJECT in backend/.env"
        )
    if "has not been used" in low or "is disabled" in low or "permission_denied" in low or "permission denied" in low:
        return (
            "The Earth Engine API is not enabled for this project, or your account lacks access. Enable it at "
            "https://console.cloud.google.com/apis/library/earthengine.googleapis.com"
        )
    if "quota" in low or "too many" in low:
        return "Earth Engine is rate-limiting this project. Wait a minute and try again."
    return msg


def _last_complete_season(end_month: int, end_day: int = 1, lag_days: int = 30) -> int:
    """Latest year whose season ending at (end_month, end_day) is over and likely processed."""
    today = date.today()
    end = date(today.year, end_month, end_day)
    return today.year if (today - end).days >= lag_days else today.year - 1


class EarthEngineProvider:
    name = "earthengine"

    def __init__(self, settings: Settings):
        self.settings = settings
        init_earth_engine(settings)

    def fetch(self, lat: float, lon: float, radius_m: int) -> RawMetrics:
        import ee

        point = ee.Geometry.Point([lon, lat])
        circle = point.buffer(radius_m)
        near = point.buffer(45)
        surround = point.buffer(1000)
        upslope = point.buffer(1500)

        dem = ee.Image("NASA/NASADEM_HGT/001").select("elevation")
        slope = ee.Terrain.slope(dem)

        def num(d, key):
            return ee.Dictionary(d).get(key, NODATA)

        out: dict = {}

        # --- Terrain -------------------------------------------------------------------
        out["elev_point"] = num(dem.reduceRegion(ee.Reducer.mean(), near, 30), "elevation")
        out["elev_surround"] = num(dem.reduceRegion(ee.Reducer.median(), surround, 30), "elevation")
        slope_stats = slope.reduceRegion(
            ee.Reducer.percentile([90]).combine(ee.Reducer.mean(), sharedInputs=True), circle, 30
        )
        out["slope_p90"] = num(slope_stats, "slope_p90")
        out["slope_mean"] = num(slope_stats, "slope_mean")
        upslope_stats = slope.reduceRegion(
            ee.Reducer.percentile([95]).combine(ee.Reducer.max(), sharedInputs=True), upslope, 30
        )
        out["upslope_p95"] = num(upslope_stats, "slope_p95")

        if self.settings.landslide_asset:
            ls = ee.Image(self.settings.landslide_asset).select(0).rename("cls")
            out["landslide"] = num(ls.reduceRegion(ee.Reducer.max(), circle.buffer(500), 1000), "cls")

        # --- Water history -------------------------------------------------------------
        last_water = _last_complete_season(11)
        jrc = ee.ImageCollection("JRC/GSW1_4/YearlyHistory")
        water = {}
        for y in range(FIRST_YEAR, min(JRC_LAST_YEAR, last_water) + 1):
            # YearlyHistory only stores pixels that were water at some point; masked = land (class 1).
            # Class 0 = not observed that year, so it is the only thing left out of the fraction.
            wc = jrc.filter(ee.Filter.eq("year", y)).first().select("waterClass").unmask(1)
            img = wc.gte(2).updateMask(wc.gt(0)).rename("water")
            water[str(y)] = num(img.reduceRegion(ee.Reducer.mean(), circle, 30), "water")

        l89 = (
            ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
            .merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
            .filterBounds(circle)
        )

        def landsat_water(img):
            # QA_PIXEL bits: 1 dilated cloud, 2 cirrus, 3 cloud, 4 cloud shadow, 5 snow.
            clear = img.select("QA_PIXEL").bitwiseAnd(0b111110).eq(0)
            g = img.select("SR_B3").multiply(0.0000275).add(-0.2)
            s = img.select("SR_B6").multiply(0.0000275).add(-0.2)
            return g.subtract(s).divide(g.add(s)).gt(0).rename("water").updateMask(clear)

        for y in range(JRC_LAST_YEAR + 1, last_water + 1):
            freq = l89.filterDate(f"{y}-03-01", f"{y}-11-01").map(landsat_water).mean()
            # Water in >=20% of clear looks counts as water that year; steep slopes (>15 deg)
            # are terrain shadow, not water.
            img = freq.gte(0.2).where(slope.gt(15), 0).rename("water")
            water[str(y)] = num(img.reduceRegion(ee.Reducer.mean(), circle, 30), "water")
        out["water"] = ee.Dictionary(water)

        # --- Summer land surface temperature (MODIS, 1 km: sample the containing pixel) -
        lst_col = ee.ImageCollection("MODIS/061/MOD11A2").select("LST_Day_1km")
        lst = {}
        for y in range(FIRST_YEAR, _last_complete_season(9) + 1):
            img = lst_col.filterDate(f"{y}-06-01", f"{y}-09-01").mean().multiply(0.02).subtract(273.15)
            lst[str(y)] = num(img.reduceRegion(ee.Reducer.first(), point, 1000), "LST_Day_1km")
        out["lst"] = ee.Dictionary(lst)

        # --- Growing-season NDVI (MODIS, 250 m) -----------------------------------------
        ndvi_col = ee.ImageCollection("MODIS/061/MOD13Q1").select("NDVI")
        ndvi = {}
        for y in range(FIRST_YEAR, _last_complete_season(10) + 1):
            img = ndvi_col.filterDate(f"{y}-05-01", f"{y}-10-01").mean().multiply(0.0001)
            ndvi[str(y)] = num(img.reduceRegion(ee.Reducer.mean(), circle.buffer(100), 250), "NDVI")
        out["ndvi"] = ee.Dictionary(ndvi)

        graph = ee.Dictionary(out)
        try:
            res = graph.getInfo()
        except ee.EEException as e:
            if not _is_transient(e):
                raise
            log.warning("Earth Engine hiccup (%s), retrying once", e)
            time.sleep(2)
            res = graph.getInfo()
        return _to_metrics(res)


def _is_transient(e: Exception) -> bool:
    low = str(e).lower()
    return any(k in low for k in ("deadline", "timed out", "timeout", "internal error", "503", "500", "unavailable", "too many concurrent"))


def _clean(v) -> float | None:
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return None if v <= NODATA + 1 else v


def _series(d: dict, scale: float = 1.0, digits: int = 3) -> dict[int, float | None]:
    out = {}
    for y, v in sorted(d.items(), key=lambda kv: int(kv[0])):
        c = _clean(v)
        out[int(y)] = None if c is None else round(c * scale, digits)
    return out


def _to_metrics(res: dict) -> RawMetrics:

    ls = _clean(res.get("landslide"))
    return RawMetrics(
        water_fraction=_series(res.get("water", {}), scale=100.0, digits=2),
        elev_point_m=_clean(res.get("elev_point")),
        elev_surround_m=_clean(res.get("elev_surround")),
        slope_p90_deg=_clean(res.get("slope_p90")),
        slope_mean_deg=_clean(res.get("slope_mean")),
        upslope_p95_deg=_clean(res.get("upslope_p95")),
        landslide_class=int(round(ls)) if ls is not None and 1 <= ls <= 5 else None,
        lst_summer_c=_series(res.get("lst", {}), digits=2),
        ndvi_season=_series(res.get("ndvi", {}), digits=4),
    )
