"""Bekem API.

Run:  uvicorn bekem.main:app --reload
Docs: http://localhost:8000/docs
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated, Literal

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field

from . import __version__
from .auth import Auth, AuthError, AuthUser, make_auth
from .cache import Cache
from .config import get_settings
from .faults import faults_in_bbox
from .geocode import Geocoder
from .grading import METHODOLOGY
from .i18n import LANGS, TEXTS, t
from .nasa.appeears import AppEEARSManager
from .nasa.earthdata import EarthdataToken
from .nasa.giovanni import Giovanni
from .nasa.noaa import STATIONS_PATH
from .profiles import PURPOSES, ProfileError, validate_profile
from .providers import make_provider
from .report import ReportService, snap

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("bekem")

LangQ = Annotated[Literal["en", "ru", "ky"], Query(description="Response language")]


class State:
    service: ReportService | None = None
    provider_error: str | None = None
    geocoder: Geocoder
    cache: Cache
    giovanni: Giovanni | None = None
    appeears: AppEEARSManager | None = None
    auth: Auth | None = None


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
    real = s.provider == "earthengine"
    has_earthdata = bool(s.earthdata_username and s.earthdata_password)
    if real and has_earthdata:
        state.giovanni = Giovanni(EarthdataToken(s.earthdata_username, s.earthdata_password), timeout=s.giovanni_timeout_s + 10)
        if s.appeears_enabled:
            state.appeears = AppEEARSManager(state.cache, s.earthdata_username, s.earthdata_password, s.appeears_max_pending)
            _adopt_demo_appeears(state.appeears)
            state.appeears.start()
    try:
        state.service = ReportService(s, make_provider(s), state.cache, state.giovanni, state.appeears)
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


def _rate_limit(request: Request) -> None:
    limit = settings.rate_limit_per_min
    if not limit:
        return
    # Behind Cloudflare the real client is in CF-Connecting-IP; elsewhere use X-Forwarded-For or the socket.
    ip = (
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "?")
    )
    now = time.monotonic()
    with _hits_lock:
        q = _hits[ip]
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
    giovanni: dict = {"enabled": bool(state.giovanni)}
    if state.giovanni:
        try:
            giovanni["quota_used"] = state.giovanni.quota()  # fraction of this month's Giovanni compute quota
        except Exception as e:
            giovanni["error"] = str(e)[:200]
    stations = json.loads(STATIONS_PATH.read_text(encoding="utf-8")) if STATIONS_PATH.exists() else []
    return {
        "status": "ok" if state.service else "degraded",
        "version": __version__,
        "provider": settings.provider,
        "provider_error": state.provider_error,
        "cached_reports": state.cache.count(),
        "landslide_map": bool(settings.landslide_asset),
        "auth": state.auth.mode if state.auth else "not_configured",
        "sources": {
            "earthengine": "ok" if state.service and settings.provider == "earthengine" else settings.provider,
            "giovanni": giovanni,
            "appeears": {"enabled": bool(state.appeears), "pending_tasks": state.appeears.pending_count() if state.appeears else 0},
            "noaa": {"enabled": settings.noaa_enabled, "stations": len(stations)},
        },
    }


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
        raise HTTPException(503, f"Satellite provider is not available: {state.provider_error}")
    _rate_limit(request)
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
    return {"plots": [{"id": p["id"], "lat": p["lat"], "lon": p["lon"], "name": p["name"].get(lang, p["name"]["en"])} for p in plots]}


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
    return {k: v.get(lang) or v["en"] for k, v in TEXTS.items()}


@app.get("/api/languages")
def languages():
    return {"languages": list(LANGS)}


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
    country: str = Field(description="ISO 3166-1 alpha-2, e.g. KG")
    phone: str = Field(description="International or local format; stored as +996555123456")
    purpose: str = Field(description="Why they're here: one of the ids from /api/auth/options")
    purpose_note: str | None = Field(None, description="Free text, required when purpose is 'other'")
    lang: Literal["en", "ru", "ky"] = "en"


def _profile_out(user: AuthUser, profile: dict | None) -> dict:
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
    try:
        fields = validate_profile(body.country, body.phone, body.purpose, body.purpose_note)
    except ProfileError as e:
        raise HTTPException(422, {"field": e.field, "code": e.code, "message": t(f"err.{e.code}", body.lang)}) from e
    now = datetime.now(timezone.utc)
    existing = state.auth.store.get(user.uid) or {}
    profile = {
        **fields,
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
