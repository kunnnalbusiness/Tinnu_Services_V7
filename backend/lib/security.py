"""Small security helpers for encrypted secrets and password hashes."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)


_PASSWORD_PREFIX = "scrypt$"


def _fernet() -> Fernet:
    key = (os.environ.get("CREDENTIAL_ENCRYPTION_KEY") or "").strip()
    if not key:
        raise RuntimeError("CREDENTIAL_ENCRYPTION_KEY is not configured")
    try:
        # Hosting dashboards sometimes trim trailing Base64 padding from secrets.
        padded_key = key + ("=" * (-len(key) % 4))
        return Fernet(padded_key.encode("ascii"))
    except Exception as exc:
        raise RuntimeError("CREDENTIAL_ENCRYPTION_KEY is invalid") from exc


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeError, ValueError) as exc:
        raise RuntimeError("stored credential cannot be decrypted") from exc


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"{_PASSWORD_PREFIX}{base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    if not stored.startswith(_PASSWORD_PREFIX):
        return hmac.compare_digest(password, stored)
    try:
        _, salt_text, digest_text = stored.split("$", 2)
        salt = base64.urlsafe_b64decode(salt_text.encode())
        expected = base64.urlsafe_b64decode(digest_text.encode())
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False
