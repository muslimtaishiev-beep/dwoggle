"""Bekem API.

Run:  uvicorn bekem.main:app --reload
Docs: http://localhost:8000/docs
"""

from __future__ import annotations

import hashlib
import json
import logging
import secrets
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated, Any, Literal

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field

from . import __version__
from .auth import Auth, AuthError, AuthUser, make_auth
from .cache import Cache
from .chat import Chat, ChatError, make_chat
from .config import get_settings, on_cloud_run
from .faults import faults_in_bbox
from .geocode import Geocoder, PlaceNamer
from .grading import METHODOLOGY
from .i18n import APP_LANGS, LANGS, TEXTS, AppLang, t, text_lang
from .nasa.appeears import AppEEARSManager
from .nasa.earthdata import EarthdataToken
from .nasa.giovanni import Giovanni
from .nasa.noaa import STATIONS_PATH
from .profiles import CONCERNS, PURPOSES, ProfileError, validate_concerns, validate_profile
from .providers import make_provider
from .report import ReportService, snap
from .voice import Voice, VoiceError, make_voice

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("bekem")

LangQ = Annotated[AppLang, Query(description="App language (11). Backend texts fall back to en/ru/ky, see /api/languages")]


class State:
    service: ReportService | None = None
    provider_error: str | None = None
    geocoder: Geocoder
    cache: Cache
    giovanni: Giovanni | None = None
    appeears: AppEEARSManager | None = None
    auth: Auth | None = None
    voice: Voice | None = None
    chat: Chat | None = None


state = State()


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    state.cache = Cache(s.cache_path, s.cache_ttl_days * 86400)
    state.geocoder = Geocoder(s)
    try:
        state.auth = make_auth(s)
        log.info("sign-in: %s", state.auth.mode if state.auth else "not configured")
    except Exception:
        log.exception("sign-in setup failed; auth endpoints will answer 503")
    state.voice = make_voice(s)
    log.info("voice: %s", "elevenlabs" if state.voice else "not configured")
    state.chat = make_chat(s)
    log.info("chat: %s", f"claude ({s.anthropic_model})" if state.chat else "not configured")
    real = s.provider == "earthengine"
    has_earthdata = bool(s.earthdata_username and s.earthdata_password)
    if real and has_earthdata:
        state.giovanni = Giovanni(EarthdataToken(s.earthdata_username, s.earthdata_password), timeout=s.giovanni_timeout_s + 10)
        if s.appeears_enabled:
            state.appeears = AppEEARSManager(state.cache, s.earthdata_username, s.earthdata_password, s.appeears_max_pending)
            _adopt_demo_appeears(state.appeears)
            state.appeears.start()
    try:
        places = PlaceNamer(s, state.cache) if s.place_names else None
        state.service = ReportService(s, make_provider(s), state.cache, state.giovanni, state.appeears, places)
        log.info("provider=%s ready (giovanni=%s, appeears=%s)", s.provider, bool(state.giovanni), bool(state.appeears))
    except Exception as e:  # keep the app up: faults, geocode and cached demo still work
        state.provider_error = _explain(e)
        log.exception("provider %s failed to start", s.provider)
    if state.service and s.warm_demo_on_start:
        threading.Thread(target=_warm_demo, args=(state.service,), daemon=True).start()
    yield


def _explain(e: Exception) -> str:
    if settings.provider == "earthengine":
        from .providers.earthengine import explain_ee_error

        return explain_ee_error(e)
    return f"{type(e).__name__}: {e}"


def _adopt_demo_appeears(manager: AppEEARSManager) -> None:
    """Pick up demo-plot AppEEARS work done by scripts/appeears_demo.py: finished results, or tasks to keep polling."""
    data = settings.demo_path.parent
    done = data / "appeears_demo.json"
    if done.exists():
        for plot in json.loads(done.read_text(encoding="utf-8")).values():
            manager.import_done(*snap(plot["lat"], plot["lon"]), plot["result"], plot.get("task_id", ""))
    tasks = data / "appeears_tasks.json"
    if tasks.exists():
        for task in json.loads(tasks.read_text(encoding="utf-8")).values():
            manager.track(*snap(task["lat"], task["lon"]), task["task_id"])


