"""Exchange-synchronised wall clock used by scheduling and candle requests."""
from __future__ import annotations

import logging
import time
from datetime import datetime
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

import httpx

from lib.config import PRICES_URL

logger = logging.getLogger(__name__)
IST = ZoneInfo("Asia/Kolkata")
_offset_seconds = 0.0
_last_sync_ms: int | None = None


def exchange_time() -> float:
    """Return Unix seconds adjusted by the latest exchange clock offset."""
    return time.time() + _offset_seconds


def now_ist() -> datetime:
    return datetime.fromtimestamp(exchange_time(), IST)


def offset_seconds() -> float:
    return _offset_seconds


def last_sync_ms() -> int | None:
    return _last_sync_ms


async def sync_exchange_clock() -> float:
    """Measure local-vs-exchange time using a request midpoint.

    CoinDCX's realtime futures payload contains its server timestamp in `ts`.
    Using the midpoint of the request round trip avoids treating network latency
    as clock drift.
    """
    global _offset_seconds, _last_sync_ms
    started = time.time()
    async with httpx.AsyncClient(timeout=10) as http:
        response = await http.get(PRICES_URL)
    received = time.time()
    payload = response.json() or {}
    server_ms = payload.get("ts") if isinstance(payload, dict) else None
    if not isinstance(server_ms, (int, float)) or server_ms <= 0:
        date_header = response.headers.get("date")
        if not date_header:
            raise RuntimeError("CoinDCX response did not include a server timestamp")
        server_ms = parsedate_to_datetime(date_header).timestamp() * 1000
    midpoint_ms = ((started + received) / 2) * 1000
    _offset_seconds = (float(server_ms) - midpoint_ms) / 1000
    _last_sync_ms = int(float(server_ms))
    logger.info("CoinDCX clock synchronised: offset=%+.3fs", _offset_seconds)
    return _offset_seconds
