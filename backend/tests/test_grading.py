from bekem.faults import FaultHit
from bekem.grading import grade_all, grade_earthquake, grade_flood, grade_green, grade_heat, grade_landslide, mood
from bekem.i18n import LANGS, TEXTS, missing_translations, t
from bekem.providers.base import RawMetrics

YEARS = range(2000, 2026)


def metrics(**kw) -> RawMetrics:
    base = dict(
        water_fraction={y: 0.0 for y in YEARS},
        elev_point_m=800.0,
        elev_surround_m=800.0,
        slope_p90_deg=3.0,
        slope_mean_deg=2.0,
        upslope_p95_deg=5.0,
        lst_summer_c={y: 35.0 for y in YEARS},
        ndvi_season={y: 0.4 for y in YEARS},
    )
    base.update(kw)
    return RawMetrics(**base)


def hit(km: float) -> FaultHit:
    return FaultHit(km, "Issyk Atta Fault", "Reverse", "GAF_684", (74.6, 42.8), [[[74.5, 42.8], [74.7, 42.8]]])


def wet(n: int, pct: float = 5.0) -> dict:
    return {y: (pct if i < n else 0.0) for i, y in enumerate(YEARS)}


def test_flood_buckets_by_years_with_water():
    assert grade_flood(metrics(), 300).grade == "A"
    assert grade_flood(metrics(water_fraction=wet(2)), 300).grade == "B"
    assert grade_flood(metrics(water_fraction=wet(5)), 300).grade == "C"
    assert grade_flood(metrics(water_fraction=wet(6)), 300).grade == "D"


def test_tiny_water_patches_do_not_count():
    assert grade_flood(metrics(water_fraction=wet(10, pct=0.5)), 300).grade == "A"


def test_low_lying_with_water_is_one_grade_worse():
    r = grade_flood(metrics(water_fraction=wet(4), elev_point_m=790.0), 300)
    assert r.grade == "D"
    assert r.metrics["low_lying"]
    assert "lower than the land around it" in t(*r.messages[1][:1], **r.messages[1][1])


def test_low_lying_without_water_stays():
    assert grade_flood(metrics(elev_point_m=790.0), 300).grade == "A"


def test_mudflow_path_is_at_least_c():
    r = grade_flood(metrics(elev_point_m=798.0, upslope_p95_deg=30.0), 300)
    assert r.grade == "C" and r.metrics["mudflow_path"]


def test_flood_without_enough_data_has_no_grade():
    r = grade_flood(metrics(water_fraction={2000: 1.0}), 300)
    assert r.grade is None and r.messages[0][0] == "nodata"


def test_landslide_slope_buckets():
    assert grade_landslide(metrics(slope_p90_deg=3)).grade == "A"
    assert grade_landslide(metrics(slope_p90_deg=10)).grade == "B"
    assert grade_landslide(metrics(slope_p90_deg=20)).grade == "C"
    assert grade_landslide(metrics(slope_p90_deg=31)).grade == "D"


def test_landslide_susceptibility_capped_on_flat_ground():
    assert grade_landslide(metrics(slope_p90_deg=3, landslide_class=5)).grade == "B"
    assert grade_landslide(metrics(slope_p90_deg=10, landslide_class=5)).grade == "D"


def test_landslide_runout_from_steep_land_above():
    assert grade_landslide(metrics(slope_p90_deg=3, upslope_p95_deg=35)).grade == "B"


def test_earthquake_distance_rules():
    assert grade_earthquake(hit(1.8)).grade == "D"
    assert grade_earthquake(hit(2.0)).grade == "C"
    assert grade_earthquake(hit(4.9)).grade == "C"
    assert grade_earthquake(hit(7)).grade == "B"
    assert grade_earthquake(hit(10.5)).grade == "A"
    assert grade_earthquake(None).grade == "A"
    r = grade_earthquake(hit(1.8))
    assert t(*r.messages[0][:1], **r.messages[0][1]) == "1.8 km from an active fault (Issyk Atta Fault)."


def test_heat_significant_warming_of_2_3_degrees_is_c():
    lst = {y: 30 + 0.092 * (y - 2000) for y in YEARS}  # +2.3 C over 2000-2025
    r = grade_heat(metrics(lst_summer_c=lst))
    assert r.grade == "C"
    assert r.messages[0] == ("heat.up_sig", {"change": 2.3, "start": 2000})
    assert r.series[0].trend.significant