def _warm_demo(service: ReportService) -> None:
    for plot in json.loads(settings.demo_path.read_text(encoding="utf-8")):
        try:
            service.build(plot["lat"], plot["lon"])
            log.info("demo plot %s warm", plot["id"])
        except Exception:
            log.exception("could not warm demo plot %s", plot["id"])


settings = get_settings()
app = FastAPI(
    title="Bekem API",
    version=__version__,
    description="Tap any plot of land in Kyrgyzstan; get flood, landslide, earthquake, heat and green grades from 25 years of satellite data.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "PUT", "DELETE"], allow_headers=["*"]
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


# --- Rate limit (per IP, in memory; enough for one instance) ----------------------------------

_hits: dict[str, deque[float]] = defaultdict(deque)
_hits_lock = threading.Lock()


def _rate_limit(request: Request, limit: int | None = None, bucket: str = "") -> None:
    limit = settings.rate_limit_per_min if limit is None else limit
    if not limit:
        return
    # Behind Firebase Hosting / Cloud Run the visitor is the first address in X-Forwarded-For.
    ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "?")
    )
    now = time.monotonic()
    with _hits_lock:
        q = _hits[bucket + ip]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(429, "Too many requests. Bekem needs a minute to dig.")
        q.append(now)


def _check_bounds(lat: float, lon: float) -> None:
    min_lon, min_lat, max_lon, max_lat = settings.bbox
    if not (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon):
        raise HTTPException(422, "Bekem only knows Kyrgyzstan for now. Pick a point inside the country.")


# --- Routes -----------------------------------------------------------------------------------


@app.get("/api/health")
def health():
    """Public status. Detailed errors appear only on a developer's machine, never on the live server."""
    giovanni: dict = {"enabled": bool(state.giovanni)}
    if state.giovanni:
        quota = _giovanni_quota()
        giovanni["quota_used" if quota is not None else "status"] = quota if quota is not None else "unavailable"
    stations = json.loads(STATIONS_PATH.read_text(encoding="utf-8")) if STATIONS_PATH.exists() else []
    return {
        "status": "ok" if state.service else "degraded",
        "version": __version__,
        "provider": settings.provider,
        "provider_error": None if on_cloud_run() else state.provider_error,
        "cached_reports": state.cache.count(),
        "landslide_map": bool(settings.landslide_asset),
        "auth": state.auth.mode if state.auth else "not_configured",
        "voice": "elevenlabs" if state.voice else "not_configured",
        "chat": "claude" if state.chat else "not_configured",
        "sources": {
            "earthengine": "ok" if state.service and settings.provider == "earthengine" else settings.provider,
            "giovanni": giovanni,
            "appeears": {"enabled": bool(state.appeears), "pending_tasks": state.appeears.pending_count() if state.appeears else 0},
            "noaa": {"enabled": settings.noaa_enabled, "stations": len(stations)},
        },
    }


_quota_cache: dict = {"at": 0.0, "value": None}


def _giovanni_quota() -> float | None:
    """Giovanni's monthly quota share, asked at most every 10 minutes (health is public)."""
    if time.time() - _quota_cache["at"] > 600:
        try:
            _quota_cache["value"] = state.giovanni.quota()
        except Exception:
            log.exception("Giovanni quota check failed")
            _quota_cache["value"] = None
        _quota_cache["at"] = time.time()
    return _quota_cache["value"]


@app.get("/api/report")
def report(
    request: Request,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    lang: LangQ = "en",
    refresh: bool = False,
):
    """The report card for a point: five grades, Bekem's mood, and 25-year series for the charts."""
    _check_bounds(lat, lon)
    if state.service is None:
        raise HTTPException(503, "Satellite data is not available right now." if on_cloud_run()
                            else f"Satellite provider is not available: {state.provider_error}")
    _rate_limit(request)
    # refresh=true bypasses the cache (costly Earth Engine + NASA calls): developer machines only.
    refresh = refresh and not on_cloud_run()
    try:
        return state.service.build(lat, lon, lang, refresh=refresh)
    except Exception as e:
        log.exception("report failed for %s,%s", lat, lon)
        raise HTTPException(502, "The satellites didn't answer this time. Please try again.") from e


