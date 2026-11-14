"""Giovanni, NOAA and AppEEARS: parsing, rules and failure handling. No network."""

from datetime import date, timedelta

from bekem.cache import Cache
from bekem.config import get_settings
from bekem.i18n import t
from bekem.nasa.appeears import AppEEARSManager, parse_results
from bekem.nasa.giovanni import parse_csv, rain_by_year, runoff_peak_by_year, soil_by_year
from bekem.nasa.noaa import Station, nearest_station, parse_summer_tmax
from bekem.providers.mock import MockProvider
from bekem.report import ReportService
from bekem.stats import trend
from bekem.verification import appeears_same_data_check, mod44w_check, station_check

GIOVANNI_CSV = """prod_name,GPM_3IMERGDF.07
unit,mm/day
undef,-9999.9
lat,40.75

Timestamp (UTC),Data
2024-03-01 00:00,0
2024-03-02 00:00,1.11
2024-03-03 00:00,-9999.9
2024-03-04 00:00,0.045
"""


def test_giovanni_csv_skips_header_and_undef():
    rows = parse_csv(GIOVANNI_CSV)
    assert [v for _, v in rows] == [0.0, 1.11, 0.045]
    assert rows[1][0].day == 2


def daily(year, value_fn, start=(3, 1), end=(9, 30)):
    d, out = date(year, *start), []
    while d <= date(year, *end):
        out.append((d, value_fn(d)))
        d += timedelta(days=1)
    from datetime import datetime

    return [(datetime(x.year, x.month, x.day), v) for x, v in out]


def test_rain_season_total_and_wettest_day_need_complete_seasons():
    full = daily(2020, lambda d: 30.0 if d == date(2020, 5, 5) else 1.0)
    partial = daily(2021, lambda d: 1.0, end=(5, 1))
    total, wettest = rain_by_year(full + partial)
    assert total == {2020: round(213 * 1.0 + 30.0, 1)}
    assert wettest == {2020: 30.0}


def test_runoff_peak_converts_3h_mean_to_monthly_mm_and_soil_mean():
    from datetime import datetime

    months = [(datetime(2020, m, 1), 0.01 * m) for m in range(1, 13)]
    peak = runoff_peak_by_year(months)
    assert peak == {2020: round(0.09 * 8 * 30, 2)}  # September is wettest: 0.09 kg/m2 per 3 h, 30 days
    assert soil_by_year(months) == {2020: round(sum(0.01 * m for m in range(5, 10)) / 5, 2)}


def test_noaa_summer_tmax_requires_all_three_months():
    recs = [
        {"DATE": "2020-06", "TMAX": "30"}, {"DATE": "2020-07", "TMAX": "33"}, {"DATE": "2020-08", "TMAX": "33"},
        {"DATE": "2021-06", "TMAX": "31"}, {"DATE": "2021-07", "TMAX": ""},
        {"DATE": "2021-12", "TMAX": "1"},
    ]
    assert parse_summer_tmax(recs) == {2020: 32.0}


def test_nearest_station_respects_distance_and_height():
    bishkek = nearest_station(42.875, 74.60, 760)
    assert bishkek and bishkek.name == "Bishkek" and bishkek.distance_km < 10
    high_plot = nearest_station(42.875, 74.60, 2500)  # Bishkek station is at 756 m: too different
    assert high_plot is None or high_plot.name != "Bishkek"
    assert nearest_station(51.5, -0.12, 20) is None  # outside Kyrgyzstan: unavailable, not an error


def test_station_check_compares_direction_only():
    years = list(range(2000, 2025))
    warming = {y: 30 + 0.1 * (y - 2000) for y in years}
    sat = trend(years, [40 + 0.2 * (y - 2000) for y in years])
    st = Station("KG1", "Bishkek", 42.83, 74.58, 756, 4.2)
    ok = station_check(st, warming, sat)
    assert ok["status"] == "agrees" and ok["independent"]
    assert "air" in t(ok["key"], "en", **ok["params"]) and "rising" in t(ok["key"], "en", **ok["params"])
    flat = {y: 30.0 + (0.5 if y % 2 else -0.5) for y in years}
    assert station_check(st, flat, sat)["status"] == "differs"
    assert station_check(None, None, sat)["status"] == "unavailable"


