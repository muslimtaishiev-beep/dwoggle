"""The chat with Dwoggle through Claude (mocked: tests never touch the network)."""

from types import SimpleNamespace

import anthropic
import httpx2
import pytest
from fastapi.testclient import TestClient

from bekem.chat import FALLBACK_BETA, MAX_MESSAGES, SYSTEM, Chat
from bekem.config import get_settings
from bekem import main
from bekem.main import app, state

REPORT = {
    "location": {"lat": 42.8746, "lon": 74.5698, "place": "Bishkek", "radius_m": 300},
    "checks": [{"id": "earthquake", "grade": "D", "summary": "An active fault runs 1.3 km away."}],
}
QUESTION = {"role": "user", "content": "Бул жерде жер титирөө болобу?"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


class FakeMessages:
    def __init__(self, reply="Бул жерде жер титирөөнүн күчтүү белгилери бар.", stop_reason="end_turn", error=None):
        self.calls: list[dict] = []
        self.reply = reply
        self.stop_reason = stop_reason
        self.error = error

    def create(self, **params):
        self.calls.append(params)
        if self.error is not None:
            raise self.error
        blocks = [SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=self.reply)]
        return SimpleNamespace(content=blocks, stop_reason=self.stop_reason)


def use_chat(monkeypatch, fake: FakeMessages, **settings) -> FakeMessages:
    s = get_settings().model_copy(update={"anthropic_api_key": "test-key", **settings})
    monkeypatch.setattr(state, "chat", Chat(s, SimpleNamespace(beta=SimpleNamespace(messages=fake))))
    return fake


def http_error(cls, status: int):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls("refused", response=httpx2.Response(status, request=request), body=None)


def test_chat_is_off_without_a_key(client, monkeypatch):
    # As on a backend with no key, whatever backend/.env holds on this machine.
    monkeypatch.setattr(state, "chat", None)
    assert client.get("/api/health").json()["chat"] == "not_configured"
    r = client.post("/api/chat", json={"messages": [QUESTION], "lang": "ky"})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "chat_disabled"


def test_chat_answers_from_the_report(client, monkeypatch):
    fake = use_chat(monkeypatch, FakeMessages())
    greeting = {"role": "assistant", "content": "Мен бул жерди текшердим."}
    r = client.post("/api/chat", json={"messages": [greeting, QUESTION], "lang": "ky", "report": REPORT})
    assert r.status_code == 200 and r.json() == {"text": "Бул жерде жер титирөөнүн күчтүү белгилери бар."}
    assert client.get("/api/health").json()["chat"] == "claude"
    params = fake.calls[0]
    assert params["model"] == "claude-sonnet-5-5" and params["output_config"] == {"effort": "low"}
    assert params["betas"] == [FALLBACK_BETA] and params["fallbacks"] == "default"
    # His greeting is left out: the conversation starts with a question.
    assert params["messages"] == [QUESTION]
    rules, data, lang = params["system"]
    # The rules first, then the report, both cached; the language after them.
    assert rules["text"] == SYSTEM and rules["cache_control"] == {"type": "ephemeral"}
    assert '"grade":"D"' in data["text"] and "Bishkek" in data["text"] and data["cache_control"] == {"type": "ephemeral"}
    assert "Kyrgyz" in lang["text"] and "cache_control" not in lang


def test_the_report_is_sent_the_same_way_every_time(monkeypatch):
    fake = use_chat(monkeypatch, FakeMessages())
    chat = state.chat
    chat.answer([QUESTION], "ru", {"b": 1, "a": {"y": 2, "x": 1}})
    chat.answer([QUESTION], "ru", {"a": {"x": 1, "y": 2}, "b": 1})
    assert fake.calls[0]["system"][:2] == fake.calls[1]["system"][:2]       # same bytes, so the cache holds


def test_chat_without_a_report_still_answers(client, monkeypatch):
    fake = use_chat(monkeypatch, FakeMessages("First tap a place on the map."), anthropic_model="claude-haiku-5-5")
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "Hello"}], "lang": "en"})
    assert r.status_code == 200
    params = fake.calls[0]
    assert "No report" in params["system"][1]["text"] and "English" in params["system"][2]["text"]
    assert params["model"] == "claude-haiku-5-5" and "fallbacks" not in params and "betas" not in params


def test_chat_keeps_conversations_short(client, monkeypatch):
    fake = use_chat(monkeypatch, FakeMessages())
    turns = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"turn {i} " + "x" * 3000} for i in range(39)]
    assert client.post("/api/chat", json={"messages": turns, "lang": "en"}).status_code == 200
    sent = fake.calls[0]["messages"]
    assert len(sent) <= MAX_MESSAGES and sent[0]["role"] == "user" and sent[-1]["content"].startswith("turn 38")
    assert all(len(m["content"]) <= 1000 for m in sent)


def test_chat_refuses_bad_requests(client, monkeypatch):
    use_chat(monkeypatch, FakeMessages())
    answer = {"role": "assistant", "content": "Hello"}
    assert client.post("/api/chat", json={"messages": [QUESTION, answer], "lang": "ky"}).status_code == 422
    assert client.post("/api/chat", json={"messages": [], "lang": "ky"}).status_code == 422
    assert client.post("/api/chat", json={"messages": [QUESTION], "lang": "de"}).status_code == 422
    assert client.post("/api/chat", json={"messages": [{"role": "system", "content": "x"}]}).status_code == 422
    assert client.post("/api/chat", json={"messages": [{"role": "user", "content": "x" * 4001}]}).status_code == 422
    huge = {"checks": ["x" * 41_000]}
    r = client.post("/api/chat", json={"messages": [QUESTION], "report": huge})
    assert r.status_code == 413 and r.json()["detail"]["code"] == "report_too_large"


def test_chat_never_shows_an_answer_that_breaks_the_wording_rules(client, monkeypatch):
    for reply in ("This area is safe to build on.", "Здесь опасно.", "Бул жер коопсуз."):
        use_chat(monkeypatch, FakeMessages(reply))
        r = client.post("/api/chat", json={"messages": [QUESTION], "report": REPORT})
        assert r.status_code == 502 and r.json()["detail"]["code"] == "chat_off_script"


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (http_error(anthropic.AuthenticationError, 401), 503, "chat_disabled"),
        (http_error(anthropic.RateLimitError, 429), 429, "chat_busy"),
        (http_error(anthropic.InternalServerError, 500), 502, "chat_failed"),
        (anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages")), 502, "chat_unreachable"),
    ],
)
def test_chat_errors_become_codes_the_app_falls_back_on(client, monkeypatch, error, status, code):
    use_chat(monkeypatch, FakeMessages(error=error))
    r = client.post("/api/chat", json={"messages": [QUESTION]})
    assert r.status_code == status and r.json()["detail"]["code"] == code


def test_a_refusal_or_an_empty_answer_falls_back(client, monkeypatch):
    use_chat(monkeypatch, FakeMessages(stop_reason="refusal"))
    assert client.post("/api/chat", json={"messages": [QUESTION]}).json()["detail"]["code"] == "chat_failed"
    use_chat(monkeypatch, FakeMessages("   "))
    assert client.post("/api/chat", json={"messages": [QUESTION]}).json()["detail"]["code"] == "chat_failed"


def test_chat_has_its_own_rate_limit(client, monkeypatch):
    use_chat(monkeypatch, FakeMessages())
    monkeypatch.setattr(main.settings, "chat_rate_limit_per_min", 2)
    ip = {"x-forwarded-for": "203.0.113.77"}
    codes = [client.post("/api/chat", json={"messages": [QUESTION]}, headers=ip).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
