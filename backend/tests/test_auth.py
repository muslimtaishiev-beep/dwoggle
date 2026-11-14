"""Sign-in: token verification, profile validation, and the /api/me flow. No network."""

import time
from datetime import datetime, timedelta, timezone

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from fastapi.testclient import TestClient
from google.auth import crypt, jwt

from bekem.auth import AuthError, FirebaseVerifier, _from_firestore, _to_firestore
from bekem.main import app
from bekem.profiles import ProfileError, normalize_phone, validate_profile

# --- Phone / profile validation ---------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, country, expected",
    [
        ("+996 (555) 12-34-56", "KG", "+996555123456"),
        ("0555 123 456", "KG", "+996555123456"),
        ("555123456", "KG", "+996555123456"),
        ("00996555123456", "KG", "+996555123456"),
        ("996555123456", "KG", "+996555123456"),
        ("8 701 123 45 67", "KZ", "+77011234567"),
        ("+1 415 555 2671", "US", "+14155552671"),
    ],
)
def test_phone_normalization(raw, country, expected):
    assert normalize_phone(raw, country) == expected


@pytest.mark.parametrize("raw, country", [("12345", "KG"), ("+996 555 12", "KG"), ("hello", "US"), ("", "KG")])
def test_bad_phones_are_rejected(raw, country):
    with pytest.raises(ProfileError) as e:
        normalize_phone(raw, country)
    assert e.value.field == "phone"


def test_profile_validation():
    ok = validate_profile("kg", "0555123456", "buy_land", "  ")
    assert ok == {"country": "KG", "phone": "+996555123456", "purpose": "buy_land", "purpose_note": None}
    for args, field in [
        (("XX", "0555123456", "buy_land", None), "country"),
        (("KG", "0555123456", "spying", None), "purpose"),
        (("KG", "0555123456", "other", ""), "purpose_note"),
        (("KG", "0555123456", "build", "x" * 301), "purpose_note"),
    ]:
        with pytest.raises(ProfileError) as e:
            validate_profile(*args)
        assert e.value.field == field


def test_firestore_value_round_trip():
    now = datetime(2026, 11, 14, 10, 0, tzinfo=timezone.utc)
    for v in ["KG", True, 7, None]:
        assert _from_firestore(_to_firestore(v)) == v
    assert _to_firestore(now) == {"timestampValue": "2026-11-14T10:00:00Z"}


# --- Firebase token verification with our own test key ---------------------------------------

PROJECT = "bekem-test"


@pytest.fixture(scope="module")
def keys():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test")])
    cert = (
        x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(1).not_valid_before(datetime.now(timezone.utc) - timedelta(days=1))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=1)).sign(key, hashes.SHA256())
    )
    pem_key = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    return crypt.RSASigner.from_string(pem_key, key_id="k1"), {"k1": cert.public_bytes(serialization.Encoding.PEM).decode()}


def make_token(signer, **overrides):
    now = int(time.time())
    claims = {
        "iss": f"https://securetoken.google.com/{PROJECT}", "aud": PROJECT, "sub": "uid-1", "auth_time": now - 10,
        "iat": now - 10, "exp": now + 3600, "email": "a@b.kg", "email_verified": True,
        "firebase": {"sign_in_provider": "google.com"},
    }
    claims.update(overrides)
    return jwt.encode(signer, claims).decode()


@pytest.fixture
def verifier(keys):
    v = FirebaseVerifier(PROJECT)
    v._certs, v._certs_expire = keys[1], time.time() + 3600
    return v


def test_valid_firebase_token(keys, verifier):
    user = verifier.verify(make_token(keys[0]))
    assert (user.uid, user.email, user.provider, user.email_verified) == ("uid-1", "a@b.kg", "google.com", True)


@pytest.mark.parametrize(
    "overrides, code",
    [
        ({"aud": "someone-else"}, "token_invalid"),
        ({"iss": "https://securetoken.google.com/someone-else"}, "token_invalid"),
        ({"exp": int(time.time()) - 3600, "iat": int(time.time()) - 7200}, "token_expired"),
        ({"sub": ""}, "token_invalid"),
    ],
)
def test_rejected_firebase_tokens(keys, verifier, overrides, code):
    with pytest.raises(AuthError) as e:
        verifier.verify(make_token(keys[0], **overrides))
    assert e.value.code == code


def test_token_signed_by_another_key_is_rejected(verifier):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = other.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    with pytest.raises(AuthError):
        verifier.verify(make_token(crypt.RSASigner.from_string(pem, key_id="k1")))


# --- API flow (mock mode uses dev tokens and an in-memory store) -------------------------------


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


AUTH = {"Authorization": "Bearer dev:alice:alice@example.com"}


def test_options_are_localized(client):
    r = client.get("/api/auth/options", params={"lang": "ru"}).json()
    assert r["enabled"] and len(r["purposes"]) == 8
    assert {"id": "buy_land", "label": "Покупаю землю или жильё"} in r["purposes"]


def test_me_requires_a_token(client):
    r = client.get("/api/me")
    assert r.status_code == 401 and r.json()["detail"]["code"] == "token_missing"
    r = client.get("/api/me", headers={"Authorization": "Bearer nonsense"})
    assert r.status_code == 401 and r.json()["detail"]["code"] == "token_invalid"


def test_signup_flow(client):
    r = client.get("/api/me", headers=AUTH).json()
    assert r["user"]["email"] == "alice@example.com" and r["profile_complete"] is False

    bad = client.put("/api/me/profile", headers=AUTH,
                     json={"country": "KG", "phone": "12", "purpose": "build", "lang": "ru"})
    assert bad.status_code == 422
    assert bad.json()["detail"] == {"field": "phone", "code": "phone_invalid",
                                    "message": "Введите правильный номер, например +996 555 123 456."}

    ok = client.put("/api/me/profile", headers=AUTH,
                    json={"country": "KG", "phone": "0555 12 34 56", "purpose": "buy_land"}).json()
    assert ok["profile_complete"] and ok["profile"]["phone"] == "+996555123456"
    created = ok["profile"]["created_at"]

    again = client.put("/api/me/profile", headers=AUTH,
                       json={"country": "KG", "phone": "+996555123456", "purpose": "other", "purpose_note": "school project"}).json()
    assert again["profile"]["purpose"] == "other" and again["profile"]["created_at"] == created

    assert client.delete("/api/me", headers=AUTH).json() == {"deleted": True}
    assert client.get("/api/me", headers=AUTH).json()["profile"] is None


def test_cloud_run_uses_its_own_identity_without_a_key(monkeypatch):
    import google.auth
    from google.auth.credentials import AnonymousCredentials

    from bekem.auth import make_auth
    from bekem.config import Settings

    monkeypatch.setenv("K_SERVICE", "bekem-api")
    monkeypatch.setattr(google.auth, "default", lambda scopes=None: (AnonymousCredentials(), "bekem-514710"))
    auth = make_auth(Settings(provider="earthengine", ee_project="", ee_service_account_key=""))
    assert auth is not None and auth.mode == "firebase" and auth.project_id == "bekem-514710"

    monkeypatch.delenv("K_SERVICE")
    assert make_auth(Settings(provider="earthengine", ee_service_account_key="")) is None  # laptop, no key: 503
