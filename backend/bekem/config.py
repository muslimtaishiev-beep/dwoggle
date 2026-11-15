from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BEKEM_", env_file=BASE_DIR / ".env", extra="ignore")

    # "earthengine" = real NASA data via Google Earth Engine.
    # "mock" = synthetic numbers for frontend development. Every response says which one was used.
    provider: Literal["earthengine", "mock"] = "earthengine"

    # Earth Engine auth. Either a service-account key file, or leave empty to use
    # credentials from `earthengine authenticate` on this machine.
    ee_project: str = ""
    ee_service_account_key: str = ""  # path to JSON key file
    ee_service_account_key_json: str = ""  # or the key JSON itself (handy on Render/Railway/etc.)

    # Optional Earth Engine asset with the NASA Global Landslide Susceptibility map
    # (Stanley & Kirschbaum 2017, classes 1..5). Upload the GeoTIFF once, put the asset id here.
    landslide_asset: str = ""

    # Sign-in (Firebase Authentication + Firestore profiles). Project and key default to the Earth Engine
    # ones, so one service account (with the Firebase roles added) serves both.
    firebase_project: str = ""
    firebase_service_account_key: str = ""
    firebase_service_account_key_json: str = ""

    # NASA Earthdata login (free: https://urs.earthdata.nasa.gov). Used for AppEEARS and Giovanni.
    earthdata_username: str = ""
    earthdata_password: str = ""
    # Extras from the challenge's NASA/NOAA list: charts and second opinions, never a grade change.
    giovanni_timeout_s: int = 15  # wait this long for Giovanni, then answer without it (it keeps filling the cache)
    appeears_enabled: bool = True
    appeears_max_pending: int = 5
    noaa_enabled: bool = True

    radius_m: int = 300
    # Accept points inside this box (Kyrgyzstan plus a small margin).
    bbox: tuple[float, float, float, float] = (69.2, 39.1, 80.3, 43.3)

    cache_path: Path = BASE_DIR / "data" / "cache.sqlite3"
    cache_ttl_days: int = 30
    faults_path: Path = BASE_DIR / "data" / "gem_faults_kg.geojson"
    demo_path: Path = BASE_DIR / "data" / "demo_plots.json"

    cors_origins: list[str] = ["*"]
    ee_timeout_s: int = 60
    # Report requests per client IP per minute. 0 disables the limit.
    rate_limit_per_min: int = 30
    # Compute the demo plots in the background at startup, so they answer instantly
    # even on a fresh Cloud Run instance (its disk, and so the cache, starts empty).
    warm_demo_on_start: bool = True

    nominatim_url: str = "https://nominatim.openstreetmap.org/search"
    nominatim_reverse_url: str = "https://nominatim.openstreetmap.org/reverse"
    place_names: bool = True  # add an OpenStreetMap place name to each report's location
    nominatim_user_agent: str = "bekem/1.0 (https://github.com/bekem)"

    # Dwoggle's voice (ElevenLabs): answers read aloud and questions heard. Without a key /api/voice/* answers 503
    # and the app falls back to the browser's own voice.
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "JBFqnCBsd6RMkjVDRZzb"  # a premade multilingual voice; any voice from the library works
    elevenlabs_tts_model: str = "eleven_multilingual_v2"
    elevenlabs_stt_model: str = "scribe_v1"
    # Advanced reports one user may make per day (each one asks Earth Engine and NASA for everything).
    reports_per_day: int = 10

    # Requests to /api/voice per client IP per minute (they cost ElevenLabs characters). 0 disables the limit.
    voice_rate_limit_per_min: int = 12

    # Dwoggle's live answers in the chat (Claude, Anthropic). Without a key /api/chat answers 503 and the app gives
    # its prepared answers. Any current Claude model id works; effort is low | medium | high.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5-5"
    anthropic_effort: Literal["low", "medium", "high"] = "low"
    # Questions to /api/chat per client IP per minute (each one costs Claude tokens). 0 disables the limit.
    chat_rate_limit_per_min: int = 10


def on_cloud_run() -> bool:
    """Cloud Run sets K_SERVICE. There the code runs as the service's own account: no key file needed."""
    return bool(os.environ.get("K_SERVICE"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
