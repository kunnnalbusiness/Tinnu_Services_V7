"""Centralized app and CoinDCX configuration."""

import os
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env", override=False)

APP_URL = os.environ.get("APP_URL", "http://localhost:3000")

COINDCX_PUBLIC_BASE_URL = "https://public.coindcx.com"
COINDCX_API_BASE_URL = os.environ.get("COINDCX_BASE_URL", "https://api.coindcx.com")
COINDCX_WS_URL = os.environ.get("COINDCX_WS_URL", "https://stream.coindcx.com")
COINDCX_WS_PRICE_CHANNEL = os.environ.get(
    "COINDCX_WS_PRICE_CHANNEL", "currentPrices@futures@rt"
)

CANDLES_URL = f"{COINDCX_PUBLIC_BASE_URL}/market_data/candlesticks"
PRICES_URL = f"{COINDCX_PUBLIC_BASE_URL}/market_data/v3/current_prices/futures/rt"


class ConfigService:
    """Read typed runtime settings while preserving the module-level API."""

    def __init__(self, environ: dict[str, str] | None = None):
        self._environ = os.environ if environ is None else environ

    def _env_value(
        self, name: str, default: str | int | float | bool, *, cast: type | None = None
    ):
        raw = self._environ.get(name)
        if raw is None:
            return default
        if cast is bool:
            return raw.strip().lower() in {"1", "true", "yes", "on"}
        if cast is int:
            return int(raw)
        if cast is float:
            return float(raw)
        if cast is Decimal:
            return Decimal(str(raw))
        return raw

    def get_str(self, name: str, default: str) -> str:
        return str(self._env_value(name, default, cast=str))

    def get_int(self, name: str, default: int) -> int:
        return int(self._env_value(name, default, cast=int))

    def get_float(self, name: str, default: float) -> float:
        return float(self._env_value(name, default, cast=float))

    def get_bool(self, name: str, default: bool) -> bool:
        return bool(self._env_value(name, default, cast=bool))

    def get_decimal(self, name: str, default: str | int | float | Decimal) -> Decimal:
        return Decimal(str(self._env_value(name, default, cast=Decimal)))


config_service = ConfigService()


def get_str(name: str, default: str) -> str:
    return config_service.get_str(name, default)


def get_int(name: str, default: int) -> int:
    return config_service.get_int(name, default)


def get_float(name: str, default: float) -> float:
    return config_service.get_float(name, default)


def get_bool(name: str, default: bool) -> bool:
    return config_service.get_bool(name, default)


def get_decimal(name: str, default: str | int | float | Decimal) -> Decimal:
    return config_service.get_decimal(name, default)


# Runtime defaults kept in one place so production and local values can be overridden with env vars.
RUNTIME_FEE_SAFETY_BUFFER = get_decimal("RUNTIME_FEE_SAFETY_BUFFER", "0.98")
RUNTIME_LIVE_MARGIN_UTILIZATION_LIMIT = get_decimal(
    "RUNTIME_LIVE_MARGIN_UTILIZATION_LIMIT", "0.70"
)
RUNTIME_LIVE_MARGIN_MINIMUM = get_decimal("RUNTIME_LIVE_MARGIN_MINIMUM", "250")
RUNTIME_ORDER_RETRY_ATTEMPTS = get_int("RUNTIME_ORDER_RETRY_ATTEMPTS", 3)
RUNTIME_ORDER_RETRY_DELAY = get_float("RUNTIME_ORDER_RETRY_DELAY", 2.0)
RUNTIME_LINK_TIMEOUT_SECONDS = get_int("RUNTIME_LINK_TIMEOUT_SECONDS", 60)
RUNTIME_LINK_RETRY_SECONDS = get_int("RUNTIME_LINK_RETRY_SECONDS", 6)
RUNTIME_LIQUIDATION_CHECK_SECONDS = get_int("RUNTIME_LIQUIDATION_CHECK_SECONDS", 10)
RUNTIME_DB_RETRY_ATTEMPTS = get_int("RUNTIME_DB_RETRY_ATTEMPTS", 3)
RUNTIME_DB_RETRY_DELAY = get_float("RUNTIME_DB_RETRY_DELAY", 1.0)

MARKET_TOP_N = get_int("MARKET_TOP_N", 4)
MARKET_PRICE_EVENT = get_str("MARKET_PRICE_EVENT", "currentPrices@futures#update")

COINDCX_BALANCE_SETTLE_WINDOW = get_float("COINDCX_BALANCE_SETTLE_WINDOW", 2.0)
COINDCX_POSITION_LOOKUP_ATTEMPTS = get_int("COINDCX_POSITION_LOOKUP_ATTEMPTS", 7)
COINDCX_POSITION_LOOKUP_DELAY = get_float("COINDCX_POSITION_LOOKUP_DELAY", 2.0)

WS_HEARTBEAT = get_str("WS_HEARTBEAT", '{"type":"ping"}')
WS_IDLE_TIMEOUT = get_float("WS_IDLE_TIMEOUT", 1.0)

CANDLE_CACHE_TTL = get_float("CANDLE_CACHE_TTL", 2.0)
HISTORICAL_CONCURRENCY = get_int("HISTORICAL_CONCURRENCY", 8)
