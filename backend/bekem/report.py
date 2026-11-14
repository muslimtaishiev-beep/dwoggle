"""Builds the report card: cache -> satellite metrics -> fault distance -> fixed rules -> localized JSON."""

from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import datetime, timezone

from .cache import Cache
from .config import Settings
from .faults import nearest_fault
from .grading import FAULT_SEARCH_KM, SERIES_META, CheckResult, SeriesOut, grade_all
from .geocode import PlaceNamer
from .i18n import Lang, t, text_lang
from .nasa.appeears import AppEEARSManager
from .nasa.giovanni import Giovanni
from .nasa.noaa import fetch_summer_tmax, nearest_station
from .providers import Provider, RawMetrics
from .verification import appeears_same_data_check, mod44w_check, station_check

log = logging.getLogger(__name__)

# Bump when provider computations change, so stale cached metrics are not reused.
METRICS_VERSION = 3

# Every id used anywhere in a report (check source_ids, series source_id, verification source_id)
# is listed here; tests/test_api.py checks that.
SOURCES = [
    {"id": "landsat_water", "name": "Landsat water history: NASA/USGS Landsat, processed by JRC Global Surface Water v1.4 (2000-2021, Pekel et al. 2016) and by Bekem from Landsat 8-9 Collection 2 (2022+)", "url": "https://global-surface-water.appspot.com/", "resolution": "30 m", "nasa": True},
    {"id": "nasadem", "name": "NASADEM elevation (NASA JPL)", "url": "https://lpdaac.usgs.gov/products/nasadem_hgtv001/", "resolution": "30 m", "nasa": True},
    {"id": "modis_lst", "name": "NASA MODIS MOD11A2 v061 land surface temperature", "url": "https://lpdaac.usgs.gov/products/mod11a2v061/", "resolution": "1 km", "nasa": True},
    {"id": "modis_ndvi", "name": "NASA MODIS MOD13Q1 v061 vegetation index", "url": "https://lpdaac.usgs.gov/products/mod13q1v061/", "resolution": "250 m", "nasa": True},
    {"id": "giovanni_imerg", "name": "NASA GPM IMERG Final Daily V07, via the NASA Giovanni Time Series API", "url": "https://giovanni.gsfc.nasa.gov/", "resolution": "~11 km", "nasa": True},
    {"id": "giovanni_gldas", "name": "NASA GLDAS Noah 2.1 monthly runoff and soil moisture, via NASA Giovanni (Hydrology Time Series)", "url": "https://disc.gsfc.nasa.gov/information/tools?title=Hydrology%20Time%20Series", "resolution": "~28 km", "nasa": True},
    {"id": "appeears", "name": "NASA AppEEARS (LP DAAC): MODIS MOD11A2 and MOD13Q1 recalculated through NASA's own tool", "url": "https://appeears.earthdatacloud.nasa.gov/", "resolution": "1 km / 250 m", "nasa": True},
    {"id": "mod44w", "name": "NASA MODIS MOD44W v061 yearly land/water mask, via AppEEARS", "url": "https://lpdaac.usgs.gov/products/mod44wv061/", "resolution": "250 m", "nasa": True},
    {"id": "landslide", "name": "NASA Global Landslide Susceptibility Map (Stanley & Kirschbaum 2017), used only if configured", "url": "https://gpm.nasa.gov/landslides/data.html", "resolution": "1 km", "nasa": True},
    {"id": "gem_faults", "name": "GEM Global Active Faults Database (Styron & Pagani 2020), CC BY-SA 4.0", "url": "https://github.com/GEMScienceTools/gem-global-active-faults", "resolution": "regional map, about ±1 km", "nasa": False},
    {"id": "noaa_ghcn", "name": "NOAA NCEI GHCN weather stations, Global Summary of the Month (the Climate Data Online archive)", "url": "https://www.ncei.noaa.gov/cdo-web/", "resolution": "station point", "nasa": False},
    {"id": "osm", "name": "Place names and address search: © OpenStreetMap contributors (ODbL), via Nominatim", "url": "https://www.openstreetmap.org/copyright", "resolution": "-", "nasa": False},
]


