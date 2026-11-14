"""Sign-in: Firebase Authentication (email + password, or Google) and user profiles in Firestore.

Who does what
- The frontend signs people in with the Firebase JS SDK. Firebase stores and hashes passwords, sends
  verification and reset emails, and runs "Sign in with Google". Bekem never sees a password.
- Every API call that needs a user carries `Authorization: Bearer <Firebase ID token>`. We verify the
  token's signature against Google's public certificates, plus its project, issuer and expiry.
- The profile (country, phone, why they're here) lives in Firestore `users/{uid}`, written only by this
  backend. Firestore rules deny all client access, so nobody can read another person's phone number.

Plain HTTPS (google-auth + requests) instead of firebase-admin: the gRPC library firebase-admin needs is
blocked on some Windows machines, and this keeps the container image small.
"""

from __future__ import annotations

import json
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

import google.auth
import requests
from google.auth import jwt
from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

from .config import BASE_DIR, Settings, on_cloud_run

CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
FIRESTORE = "https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents"
IDENTITY = "https://identitytoolkit.googleapis.com/v1/projects/{project}"
SCOPES = ["https://www.googleapis.com/auth/datastore", "https://www.googleapis.com/auth/cloud-platform"]


class AuthError(Exception):
    """Token missing, invalid or expired. `code` is stable for the frontend; the message is for humans."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class AuthUser:
    uid: str
    email: str | None
    email_verified: bool
    provider: str  # "password" | "google.com" | "dev"
    name: str | None = None


# --- Token verification -----------------------------------------------------------------------


class FirebaseVerifier:
    def __init__(self, project_id: str, clock_skew_s: int = 10):
        self.project_id = project_id
        self.clock_skew_s = clock_skew_s
        self._certs: dict[str, str] = {}
        self._certs_expire = 0.0
        self._lock = threading.Lock()

    def _certificates(self) -> dict[str, str]:
        """Google's signing certificates, cached for as long as Google says (Cache-Control max-age)."""
        with self._lock:
            if self._certs and time.time() < self._certs_expire:
                return self._certs
            r = requests.get(CERTS_URL, timeout=10)
            r.raise_for_status()
            m = re.search(r"max-age=(\d+)", r.headers.get("Cache-Control", ""))
            self._certs = r.json()
            self._certs_expire = time.time() + (int(m.group(1)) if m else 3600)
            return self._certs

    def verify(self, token: str) -> AuthUser:
        try:
            claims = jwt.decode(
                token, certs=self._certificates(), audience=self.project_id, clock_skew_in_seconds=self.clock_skew_s
            )
        except ValueError as e:  # google-auth raises ValueError subclasses for bad/expired tokens
            msg = str(e).lower()
            if "expired" in msg or "too late" in msg:
                raise AuthError("token_expired", "Your sign-in has expired. Please sign in again.") from e
            raise AuthError("token_invalid", "Invalid sign-in token.") from e
        if claims.get("iss") != f"https://securetoken.google.com/{self.project_id}" or not claims.get("sub"):
            raise AuthError("token_invalid", "This sign-in token is not for Bekem.")
        if claims.get("auth_time", 0) > time.time() + self.clock_skew_s:
            raise AuthError("token_invalid", "Invalid sign-in token.")
        return AuthUser(
            uid=claims["sub"],
            email=claims.get("email"),
            email_verified=bool(claims.get("email_verified")),
            provider=claims.get("firebase", {}).get("sign_in_provider", "unknown"),
            name=claims.get("name"),
        )


class DevVerifier:
    """Mock mode only: accepts `dev:<uid>:<email>` so the frontend can be built without Firebase."""

    def verify(self, token: str) -> AuthUser:
        parts = token.split(":")
        if len(parts) != 3 or parts[0] != "dev" or not parts[1]:
            raise AuthError("token_invalid", "In mock mode use a token like dev:alice:alice@example.com")
        return AuthUser(uid=parts[1], email=parts[2] or None, email_verified=True, provider="dev")


# --- Profile storage --------------------------------------------------------------------------


class UserStore(Protocol):
    def get(self, uid: str) -> dict | None: ...
    def save(self, uid: str, profile: dict) -> None: ...
    def delete(self, uid: str) -> None: ...


