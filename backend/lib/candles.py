"""CoinDCX candlestick fetching with a short-lived in-process cache."""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from lib.clock import exchange_time
from lib.config import CANDLES_URL, CANDLE_CACHE_TTL

# resolution -> seconds per candle
RESOLUTIONS: dict[str, int] = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "2h": 7200,
    "4h": 14400,
    "1d": 86400,
    "1w": 604800,
    "1M": 2592000,
}

CACHE_TTL = max(10.0, float(CANDLE_CACHE_TTL))
_cache: dict[tuple[str, str], tuple[float, list[dict[str, Any]]]] = {}
_key_locks: dict[tuple[str, str], asyncio.Lock] = {}
_shared_client: httpx.AsyncClient | None = None


def _get_key_lock(key: tuple[str, str]) -> asyncio.Lock:
    if key not in _key_locks:
        _key_locks[key] = asyncio.Lock()
    return _key_locks[key]


def _get_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(timeout=10.0, limits=httpx.Limits(max_keepalive_connections=20, max_connections=40))
    return _shared_client


def _normalise(rows: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    unique: dict[int, dict[str, Any]] = {}
    for row in rows:
        if row.get("time") is None:
            continue

        timestamp = int(row["time"])
        if abs(timestamp) >= 1_000_000_000_000:
            timestamp //= 1000

        unique[timestamp] = {
            "time": timestamp,
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row.get("volume") or 0),
        }

    return [unique[timestamp] for timestamp in sorted(unique)[-limit:]]


def _merge_pairs(candles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aggregate aligned, complete 1h pairs into a 2h series."""
    buckets: dict[int, list[dict[str, Any]]] = {}
    for candle in candles:
        bucket = (candle["time"] // RESOLUTIONS["2h"]) * RESOLUTIONS["2h"]
        buckets.setdefault(bucket, []).append(candle)

    merged: list[dict[str, Any]] = []
    for bucket, pair in sorted(buckets.items()):
        pair.sort(key=lambda candle: candle["time"])
        if len(pair) != 2 or pair[1]["time"] - pair[0]["time"] != RESOLUTIONS["1h"]:
            continue
        a, b = pair
        merged.append(
            {
                "time": bucket,
                "open": a["open"],
                "high": max(a["high"], b["high"]),
                "low": min(a["low"], b["low"]),
                "close": b["close"],
                "volume": a["volume"] + b["volume"],
            }
        )
    return merged


def _normalize_pair(pair: str) -> str:
    p = pair.strip()
    if not p.startswith("B-"):
        p = f"B-{p}"
    return p


async def _fetch(pair: str, resolution: str, limit: int) -> list[dict[str, Any]]:
    clean_pair = _normalize_pair(pair)
    span = RESOLUTIONS[resolution] * (limit + 5)
    now = int(exchange_time())
    client = _get_client()
    res = await client.get(
        CANDLES_URL,
        params={"pair": clean_pair, "from": now - span, "to": now, "resolution": resolution, "pcode": "f"},
    )
    res.raise_for_status()
    payload = res.json() or {}
    return _normalise(payload.get("data") or [], limit)


async def fetch_range(pair: str, resolution: str, start: int, end: int, limit: int = 200) -> list[dict[str, Any]]:
    """Fetch candles for a historical Unix-second range without touching the live cache."""
    clean_pair = _normalize_pair(pair)
    client = _get_client()
    response = await client.get(
        CANDLES_URL,
        params={"pair": clean_pair, "from": start, "to": end, "resolution": resolution, "pcode": "f"},
    )
    response.raise_for_status()
    payload = response.json() or {}
    return _normalise(payload.get("data") or [], limit)


async def fetch_candle_at(pair: str, resolution: str, timestamp_ms: int) -> dict[str, Any] | None:
    """Return the first candle at or immediately after a Unix-millisecond timestamp."""
    rows = await fetch_range(pair, resolution, timestamp_ms // 1000, timestamp_ms // 1000 + 60, 1)
    return rows[0] if rows else None


async def get_candles(pair: str, resolution: str, limit: int = 60) -> list[dict[str, Any]]:
    clean_pair = _normalize_pair(pair)
    key = (clean_pair, resolution)
    cached = _cache.get(key)
    now_ts = time.time()
    if cached and (now_ts - cached[0] < CACHE_TTL):
        return cached[1]

    lock = _get_key_lock(key)
    async with lock:
        cached = _cache.get(key)
        if cached and (time.time() - cached[0] < CACHE_TTL):
            return cached[1]

        try:
            if resolution == "2h":
                hourly = await _fetch(clean_pair, "1h", limit * 2)
                candles = _merge_pairs(hourly)[-limit:]
            else:
                candles = await _fetch(clean_pair, resolution, limit)
            _cache[key] = (time.time(), candles)
            return candles
        except Exception:
            # If fetch fails, return stale cache if present to avoid breaking UI
            if cached:
                return cached[1]
            return []
