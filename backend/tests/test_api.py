import pytest
from fastapi.testclient import TestClient

from bekem.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health").json()
    assert r["status"] == "ok" and r["provider"] == "mock"


def test_report_shape(client):
    r = client.get("/api/report", params={"lat": 42.815, "lon": 74.62, "lang": "ru"})
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "mock"
    assert body["mood"]["id"] in {"relaxed", "alert", "whistling"}
    assert [c["id"] for c in body["checks"]] == ["flood", "landslide", "earthquake", "heat", "green"]
    eq = next(c for c in body["checks"] if c["id"] == "earthquake")
    assert eq["grade"] == "D"  # real GEM fault data even in mock mode
    assert "Issyk Atta" in eq["summary"] and "км" in eq["summary"]
    heat = next(c for c in body["checks"] if c["id"] == "heat")
    s = heat["series"][0]
    assert len(s["points"]) >= 20 and len(s["trend"]["line"]) == 2


def test_report_is_cached_and_snapped(client):
    client.get("/api/report", params={"lat": 42.0001, "lon": 75.0001})
    r = client.get("/api/report", params={"lat": 42.0002, "lon": 75.0002}).json()
    assert r["cached"] and r["location"] == {"lat": 42.0, "lon": 75.0, "radius_m": 300, "place": None}


def test_report_outside_kyrgyzstan(client):
    r = client.get("/api/report", params={"lat": 51.5, "lon": -0.12})
    assert r.status_code == 422


def test_report_bad_lang(client):
    assert client.get("/api/report", params={"lat": 42.8, "lon": 74.6, "lang": "de"}).status_code == 422


def test_faults_and_demo_and_methodology(client):
    f = client.get("/api/faults", params={"bbox": "74,42.5,75,43"}).json()
    assert any(ft["properties"]["name"] == "Issyk Atta Fault" for ft in f["features"])
    assert client.get("/api/faults", params={"bbox": "nope"}).status_code == 422
    demo = client.get("/api/demo", params={"lang": "ky"}).json()["plots"]
    assert len(demo) == 3
    m = client.get("/api/methodology").json()
    assert "300 m" in m["checks"]["flood"]["rules"][0]
    assert client.get("/api/i18n", params={"lang": "ky"}).json()["check.flood"] == "Суу ташкыны/сел"


def test_every_series_has_a_resolution_badge_and_sources_are_flagged(client):
    body = client.get("/api/report", params={"lat": 41.5, "lon": 75.5}).json()
    for check in body["checks"]:
        for series in check["series"]:
            assert series["resolution_m"] > 0 and series["source_id"]
    assert all("nasa" in s and "resolution" in s for s in body["sources"])
    assert {s["id"] for s in body["sources"] if not s["nasa"]} == {"gem_faults", "noaa_ghcn", "osm"}


def test_live_server_hides_internals_and_ignores_refresh(client, monkeypatch):
    from bekem import main

    monkeypatch.setenv("K_SERVICE", "bekem-api")  # pretend to be Cloud Run
    monkeypatch.setattr(main.state, "provider_error", "secret internal detail: project xyz, key abc")
    assert client.get("/api/health").json()["provider_error"] is None

    seen = {}
    real_build = main.state.service.build
    monkeypatch.setattr(main.state.service, "build", lambda lat, lon, lang, refresh=False: seen.update(refresh=refresh) or real_build(lat, lon, lang))
    client.get("/api/report", params={"lat": 42.8, "lon": 74.6, "refresh": "true"})
    assert seen["refresh"] is False


def test_profile_fields_have_size_limits(client):
    r = client.put("/api/me/profile", headers={"Authorization": "Bearer dev:big:big@example.com"},
                   json={"country": "KG", "phone": "1" * 5000, "purpose": "build"})
    assert r.status_code == 422


def test_every_source_id_in_a_report_is_listed_in_sources(client):
    from bekem.nasa.noaa import Station
    from bekem.stats import trend
    from bekem.verification import appeears_same_data_check, mod44w_check, station_check

    body = client.get("/api/report", params={"lat": 41.9, "lon": 75.1}).json()
    known = {s["id"] for s in body["sources"]}
    used = set()
    for c in body["checks"]:
        assert c["source_ids"], c["id"]  # every grade names its sources, landslide and earthquake included
        used |= set(c["source_ids"])
        used |= {s["source_id"] for s in c["series"]}
    assert "nasadem" in next(c for c in body["checks"] if c["id"] == "flood")["source_ids"]
    years = list(range(2000, 2025))
    tr = trend(years, [float(y) for y in years])
    series = {y: float(y) for y in years}
    for v in (
        station_check(Station("KG1", "X", 0, 0, 0, 1.0), series, tr), station_check(None, None, tr),
        appeears_same_data_check("mod11a2", series, tr, "°C", "done"), mod44w_check({2000: 0}, 0, "done"),
    ):
        used.add(v["source_id"])
        if "series" in v:
            used.add(v["series"]["source_id"])
    assert used <= known, used - known


def test_app_languages_fall_back_to_en_ru_ky(client):
    r = client.get("/api/report", params={"lat": 42.5, "lon": 75.5, "lang": "kk"}).json()
    assert r["lang"] == "kk" and r["text_lang"] == "ru"
    assert next(c for c in r["checks"] if c["id"] == "flood")["title"] == "Паводок/сель"
    assert client.get("/api/report", params={"lat": 42.5, "lon": 75.5, "lang": "zh"}).json()["text_lang"] == "en"
    langs = client.get("/api/languages").json()
    assert len(langs["languages"]) == 11 and langs["fallback"]["uz"] == "ru" and langs["fallback"]["ky"] == "ky"
    assert client.get("/api/report", params={"lat": 42.5, "lon": 75.5, "lang": "de"}).status_code == 422
