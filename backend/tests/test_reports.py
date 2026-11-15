"""Advanced reports: numbered, kept with a fingerprint, checkable by anyone, the data only for the owner."""

import pytest
from fastapi.testclient import TestClient

from bekem.main import _fingerprint, app, settings

DANA = {"Authorization": "Bearer dev:dana-reports:dana@example.com"}
EVE = {"Authorization": "Bearer dev:eve-reports:eve@example.com"}
POINT = {"lat": 42.8240, "lon": 74.6040, "lang": "ru"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_a_few_reports_without_an_account_then_sign_in(client, monkeypatch):
    """Without an account: 3 reports a day per visitor, kept under their numbers; the 4th asks to sign in."""
    from bekem import main

    monkeypatch.setattr(main, "_daily", {})
    ip = {"x-forwarded-for": "203.0.113.200"}
    made = [client.post("/api/reports", json=POINT, headers=ip) for _ in range(3)]
    assert [r.status_code for r in made] == [200, 200, 200]
    assert "report" in made[0].json()
    # Anyone can check it by its number; with no owner, nobody gets the data back from it.
    check = client.get(f"/api/reports/{made[0].json()['id']}").json()
    assert "report" not in check and check["id"] == made[0].json()["id"]
    refused = client.post("/api/reports", json=POINT, headers=ip)
    assert refused.status_code == 429 and refused.json()["detail"] == {"code": "reports_sign_in", "limit": 3}
    # Another visitor still has theirs, and a signed-in user is not counted against it.
    assert client.post("/api/reports", json=POINT, headers={"x-forwarded-for": "203.0.113.201"}).status_code == 200


def test_only_in_kyrgyzstan(client):
    assert client.post("/api/reports", headers=DANA, json={**POINT, "lat": 55.75, "lon": 37.61}).status_code == 422


def test_report_is_numbered_kept_and_checkable(client):
    r = client.post("/api/reports", headers=DANA, json=POINT)
    assert r.status_code == 200
    made = r.json()
    assert made["id"].startswith("DW-") and len(made["id"]) == len("DW-2026-ABCDEF")
    assert set(made["grades"]) == {"green", "heat", "flood", "landslide", "earthquake"}
    # The fingerprint is of the data handed back, so it can be checked against it.
    assert made["fingerprint"] == _fingerprint(made["report"])
    # The fault's whole outline is not kept.
    quake = next(c for c in made["report"]["checks"] if c["id"] == "earthquake")
    assert "fault_geometry" not in (quake.get("metrics") or {})

    # Anyone can check it, without the data and without knowing who made it.
    public = client.get(f"/api/reports/{made['id']}").json()
    assert public["fingerprint"] == made["fingerprint"] and "report" not in public and "uid" not in public
    assert client.get(f"/api/reports/{made['id']}", headers=EVE).json().get("report") is None
    # Its owner gets the data back, exactly as it was.
    mine = client.get(f"/api/reports/{made['id']}", headers=DANA).json()
    assert _fingerprint(mine["report"]) == made["fingerprint"]
    # And it is in the owner's list.
    assert client.get("/api/me/reports", headers=DANA).json()["reports"][0]["id"] == made["id"]


def test_unknown_and_malformed_numbers(client):
    assert client.get("/api/reports/DW-2026-ZZZZZZ").status_code == 404
    assert client.get("/api/reports/not-a-number").status_code == 422


def test_daily_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "reports_per_day", 2)
    frank = {"Authorization": "Bearer dev:frank-reports:frank@example.com"}
    assert [client.post("/api/reports", headers=frank, json=POINT).status_code for _ in range(3)] == [200, 200, 429]


def test_deleting_the_account_keeps_the_report_checkable(client):
    gil = {"Authorization": "Bearer dev:gil-reports:gil@example.com"}
    made = client.post("/api/reports", headers=gil, json=POINT).json()
    client.delete("/api/me", headers=gil)
    assert client.get(f"/api/reports/{made['id']}").status_code == 200
    assert client.get("/api/me/reports", headers=gil).json() == {"reports": []}


def test_reports_have_their_own_rate_limit(client, monkeypatch):
    """Tapping round the map cannot pile up satellite work: a few reports a minute per visitor, then 429."""
    from bekem import main

    monkeypatch.setattr(main.settings, "report_rate_limit_per_min", 2)
    ip = {"x-forwarded-for": "203.0.113.150"}
    codes = [client.get("/api/report", params={"lat": 42.87, "lon": 74.6}, headers=ip).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    other = {"x-forwarded-for": "203.0.113.151"}
    assert client.get("/api/report", params={"lat": 42.87, "lon": 74.6}, headers=other).status_code == 200