@app.get("/api/report/verification")
def report_verification(
    request: Request,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    lang: LangQ = "en",
):
    """Only the second opinions (NOAA station, NASA AppEEARS) for a point already reported.

    Cheap to poll every ~30 s while AppEEARS says "pending": the satellite part comes from the cache.
    """
    body = report(request, lat, lon, lang)
    return {
        "location": body["location"],
        "extras": body["extras"],
        "verification": {c["id"]: c["verification"] for c in body["checks"] if c["verification"]},
    }


@app.get("/api/geocode")
async def geocode(q: Annotated[str, Query(min_length=2, max_length=200)], lang: LangQ = "en", limit: int = Query(5, ge=1, le=8)):
    """Search an address or place name inside Kyrgyzstan."""
    try:
        return {"results": await state.geocoder.search(q, lang, limit)}
    except httpx.HTTPError as e:
        log.warning("geocode failed: %s", e)
        raise HTTPException(502, "Address search is unavailable right now.") from e


@app.get("/api/faults")
def faults(bbox: Annotated[str | None, Query(description="min_lon,min_lat,max_lon,max_lat")] = None):
    """Active faults as GeoJSON for a map layer (defaults to the whole country)."""
    if bbox:
        try:
            box = tuple(float(x) for x in bbox.split(","))
            assert len(box) == 4
        except (ValueError, AssertionError):
            raise HTTPException(422, "bbox must be min_lon,min_lat,max_lon,max_lat")
    else:
        box = settings.bbox
    return faults_in_bbox(settings.faults_path, box)


@app.get("/api/demo")
def demo(lang: LangQ = "en"):
    """The demo plots, with names in the requested language."""
    plots = json.loads(settings.demo_path.read_text(encoding="utf-8"))
    return {"plots": [{"id": p["id"], "lat": p["lat"], "lon": p["lon"], "name": p["name"].get(text_lang(lang), p["name"]["en"])} for p in plots]}


@app.get("/api/methodology")
def methodology(lang: LangQ = "en"):
    """'How we grade': the exact rules and datasets behind every grade."""
    return {
        "checks": {
            cid: {
                "title": t(f"check.{cid}", lang) if cid != "mood" else None,
                "data": m.get("data", []),
                "rules": [r.format(radius=settings.radius_m) for r in m["rules"]],
            }
            for cid, m in METHODOLOGY.items()
        },
        "disclaimer": t("disclaimer", lang),
        "note": "Rules are published in English; titles and disclaimer are localized.",
    }


@app.get("/api/i18n")
def i18n(lang: LangQ = "en"):
    """Every UI string the backend knows, so the frontend can reuse the same wording."""
    return {k: v.get(text_lang(lang)) or v["en"] for k, v in TEXTS.items()}


@app.get("/api/languages")
def languages():
    """App languages, and which of en/ru/ky the backend's own texts come back in for each."""
    return {
        "languages": list(APP_LANGS),
        "text_languages": list(LANGS),
        "fallback": {lang: text_lang(lang) for lang in APP_LANGS},
    }


# --- Sign-in & profile -------------------------------------------------------------------------
# Passwords and Google sign-in are handled by Firebase in the frontend; see AUTH.md.


def _auth_error(status: int, code: str, lang: str = "en") -> HTTPException:
    return HTTPException(status, {"code": code, "message": t(f"err.{code}", lang)})


def current_user(
    authorization: Annotated[str | None, Header(description="Bearer <Firebase ID token>")] = None,
    lang: LangQ = "en",
) -> AuthUser:
    if state.auth is None:
        raise _auth_error(503, "auth_disabled", lang)
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _auth_error(401, "token_missing", lang)
    try:
        return state.auth.verifier.verify(authorization.split(" ", 1)[1].strip())
    except AuthError as e:
        raise _auth_error(401, e.code, lang) from e


User = Annotated[AuthUser, Depends(current_user)]