def test_heat_flat_is_a():
    assert grade_heat(metrics()).grade == "A"


def test_green_loss_grades():
    assert grade_green(metrics()).grade == "A"
    loss_30 = {y: 0.5 - 0.006 * (y - 2000) for y in YEARS}  # -0.15 of 0.5 = -30%
    r = grade_green(metrics(ndvi_season=loss_30))
    assert r.grade == "D" and r.messages[0][0] == "green.down"
    loss_5 = {y: 0.5 - 0.001 * (y - 2000) for y in YEARS}
    assert grade_green(metrics(ndvi_season=loss_5)).grade == "B"


def test_moods():
    checks, m = grade_all(metrics(), None, 300)
    assert m == "relaxed"
    _, m = grade_all(metrics(), hit(1.0), 300)
    assert m == "alert"  # earthquake D alone -> alert, not whistling
    _, m = grade_all(metrics(water_fraction=wet(8)), None, 300)
    assert m == "whistling"
    assert mood([]) == "relaxed"


def test_every_string_is_translated():
    assert missing_translations() == []
    for key in TEXTS:
        for lang in LANGS:
            t(key, lang, n=1, total=2, radius=300, drop=5, slope=10, cls="@susc.3", km=2, name="X", change=1, start=2000, pct=10, first=2000, last=2025)


def test_flood_text_states_the_real_year_span():
    water = {y: 0.0 for y in range(2003, 2026)}
    r = grade_flood(metrics(water_fraction=water), 300)
    assert t(r.messages[0][0], "en", **r.messages[0][1]) == (
        "Satellites never saw water within 300 m in 23 years observed (2003–2025)."
    )
    assert "(2003–2025)" in t(r.messages[0][0], "ru", **r.messages[0][1])
    sources = {p["year"]: p["source"] for p in r.series[0].points}
    assert sources[2021] == "jrc" and sources[2022] == "landsat_own"


def test_product_wording_rules():
    import re

    forbidden = {
        "en": re.compile(r"(plot|safe|unsafe|danger|dangerous)", re.I),
        "ru": re.compile(r"участ|опасн", re.I),
        "ky": re.compile(r"коопсуз|коркунуч", re.I),
    }
    for key, entry in TEXTS.items():
        for lang, rule in forbidden.items():
            assert not rule.search(entry[lang]), f"{key}:{lang}: {entry[lang]}"
    for key in ("disclaimer", "verify.appeears.pending", "signup.prompt"):
        for lang in LANGS:
            assert "bekem" not in TEXTS[key][lang].lower() and "бекем" not in TEXTS[key][lang].lower(), key


def test_place_name_from_openstreetmap():
    from bekem.geocode import parse_place

    bishkek = {"name": "Асанбай кичирайону", "addresstype": "quarter", "address": {
        "quarter": "Асанбай кичирайону", "city": "Бишкек шаары", "country": "Кыргызстан", "country_code": "kg"}}
    p = parse_place(bishkek)
    assert p["display"] == "Асанбай кичирайону, Бишкек шаары" and p["attribution"] == "© OpenStreetMap contributors"
    town = {"name": "Кара-Суу", "address": {"town": "Кара-Суу", "state": "Ошская область", "country": "Кыргызстан"}}
    assert parse_place(town)["display"] == "Кара-Суу, Ошская область"
    assert parse_place({"address": {}}) is None


def test_open_water_gets_no_flood_grade_and_no_whistle():
    lake = {y: 97.0 for y in YEARS}
    r = grade_flood(metrics(water_fraction=lake), 300)
    assert r.grade is None and r.metrics["water_body"] is True
    assert r.messages[0] == ("flood.water_body", {"pct": 97, "radius": 300})
    _, m = grade_all(metrics(water_fraction=lake), None, 300)
    assert m == "relaxed"  # the lake itself does not make Bekem whistle
    shore = {y: 9.5 for y in YEARS}  # a shoreline circle: water every year, but mostly land
    assert grade_flood(metrics(water_fraction=shore), 300).grade == "D"
