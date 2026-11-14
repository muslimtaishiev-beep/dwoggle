"""Fixed grading rules: numbers in, A-D out. No AI, no hidden weights.

Every threshold lives in this file as a named constant and is published verbatim at
GET /api/methodology ("How we grade"), so what the app says and what the code does cannot drift.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean

from .faults import FaultHit
from .providers.base import JRC_LAST_YEAR, RawMetrics, Series
from .stats import Trend, trend

GRADES = ("A", "B", "C", "D")

# Flood / mudflow
WATER_YEAR_MIN_PCT = 1.0  # a year counts as "water seen" if >=1% of the circle was water
FLOOD_YEAR_BREAKS = (0, 2, 5)  # 0 -> A, 1-2 -> B, 3-5 -> C, 6+ -> D
LOW_LYING_M = 5.0  # plot this much below the 1 km median -> one grade worse
MUDFLOW_UPSLOPE_DEG = 25.0  # low-lying + this steep within 1.5 km -> at least C
# Landslide
SLOPE_BREAKS_DEG = (8.0, 15.0, 25.0)  # p90 slope: <8 A, 8-15 B, 15-25 C, 25+ D
RUNOUT_DEG = 30.0  # land this steep within 1.5 km -> at least B
SUSC_GRADE = {1: "A", 2: "A", 3: "B", 4: "C", 5: "D"}
# Earthquake
FAULT_BREAKS_KM = (2.0, 5.0, 10.0)  # <2 D, 2-5 C, 5-10 B, 10+ A
FAULT_SEARCH_KM = 150.0
# Heat / green
ALPHA = 0.05
HEAT_BREAKS_C = (1.0, 3.0)  # significant warming: <1 B, 1-3 C, 3+ D
GREEN_BREAKS_PCT = (10.0, 25.0)  # significant NDVI loss: <10% B, 10-25% C, 25%+ D
BARE_NDVI = 0.15


# Pixel size and source of every chart, shown as a badge so coarse data is never mistaken for plot-level data.
SERIES_META = {
    "water": {"resolution_m": 30, "source_id": "landsat_water"},
    "rain": {"resolution_m": 11000, "source_id": "giovanni_imerg"},
    "rain_max": {"resolution_m": 11000, "source_id": "giovanni_imerg"},
    "runoff": {"resolution_m": 28000, "source_id": "giovanni_gldas"},
    "soil": {"resolution_m": 28000, "source_id": "giovanni_gldas"},
    "lst": {"resolution_m": 1000, "source_id": "modis_lst"},
    "ndvi": {"resolution_m": 250, "source_id": "modis_ndvi"},
}


@dataclass
class SeriesOut:
    id: str
    unit: str
    points: list[dict]  # [{"year": 2000, "value": 1.2}, ...]
    trend: Trend | None = None


@dataclass
class CheckResult:
    id: str
    grade: str | None  # None = not enough data
    messages: list[tuple[str, dict]] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)
    series: list[SeriesOut] = field(default_factory=list)


def worsen(grade: str, steps: int = 1) -> str:
    return GRADES[min(len(GRADES) - 1, GRADES.index(grade) + steps)]


def worst(*grades: str | None) -> str | None:
    gs = [g for g in grades if g]
    return max(gs, key=GRADES.index) if gs else None


def _bucket(value: float, breaks: tuple[float, ...], grades: tuple[str, ...] = GRADES) -> str:
    """value <= breaks[0] -> grades[0], ... ; bigger than all -> last grade."""
    for b, g in zip(breaks, grades):
        if value <= b:
            return g
    return grades[len(breaks)]


def _bucket_lt(value: float, breaks: tuple[float, ...], grades: tuple[str, ...] = GRADES) -> str:
    """value < breaks[0] -> grades[0], ... (strict, for continuous thresholds)."""
    for b, g in zip(breaks, grades):
        if value < b:
            return g
    return grades[len(breaks)]


def _points(s: Series) -> list[dict]:
    return [{"year": y, "value": v} for y, v in sorted(s.items())]


def _trend(s: Series) -> Trend | None:
    ys = sorted(s)
    return trend(ys, [s[y] for y in ys], ALPHA)


def _first_year(s: Series) -> int | None:
    ys = [y for y, v in s.items() if v is not None]
    return min(ys) if ys else None


# --- Checks ---------------------------------------------------------------------------------


def grade_flood(m: RawMetrics, radius_m: int) -> CheckResult:
    years = {y: v for y, v in m.water_fraction.items() if v is not None}
    rain_trend = _trend(m.rain_season_mm)
    series = [
        SeriesOut("water", "%", [
            {**p, "source": "jrc" if p["year"] <= JRC_LAST_YEAR else "landsat_own"} for p in _points(m.water_fraction)
        ]),
        SeriesOut("rain", "mm", _points(m.rain_season_mm), rain_trend),
        SeriesOut("rain_max", "mm", _points(m.rain_max_day_mm), _trend(m.rain_max_day_mm)),
        SeriesOut("runoff", "mm", _points(m.runoff_peak_mm), _trend(m.runoff_peak_mm)),
        SeriesOut("soil", "mm", _points(m.soil_moisture_mm), _trend(m.soil_moisture_mm)),
    ]
    if len(years) < 10:
        return CheckResult("flood", None, [("nodata", {})], series=series)

    wet = sum(1 for v in years.values() if v >= WATER_YEAR_MIN_PCT)
    grade = _bucket(wet, FLOOD_YEAR_BREAKS)
    msgs: list[tuple[str, dict]] = []
    span = {"total": len(years), "first": min(years), "last": max(years), "radius": radius_m}
    msgs.append(("flood.water_years", {"n": wet, **span}) if wet else ("flood.no_water", span))

    rel = None
    if m.elev_point_m is not None and m.elev_surround_m is not None:
        rel = m.elev_point_m - m.elev_surround_m
    low = rel is not None and rel <= -LOW_LYING_M
    if low:
        msgs.append(("flood.low", {"drop": round(-rel)}))
        if wet:
            grade = worsen(grade)

    mudflow = (
        rel is not None
        and rel < 0
        and m.upslope_p95_deg is not None
        and m.upslope_p95_deg >= MUDFLOW_UPSLOPE_DEG
    )
    if mudflow:
        msgs.append(("flood.mudflow", {}))
        grade = worst(grade, "C")

    # Context from NASA Giovanni: shown only when the trend is significant, never changes the grade.
    if rain_trend and rain_trend.direction == "increasing":
        msgs.append(("flood.rain_up", {"change": round(rain_trend.change), "start": _first_year(m.rain_season_mm)}))
    wettest = series[2].trend
    if wettest and wettest.direction == "increasing":
        msgs.append(("flood.rain_extreme_up", {"change": round(wettest.change), "start": _first_year(m.rain_max_day_mm)}))
    runoff = series[3].trend
    if runoff and runoff.direction == "increasing":
        msgs.append(("flood.runoff_up", {"start": _first_year(m.runoff_peak_mm)}))

    return CheckResult(
        "flood",
        grade,
        msgs,
        metrics={
            "years_with_water": wet,
            "years_observed": len(years),
            "first_year": min(years),
            "last_year": max(years),
            "relative_elevation_m": None if rel is None else round(rel, 1),
            "low_lying": low,
            "mudflow_path": mudflow,
            "upslope_p95_slope_deg": m.upslope_p95_deg,
        },
        series=series,
    )


def grade_landslide(m: RawMetrics) -> CheckResult:
    if m.slope_p90_deg is None:
        return CheckResult("landslide", None, [("nodata", {})])
    slope_grade = _bucket_lt(m.slope_p90_deg, SLOPE_BREAKS_DEG)
    msgs: list[tuple[str, dict]] = [(f"landslide.slope.{slope_grade}", {"slope": round(m.slope_p90_deg)})]
    grade = slope_grade

    if m.landslide_class is not None:
        susc = SUSC_GRADE[m.landslide_class]
        # The NASA map is 1 km: on flat ground it can lift the grade to B at most.
        if slope_grade == "A":
            susc = min(susc, "B", key=GRADES.index)
        grade = worst(grade, susc)
        msgs.append(("landslide.susc", {"cls": f"@susc.{m.landslide_class}"}))

    runout = m.upslope_p95_deg is not None and m.upslope_p95_deg >= RUNOUT_DEG
    if runout and grade == "A":
        grade = "B"
        msgs.append(("landslide.runout", {}))

    return CheckResult(
        "landslide",
        grade,
        msgs,
        metrics={
            "slope_p90_deg": round(m.slope_p90_deg, 1),
            "slope_mean_deg": None if m.slope_mean_deg is None else round(m.slope_mean_deg, 1),
            "upslope_p95_slope_deg": m.upslope_p95_deg,
            "susceptibility_class": m.landslide_class,
        },
    )


def grade_earthquake(hit: FaultHit | None) -> CheckResult:
    if hit is None:
        return CheckResult(
            "earthquake",
            "A",
            [("eq.none", {"km": int(FAULT_SEARCH_KM)}), ("eq.advice.A", {})],
            metrics={"distance_km": None},
        )
    d = hit.distance_km
    grade = _bucket_lt(d, FAULT_BREAKS_KM, ("D", "C", "B", "A"))
    km = round(d, 1) if d < 10 else round(d)
    msgs: list[tuple[str, dict]] = [
        ("eq.near", {"km": km, "name": hit.name}) if hit.name else ("eq.near_unnamed", {"km": km}),
        (f"eq.advice.{grade}", {}),
    ]
    return CheckResult(
        "earthquake",
        grade,
        msgs,
        metrics={
            "distance_km": round(d, 2),
            "fault_name": hit.name,
            "slip_type": hit.slip_type,
            "catalog_id": hit.catalog_id,
            "nearest_point": {"lon": hit.nearest_point[0], "lat": hit.nearest_point[1]},
            "fault_geometry": {"type": "MultiLineString", "coordinates": hit.geometry},
        },
    )


def grade_heat(m: RawMetrics) -> CheckResult:
    tr = _trend(m.lst_summer_c)
    series = [SeriesOut("lst", "°C", _points(m.lst_summer_c), tr)]
    if tr is None:
        return CheckResult("heat", None, [("nodata", {})], series=series)
    start = _first_year(m.lst_summer_c)
    change = round(tr.change, 1)
    if tr.significant and tr.change > 0:
        grade = _bucket_lt(tr.change, HEAT_BREAKS_C, ("B", "C", "D"))
        msg = ("heat.up_sig", {"change": change, "start": start})
    elif tr.significant:
        grade, msg = "A", ("heat.down_sig", {"change": abs(change), "start": start})
    elif tr.change >= HEAT_BREAKS_C[0]:
        grade, msg = "B", ("heat.up_ns", {"change": change, "start": start})
    else:
        grade, msg = "A", ("heat.stable", {"start": start})
    return CheckResult(
        "heat", grade, [msg], metrics={"change_c": round(tr.change, 2), "p_value": round(tr.p_value, 4)}, series=series
    )


def grade_green(m: RawMetrics) -> CheckResult:
    tr = _trend(m.ndvi_season)
    series = [SeriesOut("ndvi", "NDVI", _points(m.ndvi_season), tr)]
    if tr is None:
        return CheckResult("green", None, [("nodata", {})], series=series)
    start = _first_year(m.ndvi_season)
    baseline = tr.intercept + tr.slope * start
    pct = (tr.change / baseline * 100) if baseline > 0 else 0.0
    avg = mean(v for v in m.ndvi_season.values() if v is not None)

    msgs: list[tuple[str, dict]] = []
    if tr.significant and tr.change < 0:
        grade = _bucket_lt(-pct, GREEN_BREAKS_PCT, ("B", "C", "D"))
        msgs.append(("green.down", {"pct": round(-pct), "start": start}))
    elif tr.significant:
        grade = "A"
        msgs.append(("green.up", {"start": start}))
    else:
        grade = "A"
        msgs.append(("green.stable", {}))
    if avg < BARE_NDVI:
        msgs.append(("green.bare", {}))
    return CheckResult(
        "green",
        grade,
        msgs,
        metrics={"change_ndvi": round(tr.change, 4), "change_pct": round(pct, 1), "mean_ndvi": round(avg, 3), "p_value": round(tr.p_value, 4)},
        series=series,
    )


def mood(checks: list[CheckResult]) -> str:
    by_id = {c.id: c.grade for c in checks}
    if "D" in (by_id.get("flood"), by_id.get("landslide")):
        return "whistling"
    if any(c.grade in ("C", "D") for c in checks):
        return "alert"
    return "relaxed"


def grade_all(m: RawMetrics, fault: FaultHit | None, radius_m: int) -> tuple[list[CheckResult], str]:
    checks = [grade_flood(m, radius_m), grade_landslide(m), grade_earthquake(fault), grade_heat(m), grade_green(m)]
    return checks, mood(checks)


# --- "How we grade" -------------------------------------------------------------------------

METHODOLOGY = {
    "flood": {
        "data": ["Landsat water history, 30 m: NASA/USGS Landsat processed by JRC GSW (2000-2021) and by Bekem with an MNDWI water test on Landsat 8/9 (2022+). The text always states the years actually observed.", "NASADEM elevation, 30 m", "NASA GPM IMERG rainfall, ~11 km"],
        "rules": [
            f"A year counts as 'water seen' if at least {WATER_YEAR_MIN_PCT:g}% of the {{radius}} m circle was water.",
            "Years with water: 0 = A, 1-2 = B, 3-5 = C, 6 or more = D.",
            f"If the plot is at least {LOW_LYING_M:g} m lower than the median ground within 1 km and water was seen, one grade worse.",
            f"If the plot sits below its surroundings and the land within 1.5 km reaches {MUDFLOW_UPSLOPE_DEG:g}° (95th percentile), at least C (mudflow path).",
            "Rainfall trend is shown for context and does not change the grade.",
        ],
    },
    "landslide": {
        "data": ["NASADEM slope (30 m)", "NASA Global Landslide Susceptibility (Stanley & Kirschbaum 2017), if configured"],
        "rules": [
            "Slope = 90th percentile inside the circle: under 8° = A, 8-15° = B, 15-25° = C, 25° or more = D.",
            "NASA susceptibility: very low/low = A, moderate = B, high = C, very high = D. The worse of slope and susceptibility wins, but on flat ground (A) susceptibility can raise it to B at most, because the map is 1 km.",
            f"If land within 1.5 km reaches {RUNOUT_DEG:g}°, at least B (material can come from above).",
        ],
    },
    "earthquake": {
        "data": ["GEM Global Active Faults Database (Styron & Pagani 2020, CC BY-SA 4.0). Not NASA data."],
        "rules": ["Distance to nearest mapped active fault: under 2 km = D, 2-5 km = C, 5-10 km = B, over 10 km = A."],
    },
    "heat": {
        "data": ["MODIS MOD11A2 daytime land surface temperature, June-August mean, 2000 to latest summer"],
        "rules": [
            f"Trend = Sen's slope; significance = Mann-Kendall test, p < {ALPHA}.",
            "Significant warming over the record: under 1°C = B, 1-3°C = C, 3°C or more = D.",
            "Not significant: A, or B if the estimated warming is 1°C or more. Significant cooling = A.",
        ],
    },
    "green": {
        "data": ["MODIS MOD13Q1 NDVI, May-September mean, 2000 to latest season"],
        "rules": [
            f"Trend = Sen's slope; significance = Mann-Kendall test, p < {ALPHA}.",
            "Significant vegetation loss: under 10% = B, 10-25% = C, 25% or more = D.",
            "Stable or significantly greener = A.",
        ],
    },
    "mood": {
        "rules": [
            "Whistling: flood or landslide is D.",
            "Alert: any check is C or D.",
            "Relaxed: everything is A or B.",
        ],
    },
}