class ProfileIn(BaseModel):
    country: str = Field(max_length=8, description="ISO 3166-1 alpha-2, e.g. KG")
    phone: str = Field(
        "", max_length=40,
        description="International or local format; stored as +996555123456. Empty keeps the saved one (the "
                    "dig saves the first answers before it asks for the phone); without a phone the profile is "
                    "not complete.",
    )
    purpose: str = Field(max_length=32, description="Why they're here: one of the ids from /api/auth/options")
    purpose_note: str | None = Field(None, max_length=1000, description="Free text (300 chars max), required for 'other'")
    concerns: list[str] | None = Field(
        None, max_length=len(CONCERNS),
        description="Any of flood, landslide, earthquake, heat (may be empty). Omit to keep the saved value.",
    )
    lang: AppLang = "en"


def _profile_out(user: AuthUser, profile: dict | None) -> dict:
    if profile is not None:
        profile.setdefault("concerns", [])  # profiles saved before concerns existed
    complete = bool(profile and all(profile.get(k) for k in ("country", "phone", "purpose")))
    return {
        "user": {"uid": user.uid, "email": user.email, "email_verified": user.email_verified,
                 "provider": user.provider, "name": user.name},
        "profile": profile,
        "profile_complete": complete,
    }


@app.get("/api/auth/options")
def auth_options(lang: LangQ = "en"):
    """What the sign-up form needs: the 'why are you here' choices, in the user's language."""
    return {
        "methods": ["password", "google.com"],
        "question": t("purpose.question", lang),
        "purposes": [{"id": p, "label": t(f"purpose.{p}", lang)} for p in PURPOSES],
        "concerns": [{"id": c, "label": t(f"check.{c}", lang)} for c in CONCERNS],
        "languages": list(APP_LANGS),
        "fields": {"country": "ISO 3166-1 alpha-2", "phone": "E.164 (+996...)", "purpose_note_max": 300},
        "prompt": t("signup.prompt", lang),
        "enabled": state.auth is not None,
    }


@app.get("/api/me")
def me(user: User):
    """The signed-in user and their profile. `profile_complete: false` → show the sign-up questions."""
    return _profile_out(user, state.auth.store.get(user.uid))


@app.put("/api/me/profile")
def save_profile(user: User, body: ProfileIn, request: Request):
    """Create or update country, phone and purpose. Email and sign-in method come from Firebase."""
    _rate_limit(request)
    existing = state.auth.store.get(user.uid) or {}
    try:
        fields = validate_profile(body.country, body.phone, body.purpose, body.purpose_note)
        concerns = validate_concerns(body.concerns) if body.concerns is not None else existing.get("concerns", [])
        if fields["phone"] is None:
            fields["phone"] = existing.get("phone")
    except ProfileError as e:
        raise HTTPException(422, {"field": e.field, "code": e.code, "message": t(f"err.{e.code}", body.lang)}) from e
    now = datetime.now(timezone.utc)
    profile = {
        **fields,
        "concerns": concerns,
        "lang": body.lang,
        "email": user.email,
        "email_verified": user.email_verified,
        "provider": user.provider,
        "name": user.name,
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
    }
    state.auth.store.save(user.uid, profile)
    return _profile_out(user, state.auth.store.get(user.uid))


@app.delete("/api/me")
def delete_me(user: User):
    """Delete the profile AND the sign-in account. Phone numbers are personal data; this must always work."""
    state.auth.delete_account(user.uid)
    return {"deleted": True}


# --- Saved areas ------------------------------------------------------------------------------
# The places a signed-in user saved from the map, newest first, so they follow the account to any device.

SAVED_MAX = 50


class SavedIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    name: str | None = Field(None, max_length=200)


def _same(area: dict, lat: float, lon: float) -> bool:
    return round(float(area.get("lat", 0)), 4) == round(lat, 4) and round(float(area.get("lon", 0)), 4) == round(lon, 4)


def _saved(uid: str) -> list[dict]:
    doc = state.auth.saved.get(uid) or {}
    areas = doc.get("areas") or []
    return [a for a in areas if isinstance(a, dict) and "lat" in a and "lon" in a]


def _saved_out(areas: list[dict]) -> dict:
    return {"areas": [{"lat": float(a["lat"]), "lon": float(a["lon"]), "name": a.get("name"), "saved_at": a.get("saved_at")} for a in areas]}


