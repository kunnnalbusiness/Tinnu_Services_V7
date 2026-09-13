"""Public CoinDCX market data (no auth required)."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from lib.config import COINDCX_API_BASE_URL

logger = logging.getLogger(__name__)

BASE = COINDCX_API_BASE_URL


async def fetch_tickers() -> list[dict[str, Any]]:
    async with httpx.AsyncClient(base_url=BASE, timeout=15) as http:
        res = await http.get("/exchange/ticker")
        res.raise_for_status()
        data = res.json()
    return data if isinstance(data, list) else []


async def fetch_active_instruments(http: httpx.AsyncClient) -> list[str]:
    res = await http.get(
        f"{BASE}/exchange/v1/derivatives/futures/data/active_instruments",
        params={"margin_currency_short_name[]": "INR"},
    )
    res.raise_for_status()
    data = res.json()
    return [str(p) for p in data] if isinstance(data, list) else []


async def load_cached_leverage() -> dict[str, int]:
    return {}


async def fetch_leverage_single(pair: str) -> dict[str, Any]:
    async with httpx.AsyncClient(base_url=BASE, timeout=15) as http:
        res = await http.get(
            "/exchange/v1/derivatives/futures/data/instrument",
            params={"pair": pair, "margin_currency_short_name": "INR"},
        )
        res.raise_for_status()
    payload = res.json() or {}
    if isinstance(payload, dict):
        detail = payload.get("instrument") or payload.get("data")
        if isinstance(detail, dict):
            return detail
        if isinstance(detail, list):
            for item in detail:
                if isinstance(item, dict) and str(item.get("pair") or "") == pair:
                    return item
        if any(key in payload for key in ("max_leverage_long", "max_leverage_short", "dynamic_position_leverage_details")):
            return payload
    return {}


async def fetch_leverage(http: httpx.AsyncClient, pairs: list[str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for pair in pairs:
        try:
            detail = await fetch_leverage_single(pair)
            lev = detail.get("max_leverage_long") or detail.get("max_leverage_short")
            if isinstance(lev, (int, float)) and lev > 0:
                result[pair] = int(lev)
        except Exception:
            pass
    return result
