"""Address search through OpenStreetMap Nominatim, limited to Kyrgyzstan.

Proxied through the backend so we send a proper User-Agent, respect Nominatim's
1 request/second policy for the whole app, and cache repeated searches.
"""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict

import httpx

from .config import Settings


class Geocoder:
    def __init__(self, settings: Settings, max_cache: int = 2000):
        self.settings = settings
        self._cache: OrderedDict[tuple[str, str], list[dict]] = OrderedDict()
        self._max = max_cache
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def search(self, q: str, lang: str, limit: int = 5) -> list[dict]:
        key = (q.strip().lower(), lang)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key][:limit]

        params = {
            "q": q,
            "format": "jsonv2",
            "countrycodes": "kg",
            "limit": 8,
            "addressdetails": 0,
            "accept-language": lang,
        }
        async with self._lock:  # global 1 req/s
            wait = 1.0 - (time.monotonic() - self._last)
            if wait > 0:
                await asyncio.sleep(wait)
            async with httpx.AsyncClient(timeout=10, headers={"User-Agent": self.settings.nominatim_user_agent}) as client:
                resp = await client.get(self.settings.nominatim_url, params=params)
            self._last = time.monotonic()
        resp.raise_for_status()

        results = [
            {"name": r.get("display_name"), "lat": float(r["lat"]), "lon": float(r["lon"]), "type": r.get("type")}
            for r in resp.json()
        ]
        self._cache[key] = results
        if len(self._cache) > self._max:
            self._cache.popitem(last=False)
        return results[:limit]