@app.get("/api/me/saved")
def saved_list(user: User):
    """The places this user saved, newest first."""
    return _saved_out(_saved(user.uid))


@app.put("/api/me/saved")
def saved_add(user: User, body: SavedIn, request: Request):
    """Save a place (or move it to the top if it is saved already). Only places in Kyrgyzstan."""
    _rate_limit(request)
    _check_bounds(body.lat, body.lon)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    area = {"lat": round(body.lat, 5), "lon": round(body.lon, 5), "name": (body.name or "").strip() or None, "saved_at": now}
    areas = [area] + [a for a in _saved(user.uid) if not _same(a, body.lat, body.lon)]
    areas = areas[:SAVED_MAX]
    state.auth.saved.save(user.uid, {"areas": areas})
    return _saved_out(areas)


@app.delete("/api/me/saved")
def saved_remove(user: User, lat: Annotated[float, Query(ge=-90, le=90)], lon: Annotated[float, Query(ge=-180, le=180)]):
    """Forget one saved place."""
    areas = [a for a in _saved(user.uid) if not _same(a, lat, lon)]
    state.auth.saved.save(user.uid, {"areas": areas})
    return _saved_out(areas)


# --- Dwoggle's voice (ElevenLabs) ---------------------------------------------------------------
# Open without signing in, like the chat itself; a tighter rate limit guards the key's budget.


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    lang: AppLang = "en"


def _voice(request: Request) -> Voice:
    if state.voice is None:
        raise HTTPException(503, {"code": "voice_disabled"})
    _rate_limit(request, settings.voice_rate_limit_per_min, "voice:")
    return state.voice


@app.post("/api/voice/speak", response_class=Response, responses={200: {"content": {"audio/mpeg": {}}}})
def voice_speak(body: SpeakIn, request: Request):
    """The text read aloud in Dwoggle's voice, as MP3."""
    voice = _voice(request)
    try:
        audio = voice.speak(body.text, body.lang)
    except VoiceError as e:
        raise HTTPException(e.status, {"code": e.code}) from e
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=86400"})


@app.post("/api/voice/listen")
async def voice_listen(request: Request, lang: AppLang = "en"):
    """What was said in a spoken question. The body is the recording itself (audio/webm, audio/mp4, ...)."""
    voice = _voice(request)
    audio = await request.body()
    try:
        text = voice.listen(audio, request.headers.get("content-type", ""), lang)
    except VoiceError as e:
        raise HTTPException(e.status, {"code": e.code}) from e
    return {"text": text}


# --- The chat with Dwoggle (Claude) ------------------------------------------------------------
# Open without signing in, like the voice; its own rate limit guards the key's budget. 503 means "no live answers
# here": the app then answers from its prepared texts.


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40, description="The conversation, oldest first; the last one is the question")
    lang: Literal["ky", "ru", "en"] = "en"
    report: dict[str, Any] | None = Field(None, description="The report open in the app, as the app sends it (40 000 characters max)")


@app.post("/api/chat")
def chat(body: ChatIn, request: Request):
    """Dwoggle's answer to the last question, from the report sent along, in the visitor's language: {text}."""
    if state.chat is None:
        raise HTTPException(503, {"code": "chat_disabled"})
    _rate_limit(request, settings.chat_rate_limit_per_min, "chat:")
    try:
        text = state.chat.answer([m.model_dump() for m in body.messages], body.lang, body.report)
    except ChatError as e:
        if e.status >= 500:
            log.warning("chat: %s", e.code)
        raise HTTPException(e.status, {"code": e.code}) from e
    return {"text": text}


# --- Advanced reports -------------------------------------------------------------------------
# A signed-in user asks for everything known about a place. The backend gathers it (the full report, with NASA
# Giovanni's rain and runoff and the weather station waited for), gives it a number, and keeps the data it was made
# from, with a fingerprint (SHA-256 of that data). The app writes the PDF from it, in the reader's language. The QR
# code on the PDF leads to /r/<number>, where anyone can check the report against what is kept here.

