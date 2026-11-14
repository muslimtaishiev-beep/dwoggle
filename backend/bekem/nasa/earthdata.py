"""NASA Earthdata Login (EDL) bearer token, shared by Giovanni and other GES DISC services."""

from __future__ import annotations

import threading
import time
from datetime import datetime

import httpx

TOKEN_URL = "https://urs.earthdata.nasa.gov/api/users/find_or_create_token"


class EarthdataError(RuntimeError):
    pass


class EarthdataToken:
    def __init__(self, username: str, password: str):
        self._auth = (username, password)
        self._token: str | None = None
        self._expires = 0.0
        self._lock = threading.Lock()

    @property
    def configured(self) -> bool:
        return bool(self._auth[0] and self._auth[1])

    def get(self) -> str:
        if not self.configured:
            raise EarthdataError("NASA Earthdata login is not set (BEKEM_EARTHDATA_USERNAME / BEKEM_EARTHDATA_PASSWORD).")
        with self._lock:
            if self._token and time.time() < self._expires - 3600:
                return self._token
            r = httpx.post(TOKEN_URL, auth=self._auth, timeout=30)
            if r.status_code in (401, 403):
                raise EarthdataError("NASA Earthdata rejected the username/password.")
            r.raise_for_status()
            body = r.json()
            self._token = body["access_token"]
            try:
                self._expires = datetime.strptime(body["expiration_date"], "%m/%d/%Y").timestamp()
            except (KeyError, ValueError):
                self._expires = time.time() + 30 * 86400
            return self._token
