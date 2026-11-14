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
    assert r["cached"] and r["location"] == {"lat": 42.0, "lon": 75.0, "radius_m": 300}


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
    assert [s["id"] for s in body["sources"] if not s["nasa"]] == ["gem_faults"]