def test_appeears_check_is_labelled_same_data_not_independent():
    years = list(range(2000, 2025))
    series = {y: 0.5 - 0.004 * (y - 2000) for y in years}
    ours = trend(years, list(series.values()))
    v = appeears_same_data_check("mod13q1", series, ours, "NDVI", "done")
    assert v["status"] == "same" and v["independent"] is False
    assert "same MODIS data" in t(v["key"], "en", **v["params"])
    assert appeears_same_data_check("mod13q1", None, ours, "NDVI", "pending")["status"] == "pending"


def test_mod44w_is_independent_and_states_its_span():
    v = mod44w_check({y: 0 for y in range(2000, 2026)}, 0, "done")
    assert v["status"] == "agrees" and v["independent"]
    assert "(2000–2025)" in t(v["key"], "en", **v["params"])
    assert mod44w_check({2000: 1, 2001: 0}, 0, "done")["status"] == "differs"


APPEEARS_LST = "ID,Latitude,Longitude,Date,MOD11A2_061_LST_Day_1km\n" + "".join(
    f"{pid},42.8,74.6,{y}-{m:02d}-{d:02d},{300 + (y - 2000) * 0.1 if pid == 'c' else 0}\n"
    for y in (2001, 2002) for m in (6, 7, 8) for d in (1, 9, 17) for pid in ("c", "n")
)
APPEEARS_NDVI = "ID,Latitude,Longitude,Date,MOD13Q1_061__250m_16_days_NDVI\n" + "".join(
    f"{pid},42.8,74.6,{y}-{m:02d}-01,0.4\n" for y in (2001,) for m in range(5, 10) for pid in "cnesw"
)
APPEEARS_WATER = "ID,Latitude,Longitude,Date,MOD44W_061_water_mask\n" + "".join(
    f"{pid},42.8,74.6,{y}-01-01,{1 if (y == 2005 and pid == 'e') else 0}\n" for y in range(2000, 2010) for pid in "cnesw"
)


def test_parse_appeears_results():
    r = parse_results([APPEEARS_LST, APPEEARS_NDVI, APPEEARS_WATER])
    assert r["lst"] == {2001: round(300.1 - 273.15, 2), 2002: round(300.2 - 273.15, 2)}  # centre pixel only, K -> C
    assert r["ndvi"] == {2001: 0.4}
    assert r["water"][2005] == 1 and sum(r["water"].values()) == 1


def test_appeears_manager_states(tmp_path):
    m = AppEEARSManager(Cache(tmp_path / "c.sqlite3", 3600), "u", "p")
    assert m.get(42.8, 74.6) == ("unavailable", None)
    m.track(42.8, 74.6, "task-1")
    assert m.get(42.8, 74.6) == ("pending", None) and m.pending_count() == 1
    m.import_done(42.8, 74.6, {"lst": {2001: 27.0}, "ndvi": {}, "water": {2001: 0}})
    status, result = m.get(42.8, 74.6)
    assert status == "done" and result["lst"] == {2001: 27.0}


class BrokenGiovanni:
    def fetch(self, lat, lon):
        raise RuntimeError("Giovanni is down")


def test_report_survives_a_failing_extra(tmp_path):
    s = get_settings()
    svc = ReportService(s, MockProvider(), Cache(tmp_path / "c.sqlite3", 3600), giovanni=BrokenGiovanni())
    r = svc.build(42.8, 74.6)
    assert r["extras"]["giovanni"] == "unavailable"
    assert [c["id"] for c in r["checks"]] == ["flood", "landslide", "earthquake", "heat", "green"]
