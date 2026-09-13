"""Per-user CoinDCX credentials and live-trading state.

Credentials are always loaded from and saved to encrypted MongoDB settings. The
environment never supplies exchange API keys, so users can rotate credentials from
the UI without redeploying or sharing keys between accounts.
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any

from lib.db import db
from lib.security import decrypt_secret, encrypt_secret

_DOC_ID = "coindcx"
_current_user: ContextVar[str] = ContextVar("coindcx_user", default="admin")
_cache: dict[str, Any] = {
    "api_key": "",
    "api_secret": "",
    "live_trading": False,
    "loaded": False,
}
_states: dict[str, dict[str, Any]] = {}


class CredentialsService:
    """Manage per-user credentials and live-trading state."""

    def __init__(self, database: Any = db):
        self._database = database
        self._current_user = _current_user
        self._cache = _cache
        self._states = _states

    def set_user(self, user_id: str) -> None:
        self._current_user.set(user_id.strip().lower() or "admin")

    def user_id(self) -> str:
        return self._current_user.get()

    def _state(self) -> dict[str, Any]:
        if self.user_id() == "admin":
            return self._cache
        return self._states.setdefault(
            self.user_id(),
            {"api_key": "", "api_secret": "", "live_trading": False, "loaded": False},
        )

    def _settings_id(self) -> str:
        return f"{_DOC_ID}:{self.user_id()}"

    @staticmethod
    def mask(value: str) -> str:
        if not value:
            return ""
        return f"{'*' * max(4, len(value) - 4)}{value[-4:]}"

    async def load(self) -> None:
        doc = None
        try:
            doc = await self._database.settings.find_one({"_id": self._settings_id()})
        except Exception:
            doc = None
        if doc:
            try:
                legacy_key = str(doc.get("api_key") or "")
                legacy_secret = str(doc.get("api_secret") or "")
                api_key = decrypt_secret(str(doc.get("api_key_enc") or "")) if doc.get("api_key_enc") else legacy_key
                api_secret = decrypt_secret(str(doc.get("api_secret_enc") or "")) if doc.get("api_secret_enc") else legacy_secret
                if legacy_key or legacy_secret:
                    await self._database.settings.update_one(
                        {"_id": self._settings_id()},
                        {"$set": {"api_key_enc": encrypt_secret(api_key), "api_secret_enc": encrypt_secret(api_secret)}, "$unset": {"api_key": "", "api_secret": ""}},
                    )
            except RuntimeError:
                api_key = api_secret = ""
            self._state().update(api_key=api_key, api_secret=api_secret, live_trading=bool(doc.get("live_trading")))
        else:
            self._state().update(api_key="", api_secret="", live_trading=False)
        self._state()["loaded"] = True

    async def ensure_loaded(self) -> None:
        """Load the current user's encrypted settings once per process lifecycle."""
        if not self._state().get("loaded"):
            await self.load()

    async def save(self, api_key: str, api_secret: str) -> None:
        clean_key = api_key.strip()
        clean_secret = api_secret.strip()
        encrypted_key = encrypt_secret(clean_key)
        encrypted_secret = encrypt_secret(clean_secret)
        await self._database.settings.update_one(
            {"_id": self._settings_id()},
            {
                "$set": {
                    "api_key_enc": encrypted_key,
                    "api_secret_enc": encrypted_secret,
                }
            },
            upsert=True,
        )
        self._state().update(api_key=clean_key, api_secret=clean_secret)

    async def clear(self) -> None:
        self._state().update(api_key="", api_secret="", live_trading=False)
        await self._database.settings.delete_one({"_id": self._settings_id()})

    async def set_live(self, on: bool) -> None:
        self._state()["live_trading"] = bool(on) and self.configured()
        await self._database.settings.update_one(
            {"_id": self._settings_id()},
            {"$set": {"live_trading": self._state()["live_trading"]}},
            upsert=True,
        )

    def credentials(self) -> tuple[str, str]:
        return str(self._state()["api_key"]), str(self._state()["api_secret"])

    def set_runtime(self, api_key: str, api_secret: str) -> None:
        self._state().update(api_key=api_key.strip(), api_secret=api_secret.strip())

    def configured(self) -> bool:
        return bool(self._state()["api_key"] and self._state()["api_secret"])

    def live_enabled(self) -> bool:
        return bool(self._state()["live_trading"]) and self.configured()

    def status(self) -> dict[str, Any]:
        return {
            "configured": self.configured(),
            "api_key_masked": self.mask(str(self._state()["api_key"])),
            "api_secret_masked": self.mask(str(self._state()["api_secret"])),
            "live_trading": self.live_enabled(),
        }


credentials_service = CredentialsService()

set_user = credentials_service.set_user
user_id = credentials_service.user_id
_state = credentials_service._state
_settings_id = credentials_service._settings_id
mask = credentials_service.mask
load = credentials_service.load
ensure_loaded = credentials_service.ensure_loaded
save = credentials_service.save
clear = credentials_service.clear
set_live = credentials_service.set_live
set_runtime = credentials_service.set_runtime
credentials = credentials_service.credentials
configured = credentials_service.configured
live_enabled = credentials_service.live_enabled
status = credentials_service.status
