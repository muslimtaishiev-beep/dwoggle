"""Saved areas (per account) and Dwoggle's voice (ElevenLabs, mocked: tests never touch the network)."""

import httpx
import pytest
from fastapi.testclient import TestClient

from bekem.auth import _from_firestore, _to_firestore
from bekem.config import get_settings
from bekem.main import app, state
from bekem.voice import Voice

ALICE = {"Authorization": "Bearer dev:alice-saved:alice@example.com"}
BOB = {"Authorization": "Bearer dev:bob-saved:bob@example.com"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_firestore_keeps_numbers_and_maps():
    area = {"lat": 42.82401, "lon": 74.60401, "name": None, "saved_at": "2026-11-15T10:00:00+00:00"}
    assert _from_firestore(_to_firestore([area])) == [area]


def test_saved_areas_need_sign_in(client):
    assert client.get("/api/me/saved").status_code == 401


def test_saved_areas_per_account(client):
    assert client.get("/api/me/saved", headers=ALICE).json() == {"areas": []}
    client.put("/api/me/saved", headers=ALICE, json={"lat": 42.8240, "lon": 74.6040, "name": "Bishkek"})
    client.put("/api/me/saved", headers=ALICE, json={"lat": 40.5283, "lon": 72.7985, "name": None})
    areas = client.get("/api/me/saved", headers=ALICE).json()["areas"]
    assert [a["name"] for a in areas] == [None, "Bishkek"]           # newest first
    # Saving the same place again moves it to the top instead of adding it twice.
    areas = client.put("/api/me/saved", headers=ALICE, json={"lat": 42.82401, "lon": 74.60399, "name": "Bishkek"}).json()["areas"]
    assert [a["name"] for a in areas] == ["Bishkek", None]
    # Another account sees none of it.
    assert client.get("/api/me/saved", headers=BOB).json() == {"areas": []}
    areas = client.delete("/api/me/saved", headers=ALICE, params={"lat": 42.824, "lon": 74.604}).json()["areas"]
    assert len(areas) == 1 and areas[0]["lat"] == 40.5283


def test_saved_areas_only_in_kyrgyzstan(client):
    assert client.put("/api/me/saved", headers=ALICE, json={"lat": 55.75, "lon": 37.61}).status_code == 422


def test_deleting_the_account_deletes_saved_areas(client):
    carol = {"Authorization": "Bearer dev:carol-saved:carol@example.com"}
    client.put("/api/me/saved", headers=carol, json={"lat": 42.8, "lon": 74.6})
    assert client.delete("/api/me", headers=carol).status_code == 200
    assert client.get("/api/me/saved", headers=carol).json() == {"areas": []}


def test_voice_is_off_without_a_key(client, monkeypatch):
    # As on a backend with no key, whatever backend/.env holds on this machine.
    monkeypatch.setattr(state, "voice", None)
    assert client.get("/api/health").json()["voice"] == "not_configured"
    r = client.post("/api/voice/speak", json={"text": "Салам", "lang": "ky"})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "voice_disabled"


def fake_elevenlabs(calls: list):
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.headers["xi-api-key"] == "test-key"
        if request.url.path.endswith("/speech-to-text"):
            assert b'name="language_code"' in request.content and b"ky" in request.content
            return httpx.Response(200, json={"text": " Бул жерде суу ташкыны барбы? "})
        return httpx.Response(200, content=b"ID3-fake-mp3")
    return httpx.Client(transport=httpx.MockTransport(handler))


@pytest.fixture
def voice(client, monkeypatch):
    calls: list = []
    s = get_settings().model_copy(update={"elevenlabs_api_key": "test-key"})
    monkeypatch.setattr(state, "voice", Voice(s, fake_elevenlabs(calls)))
    return calls


def test_speak_returns_mp3_and_is_cached(client, voice):
    for _ in range(2):
        r = client.post("/api/voice/speak", json={"text": "Бул жерде  суу ташкыны бар.", "lang": "ky"})
        assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and r.content == b"ID3-fake-mp3"
    assert len(voice) == 1                                            # the second time comes from memory
    assert b'"text":"\\u0411\\u0443\\u043b' in voice[0].content or "Бул".encode() in voice[0].content


def test_listen_returns_the_words(client, voice):
    r = client.post("/api/voice/listen", params={"lang": "ky"}, content=b"webm-audio", headers={"content-type": "audio/webm"})
    assert r.status_code == 200 and r.json() == {"text": "Бул жерде суу ташкыны барбы?"}


def test_listen_refuses_empty_and_huge_recordings(client, voice):
    assert client.post("/api/voice/listen", content=b"", headers={"content-type": "audio/webm"}).status_code == 422
    assert client.post("/api/voice/listen", content=b"x" * 1_000_001, headers={"content-type": "audio/webm"}).status_code == 413
