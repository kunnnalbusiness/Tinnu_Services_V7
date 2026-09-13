from __future__ import annotations

import os
from typing import Any

from lib.db import db
from lib.security import hash_password, verify_password

ADMIN_EMAIL = (os.environ.get("ADMIN_EMAIL") or "").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""
SECOND_ADMIN_EMAIL = (os.environ.get("SECOND_ADMIN_EMAIL") or "").strip().lower()
SECOND_ADMIN_PASSWORD = os.environ.get("SECOND_ADMIN_PASSWORD") or ""


def configured_users() -> dict[str, dict[str, str]]:
    users: dict[str, dict[str, str]] = {}
    if ADMIN_EMAIL and ADMIN_PASSWORD:
        users[ADMIN_EMAIL] = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "role": "admin"}
    if SECOND_ADMIN_EMAIL and SECOND_ADMIN_PASSWORD:
        users[SECOND_ADMIN_EMAIL] = {
            "email": SECOND_ADMIN_EMAIL,
            "password": SECOND_ADMIN_PASSWORD,
            "role": "admin",
        }
    return users


async def ensure_admin_user() -> dict[str, Any]:
    users = configured_users()
    if not users:
        return {}
    try:
        for email, user in users.items():
            existing = await db.users.find_one({"email": email}, {"password": 1})
            stored_password = str((existing or {}).get("password") or "")
            password = stored_password if stored_password.startswith("scrypt$") else hash_password(user["password"])
            payload = {"email": email, "password": password, "role": "admin", "active": True}
            await db.users.update_one({"email": email}, {"$set": payload}, upsert=True)
    except Exception:
        pass
    return {"email": ADMIN_EMAIL, "role": "admin", "active": True} if ADMIN_EMAIL in users else {}


async def validate_admin_login(email: str, password: str) -> bool:
    normalized_email = (email or "").strip().lower()
    normalized_password = (password or "").strip()

    configured = configured_users()
    if normalized_email in configured and verify_password(normalized_password, configured[normalized_email]["password"]):
        await ensure_admin_user()
        return True

    try:
        user = await db.users.find_one({"email": normalized_email})
    except Exception:
        user = None

    if not user:
        return False

    if str(user.get("email", "")).lower() != normalized_email:
        return False
    stored = str(user.get("password", ""))
    valid = verify_password(normalized_password, stored)
    if valid and not stored.startswith("scrypt$"):
        await db.users.update_one({"email": normalized_email}, {"$set": {"password": hash_password(normalized_password)}})
    return valid