REPORT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no 0/O, 1/I: easy to read off paper
REPORT_INDEX_MAX = 100


class ReportIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    lang: AppLang = "en"


def _new_report_id(now: datetime) -> str:
    return f"DW-{now.year}-" + "".join(secrets.choice(REPORT_ALPHABET) for _ in range(6))


def _fingerprint(data: dict) -> str:
    canonical = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _for_keeping(report_body: dict) -> dict:
    """The report as kept: everything except the fault's whole outline, which is large and is not printed."""
    data = json.loads(json.dumps(report_body, default=str))
    for check in data.get("checks", []):
        (check.get("metrics") or {}).pop("fault_geometry", None)
    return data


def _report_summary(doc: dict) -> dict:
    """What anyone holding the paper may see: when, where, and the grades. Not who asked for it."""
    data = json.loads(doc["data"])
    place = (data.get("location") or {}).get("place") or {}
    return {
        "id": doc["id"],
        "created_at": doc["created_at"],
        "lat": doc["lat"],
        "lon": doc["lon"],
        "place": place.get("display"),
        "grades": {c["id"]: c.get("grade") for c in data.get("checks", [])},
        "fingerprint": doc["fingerprint"],
    }


def optional_user(authorization: Annotated[str | None, Header()] = None) -> AuthUser | None:
    """The signed-in user, if the request carries a valid token; otherwise nobody (no error)."""
    if state.auth is None or not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return state.auth.verifier.verify(authorization.split(" ", 1)[1].strip())
    except AuthError:
        return None


@app.post("/api/reports")
def create_report(user: User, body: ReportIn, request: Request):
    """Gather everything about a place into a numbered report. Takes up to about a minute."""
    _check_bounds(body.lat, body.lon)
    if state.service is None:
        raise HTTPException(503, {"code": "provider_unavailable"})
    _rate_limit(request)
    now = datetime.now(timezone.utc)
    index = (state.auth.report_index.get(user.uid) or {}).get("reports") or []
    today = now.date().isoformat()
    if sum(1 for r in index if str(r.get("created_at", "")).startswith(today)) >= settings.reports_per_day:
        raise HTTPException(429, {"code": "reports_daily_limit", "limit": settings.reports_per_day})
    try:
        data = _for_keeping(state.service.build(body.lat, body.lon, body.lang))
    except Exception as e:
        log.exception("advanced report failed for %s,%s", body.lat, body.lon)
        raise HTTPException(502, {"code": "report_failed"}) from e
    report_id = _new_report_id(now)
    created = now.isoformat(timespec="seconds")
    doc = {
        "id": report_id,
        "uid": user.uid,
        "created_at": created,
        "lat": data["location"]["lat"],
        "lon": data["location"]["lon"],
        "lang": body.lang,
        "fingerprint": _fingerprint(data),
        "data": json.dumps(data, ensure_ascii=False),
    }
    state.auth.reports.save(report_id, doc)
    place = (data["location"].get("place") or {}).get("display")
    entry = {"id": report_id, "created_at": created, "lat": doc["lat"], "lon": doc["lon"], "place": place}
    state.auth.report_index.save(user.uid, {"reports": ([entry] + index)[:REPORT_INDEX_MAX]})
    return {**_report_summary(doc), "report": data}


@app.get("/api/reports/{report_id}")
def get_report(report_id: Annotated[str, Path(pattern=r"^DW-\d{4}-[A-Z0-9]{6}$")],
               viewer: Annotated[AuthUser | None, Depends(optional_user)]):
    """Check a report by its number: when it was made, where, its grades and fingerprint. Its owner also gets the data."""
    if state.auth is None:
        raise HTTPException(503, {"code": "auth_disabled"})
    doc = state.auth.reports.get(report_id)
    if not doc:
        raise HTTPException(404, {"code": "report_not_found"})
    out = _report_summary(doc)
    if viewer is not None and viewer.uid == doc.get("uid"):
        out["report"] = json.loads(doc["data"])
    return out


@app.get("/api/me/reports")
def my_reports(user: User):
    """This user's advanced reports, newest first."""
    return {"reports": (state.auth.report_index.get(user.uid) or {}).get("reports") or []}