def snap(lat: float, lon: float) -> tuple[float, float]:
    """Round to ~100 m so nearby taps share a cache entry (the analysis circle is 300 m anyway)."""
    return round(lat, 3), round(lon, 3)


# Shared pool: a slow extra keeps running (and fills the cache) after the report has been answered.
_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="bekem")


class ReportService:
    def __init__(
        self,
        settings: Settings,
        provider: Provider,
        cache: Cache,
        giovanni: Giovanni | None = None,
        appeears: AppEEARSManager | None = None,
        places: PlaceNamer | None = None,
    ):
        self.settings = settings
        self.provider = provider
        self.cache = cache
        self.giovanni = giovanni
        self.appeears = appeears
        self.places = places
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def _key(self, lat: float, lon: float) -> str:
        return f"v{METRICS_VERSION}:{self.provider.name}:{self.settings.radius_m}:{lat:.3f}:{lon:.3f}"

    def _lock_for(self, key: str) -> threading.Lock:
        with self._locks_guard:
            return self._locks.setdefault(key, threading.Lock())

    def _cached(self, key: str, fetch, refresh: bool = False) -> tuple[dict, bool, float]:
        """Cache-or-fetch, with one fetch per key at a time (concurrent taps share it)."""
        with self._lock_for(key):
            if not refresh and (hit := self.cache.get(key)):
                return hit[0], True, hit[1]
            started = time.perf_counter()
            value = fetch()
            log.info("fetched %s in %.1fs", key, time.perf_counter() - started)
            self.cache.set(key, value)
            return value, False, time.time()

    def metrics(self, lat: float, lon: float, refresh: bool = False) -> tuple[RawMetrics, bool, float]:
        """Satellite metrics for a snapped point (Earth Engine, or mock)."""
        value, cached, computed = self._cached(
            self._key(lat, lon), lambda: self.provider.fetch(lat, lon, self.settings.radius_m).to_dict(), refresh
        )
        return RawMetrics.from_dict(value), cached, computed

    def _giovanni(self, lat: float, lon: float, refresh: bool) -> dict:
        value, _, _ = self._cached(
            f"giovanni:v1:{lat:.3f}:{lon:.3f}",
            lambda: {k: {str(y): v for y, v in s.items()} for k, s in self.giovanni.fetch(lat, lon).items()},
            refresh,
        )
        return {k: {int(y): v for y, v in s.items()} for k, s in value.items()}

    def _station_tmax(self, station_id: str) -> dict[int, float]:
        value, _, _ = self._cached(
            f"noaa:v1:{station_id}", lambda: {str(y): v for y, v in fetch_summer_tmax(station_id).items()}
        )
        return {int(y): v for y, v in value.items()}

    def build(self, lat: float, lon: float, lang: Lang = "en", refresh: bool = False) -> dict:
        lat, lon = snap(lat, lon)
        extras: dict[str, str] = {}

        gio_future = _pool.submit(self._giovanni, lat, lon, refresh) if self.giovanni else None
        place_future = _pool.submit(self.places.name, lat, lon, lang) if self.places else None
        m, cached, computed = self.metrics(lat, lon, refresh)

        if gio_future is None:
            extras["giovanni"] = "mock" if self.provider.name == "mock" else "disabled"
        else:
            try:
                gio = gio_future.result(timeout=self.settings.giovanni_timeout_s)
                m.rain_season_mm = gio["rain_season_mm"]
                m.rain_max_day_mm = gio["rain_max_day_mm"]
                m.runoff_peak_mm = gio["runoff_peak_mm"]
                m.soil_moisture_mm = gio["soil_moisture_mm"]
                extras["giovanni"] = "ok"
            except FutureTimeout:
                extras["giovanni"] = "pending"  # still running; the next request gets it from the cache
            except Exception:
                log.exception("Giovanni failed for %s,%s", lat, lon)
                extras["giovanni"] = "unavailable"

        fault = nearest_fault(self.settings.faults_path, lon, lat, FAULT_SEARCH_KM)
        checks, mood = grade_all(m, fault, self.settings.radius_m)
        verification = self._verify(lat, lon, m, checks, extras)

        place = None
        if place_future is not None:
            try:
                place = place_future.result(timeout=3)
            except Exception:  # a name is nice to have; never fail a report over it
                log.warning("no place name for %s,%s", lat, lon)

        return {
            "location": {"lat": lat, "lon": lon, "radius_m": self.settings.radius_m, "place": place},
            "lang": lang,
            "text_lang": text_lang(lang),  # the en/ru/ky our own texts are in (see /api/languages)
            "mood": {"id": mood, "title": t(f"mood.{mood}.title", lang), "line": t(f"mood.{mood}.line", lang)},
            "checks": [_render_check(c, lang, self.settings.radius_m, verification.get(c.id, [])) for c in checks],
            "disclaimer": t("disclaimer", lang),
            "sources": SOURCES,
            "provider": self.provider.name,
            "extras": extras,  # per extra source: ok | pending | unavailable | no_station | disabled | mock
            "cached": cached,
            "computed_at": datetime.fromtimestamp(computed, timezone.utc).isoformat(timespec="seconds"),
        }

    def _verify(self, lat: float, lon: float, m: RawMetrics, checks: list[CheckResult], extras: dict) -> dict:
        by_id = {c.id: c for c in checks}
        heat_trend = by_id["heat"].series[0].trend
        green_trend = by_id["green"].series[0].trend
        out: dict[str, list[dict]] = {"flood": [], "heat": [], "green": []}

        # NOAA weather station: independent ground check for heat (direction only).
        if self.settings.noaa_enabled:
            station = nearest_station(lat, lon, m.elev_point_m)
            tmax = None
            if station is None:
                extras["noaa"] = "no_station"
            else:
                try:
                    tmax = self._station_tmax(station.id)
                    extras["noaa"] = "ok"
                except Exception:
                    log.exception("NOAA failed for %s", station.id)
                    extras["noaa"] = "unavailable"
            out["heat"].append(station_check(station, tmax, heat_trend))

        # NASA AppEEARS: recalculation of MODIS heat/green + the independent MOD44W water map.
        if self.appeears is not None:
            status, result = self.appeears.get(lat, lon)
            if status == "unavailable" and self.appeears.pending_count() < self.appeears.max_pending:
                _pool.submit(self.appeears.request, lat, lon)
                status = "pending"
            extras["appeears"] = status
            result = result or {}
            wet = by_id["flood"].metrics.get("years_with_water")
            out["flood"].append(mod44w_check(result.get("water"), wet, status))
            out["heat"].append(appeears_same_data_check("mod11a2", result.get("lst"), heat_trend, "°C", status))
            out["green"].append(appeears_same_data_check("mod13q1", result.get("ndvi"), green_trend, "NDVI", status))
        return out