class MemoryStore:
    """In-process store for tests and mock mode. Forgets everything on restart."""

    def __init__(self):
        self._data: dict[str, dict] = {}

    def get(self, uid: str) -> dict | None:
        return dict(self._data[uid]) if uid in self._data else None

    def save(self, uid: str, profile: dict) -> None:
        self._data[uid] = dict(profile)

    def delete(self, uid: str) -> None:
        self._data.pop(uid, None)


def _to_firestore(value) -> dict:
    if value is None:
        return {"nullValue": None}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, datetime):
        return {"timestampValue": value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")}
    if isinstance(value, (list, tuple)):
        return {"arrayValue": {"values": [_to_firestore(v) for v in value]} if value else {}}
    return {"stringValue": str(value)}


def _from_firestore(field: dict):
    (kind, value), = field.items()
    if kind == "integerValue":
        return int(value)
    if kind == "nullValue":
        return None
    if kind == "arrayValue":
        return [_from_firestore(v) for v in value.get("values", [])]
    return value  # stringValue, booleanValue, timestampValue (ISO string)


class FirestoreStore:
    """Firestore over REST, authenticated as the backend's service account."""

    def __init__(self, project_id: str, session: AuthorizedSession, collection: str = "users"):
        self.base = f"{FIRESTORE.format(project=project_id)}/{collection}"
        self.session = session

    def get(self, uid: str) -> dict | None:
        r = self.session.get(f"{self.base}/{uid}", timeout=10)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return {k: _from_firestore(v) for k, v in r.json().get("fields", {}).items()}

    def save(self, uid: str, profile: dict) -> None:
        # PATCH with an update mask merges these fields and creates the document if needed.
        params = [("updateMask.fieldPaths", k) for k in profile]
        body = {"fields": {k: _to_firestore(v) for k, v in profile.items()}}
        self.session.patch(f"{self.base}/{uid}", params=params, json=body, timeout=10).raise_for_status()

    def delete(self, uid: str) -> None:
        r = self.session.delete(f"{self.base}/{uid}", timeout=10)
        if r.status_code not in (200, 404):
            r.raise_for_status()


def delete_firebase_user(session: AuthorizedSession, project_id: str, uid: str) -> None:
    """Remove the sign-in account itself (email/password or Google link) from Firebase Authentication."""
    r = session.post(f"{IDENTITY.format(project=project_id)}/accounts:delete", json={"localId": uid}, timeout=10)
    if r.status_code not in (200, 400):  # 400 USER_NOT_FOUND: already gone
        r.raise_for_status()


# --- Wiring ---------------------------------------------------------------------------------


@dataclass
class Auth:
    verifier: FirebaseVerifier | DevVerifier
    store: UserStore
    session: AuthorizedSession | None = None
    project_id: str = ""
    mode: str = "firebase"  # firebase | dev

    def delete_account(self, uid: str) -> None:
        self.store.delete(uid)
        if self.session is not None:
            delete_firebase_user(self.session, self.project_id, uid)


def _service_account_info(s: Settings) -> dict | None:
    raw = s.firebase_service_account_key_json or s.ee_service_account_key_json
    path = s.firebase_service_account_key or s.ee_service_account_key
    if not raw and path:
        p = Path(path)
        raw = (p if p.is_absolute() else BASE_DIR / p).read_text(encoding="utf-8")
    return json.loads(raw) if raw else None


def make_auth(s: Settings) -> Auth | None:
    """Firebase with a key file or (on Cloud Run) the service's own account; dev tokens in mock mode; else None (503)."""
    info = _service_account_info(s)
    creds, project = None, s.firebase_project or (info or {}).get("project_id") or s.ee_project
    if info:
        creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    elif on_cloud_run():
        creds, adc_project = google.auth.default(scopes=SCOPES)
        project = project or adc_project
    if creds is not None and project:
        session = AuthorizedSession(creds)
        return Auth(FirebaseVerifier(project), FirestoreStore(project, session), session, project, "firebase")
    if s.provider == "mock":
        return Auth(DevVerifier(), MemoryStore(), mode="dev")
    return None
