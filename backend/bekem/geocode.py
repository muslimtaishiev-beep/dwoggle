"""OpenStreetMap Nominatim: address search (limited to Kyrgyzstan) and place names for a tapped point.

Proxied through the backend so we send a proper User-Agent, keep the whole app under Nominatim's
1 request/second policy (search and place names share one throttle), and cache answers.
Data © OpenStreetMap contributors (ODbL): the attribution travels with every place name.
"""

from __future__ import annotations

import asyncio
import threading
import time
from collections import OrderedDict

import httpx

from .cache import Cache
from .config import Settings

ATTRIBUTION = "© OpenStreetMap contributors"

_throttle_lock = threading.Lock()
_last_call = 0.0


def _nominatim_get(url: str, params: dict, user_agent: str, wait_s: float, timeout: float) -> httpx.Response | None:
    """One Nominatim request, at most one per second app-wide. None if we'd have to queue longer than wait_s."""
    global _last_call
    if not _throttle_lock.acquire(timeout=wait_s):
        return None
    try:
        gap = 1.0 - (time.monotonic() - _last_call)
        if gap > 0:
            time.sleep(gap)
        try:
            return httpx.get(url, params=params, headers={"User-Agent": user_agent}, timeout=timeout)
        finally:
            _last_call = time.monotonic()
    finally:
        _throttle_lock.release()


class Geocoder:
    """Address search for the search box."""

    def __init__(self, settings: Settings, max_cache: int = 2000):
        self.settings = settings
        self._cache: OrderedDict[tuple[str, str], list[dict]] = OrderedDict()
        self._max = max_cache

    async def search(self, q: str, lang: str, limit: int = 5) -> list[dict]:
        key = (q.strip().lower(), lang)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key][:limit]

        params = {"q": q, "format": "jsonv2", "countrycodes": "kg", "limit": 8, "addressdetails": 0, "accept-language": lang}
        resp = await asyncio.to_thread(
            _nominatim_get, self.settings.nominatim_url, params, self.settings.nominatim_user_agent, 10.0, 10.0
        )
        if resp is None:
            raise httpx.HTTPError("address search is busy")
        resp.raise_for_status()

        results = [
            {"name": r.get("display_name"), "lat": float(r["lat"]), "lon": float(r["lon"]), "type": r.get("type")}
            for r in resp.json()
        ]
        self._cache[key] = results
        if len(self._cache) > self._max:
            self._cache.popitem(last=False)
        return results[:limit]


def parse_place(data: dict) -> dict | None:
    """Nominatim reverse result -> {name, locality, region, country, country_code, display, attribution}."""
    a = data.get("address") or {}
    name = data.get("name") or next(
        (a[k] for k in ("quarter", "suburb", "neighbourhood", "village", "hamlet", "town", "city") if a.get(k)), None
    )
    locality = next((a[k] for k in ("city", "town", "village", "hamlet") if a.get(k)), None)
    if not name and not locality:
        return None
    region = a.get("state") or a.get("province") or a.get("region")
    parts = [x for x in (name, locality, region) if x]
    return {
        "name": name or locality,
        "locality": locality,
        "region": region,
        "country": a.get("country"),
        "country_code": a.get("country_code"),
        "display": ", ".join(dict.fromkeys(parts)),  # e.g. "Асанбай кичирайону, Бишкек шаары"
        "attribution": ATTRIBUTION,
    }


class PlaceNamer:
    """Place name for a tapped point, in the user's language. Cached; skipped rather than queued under load."""

    def __init__(self, settings: Settings, cache: Cache):
        self.settings = settings
        self.cache = cache

    def name(self, lat: float, lon: float, lang: str) -> dict | None:
        key = f"place:v1:{lang}:{lat:.3f}:{lon:.3f}"
        if hit := self.cache.get(key):
            return hit[0].get("place")
        params = {"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 14, "addressdetails": 1, "accept-language": lang}
        resp = _nominatim_get(self.settings.nominatim_reverse_url, params, self.settings.nominatim_user_agent, 2.0, 4.0)
        if resp is None:
            return None  # busy: answer without a name, try again next time
        resp.raise_for_status()
        place = parse_place(resp.json())
        self.cache.set(key, {"place": place})
        return place