def _render_check(c: CheckResult, lang: Lang, radius_m: int, verification: list[dict]) -> dict:
    messages = [{"key": k, "params": p, "text": t(k, lang, **p)} for k, p in c.messages]
    return {
        "id": c.id,
        "title": t(f"check.{c.id}", lang),
        "grade": c.grade,
        "summary": " ".join(msg["text"] for msg in messages),
        "messages": messages,
        "metrics": c.metrics,
        "source_ids": c.source_ids,
        "series": [_render_series(s, lang, radius_m) for s in c.series],
        # Second opinions; they never change the grade. "independent": false = same data, different tool.
        "verification": [{**v, "text": t(v["key"], lang, **v["params"])} for v in verification],
    }


def _render_series(s: SeriesOut, lang: Lang, radius_m: int) -> dict:
    out = {
        "id": s.id,
        "label": t(f"series.{s.id}", lang, radius=radius_m),
        "unit": s.unit,
        **SERIES_META[s.id],
        "points": s.points,
        "trend": None,
    }
    if s.trend is not None:
        years = [p["year"] for p in s.points if p["value"] is not None]
        line = [{"year": y, "value": round(s.trend.intercept + s.trend.slope * y, 4)} for y in (years[0], years[-1])]
        out["trend"] = {
            **s.trend.as_dict(),
            "line": line,  # two points: draw the Sen's slope trend line between them
            "label": t("significant" if s.trend.significant else "not_significant", lang),
        }
    return out
