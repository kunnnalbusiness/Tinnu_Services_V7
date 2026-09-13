"""Authenticated CoinDCX futures client (INR margin) + paper-trading fallback."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import time
from decimal import ROUND_CEILING, ROUND_DOWN, ROUND_HALF_UP, Decimal
from typing import Any

import httpx

from lib import credentials as creds
from lib.clock import exchange_time
from lib.db import db
from lib.config import (
    COINDCX_API_BASE_URL,
    COINDCX_BALANCE_SETTLE_WINDOW,
    COINDCX_POSITION_LOOKUP_ATTEMPTS,
    COINDCX_POSITION_LOOKUP_DELAY,
)

BASE = COINDCX_API_BASE_URL
BALANCE_SETTLE_WINDOW = float(COINDCX_BALANCE_SETTLE_WINDOW)
POSITION_LOOKUP_ATTEMPTS = int(COINDCX_POSITION_LOOKUP_ATTEMPTS)
POSITION_LOOKUP_DELAY = float(COINDCX_POSITION_LOOKUP_DELAY)

logger = logging.getLogger(__name__)


def _audit_value(value: Any) -> Any:
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        return str(value)


async def _save_api_audit(
    method: str,
    path: str,
    request_payload: dict[str, Any],
    *,
    status_code: int | None = None,
    response: Any = None,
    error: str | None = None,
) -> None:
    """Persist exchange request details without storing auth headers or secrets."""
    try:
        await db.trade_api_audit.insert_one(
            {
                "owner_id": creds.user_id(),
                "method": method,
                "path": path,
                "request_json": _audit_value(request_payload),
                "response_json": _audit_value(response) if response is not None else None,
                "status_code": status_code,
                "error": error,
                "created_at": time.time(),
            }
        )
    except Exception as exc:
        logger.warning("trade API audit could not be saved: %s", exc)


def credentials() -> tuple[str, str]:
    return creds.credentials()


def live_enabled() -> bool:
    return creds.live_enabled()


def mode() -> str:
    return "LIVE" if live_enabled() else "PAPER"


class CoinDcxError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, request_id: str | None = None):
        self.status_code = status_code
        self.request_id = request_id
        suffix = f" (request ID: {request_id})" if request_id else ""
        super().__init__(f"{message}{suffix}")


def _exchange_error(response: httpx.Response) -> CoinDcxError:
    request_id = response.headers.get("x-request-id") or response.headers.get("x-correlation-id")
    detail = response.text[:400]
    try:
        payload = response.json()
    except ValueError:
        payload = None
    if isinstance(payload, dict):
        request_id = request_id or str(payload.get("request_id") or payload.get("requestId") or "") or None
        detail = str(payload.get("message") or payload.get("error") or payload.get("code") or detail)[:400]
    return CoinDcxError(
        f"CoinDCX returned HTTP {response.status_code}: {detail}",
        status_code=response.status_code,
        request_id=request_id,
    )


def _signed(payload: dict[str, Any]) -> tuple[bytes, dict[str, str]]:
    key, secret = credentials()
    if not key or not secret:
        raise CoinDcxError("CoinDCX API credentials are not configured")
    body = {**payload, "timestamp": int(exchange_time() * 1000)}
    raw = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return raw, {
        "Content-Type": "application/json",
        "X-AUTH-APIKEY": key,
        "X-AUTH-SIGNATURE": signature,
    }


async def signed_post(path: str, payload: dict[str, Any]) -> Any:
    try:
        raw, headers = _signed(payload)
        async with httpx.AsyncClient(base_url=BASE, timeout=httpx.Timeout(10, read=30)) as http:
            res = await http.post(path, content=raw, headers=headers)
        response_text = res.text[:4000]
        if res.status_code >= 400:
            await _save_api_audit("POST", path, payload, status_code=res.status_code, response=response_text, error=response_text)
            raise _exchange_error(res)
        data = res.json()
        await _save_api_audit("POST", path, payload, status_code=res.status_code, response=data)
        return data
    except CoinDcxError as exc:
        if exc.status_code is None:
            await _save_api_audit("POST", path, payload, error=str(exc))
        raise
    except Exception as exc:
        await _save_api_audit("POST", path, payload, error=str(exc))
        raise


async def signed_get(path: str, payload: dict[str, Any]) -> Any:
    try:
        raw, headers = _signed(payload)
        async with httpx.AsyncClient(base_url=BASE, timeout=httpx.Timeout(10, read=30)) as http:
            # CoinDCX signs a JSON body and sends it as a GET request.
            res = await http.request("GET", path, data=raw, headers=headers)
        response_text = res.text[:4000]
        if res.status_code >= 400:
            await _save_api_audit("GET", path, payload, status_code=res.status_code, response=response_text, error=response_text)
            raise _exchange_error(res)
        data = res.json()
        await _save_api_audit("GET", path, payload, status_code=res.status_code, response=data)
        return data
    except CoinDcxError as exc:
        if exc.status_code is None:
            await _save_api_audit("GET", path, payload, error=str(exc))
        raise
    except Exception as exc:
        await _save_api_audit("GET", path, payload, error=str(exc))
        raise


async def inr_instruments() -> list[str]:
    try:
        async with httpx.AsyncClient(base_url=BASE, timeout=15) as http:
            res = await http.get(
                "/exchange/v1/derivatives/futures/data/active_instruments",
                params={"margin_currency_short_name[]": "INR"},
            )
            if res.status_code >= 400:
                raise _exchange_error(res)
            data = res.json()
    except CoinDcxError:
        raise
    except httpx.HTTPError as exc:
        raise CoinDcxError(f"CoinDCX instruments request failed: {exc}") from exc
    return [str(p) for p in data] if isinstance(data, list) else []


_rate_cache: tuple[float, Decimal] | None = None


async def usdt_inr_rate() -> Decimal:
    global _rate_cache
    if _rate_cache and time.time() - _rate_cache[0] < 60:
        return _rate_cache[1]
    try:
        async with httpx.AsyncClient(base_url=BASE, timeout=15) as http:
            res = await http.get("/exchange/ticker")
            if res.status_code >= 400:
                raise _exchange_error(res)
            rows = res.json()
    except CoinDcxError:
        raise
    except httpx.HTTPError as exc:
        raise CoinDcxError(f"CoinDCX ticker request failed: {exc}") from exc
    for row in rows if isinstance(rows, list) else []:
        if row.get("market") == "USDTINR":
            rate = Decimal(str(row.get("last_price") or 0))
            if rate > 0:
                _rate_cache = (time.time(), rate)
                return rate
    raise CoinDcxError("USDTINR rate unavailable")


async def instrument_detail(pair: str, margin: str = "INR") -> dict[str, Any]:
    async with httpx.AsyncClient(base_url=BASE, timeout=15) as http:
        res = await http.get(
            "/exchange/v1/derivatives/futures/data/instrument",
            params={"pair": pair, "margin_currency_short_name": margin},
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
        if any(key in payload for key in ("unit_contract_value", "quantity_increment", "min_quantity")):
            return payload
    return {}


def max_leverage_for(instrument: dict[str, Any], ceiling: float = 10) -> float:
    value = instrument.get("max_leverage_short") or instrument.get("max_leverage_long")
    if isinstance(value, (int, float)) and value > 0:
        return max(1, min(ceiling, float(value)))
    levels = instrument.get("dynamic_position_leverage_details")
    if isinstance(levels, dict) and levels:
        try:
            return max(1, min(ceiling, float(max(int(k) for k in levels))))
        except ValueError:
            pass
    return ceiling


def order_quantity(
    capital_inr: Decimal,
    price_usdt: Decimal,
    instrument: dict[str, Any],
    leverage: float,
    usdt_inr: Decimal,
) -> Decimal:
    def decimal_field(*names: str, default: Decimal = Decimal(0)) -> Decimal:
        for name in names:
            value = instrument.get(name)
            if value is not None and value != "":
                try:
                    return Decimal(str(value))
                except (TypeError, ValueError):
                    continue
        return default

    unit = decimal_field("unit_contract_value", "contract_size", "contract_value", default=Decimal(1))
    step = decimal_field("quantity_increment", "quantity_step", "step", default=Decimal(1))
    min_qty = decimal_field("min_quantity", "minimum_quantity", "min_order_quantity")
    if price_usdt <= 0 or unit <= 0 or step <= 0 or usdt_inr <= 0:
        raise CoinDcxError("instrument metadata is incomplete")
    notional_usdt = capital_inr / usdt_inr * Decimal(leverage)
    raw_qty = notional_usdt / (price_usdt * unit)
    qty = (raw_qty / step).to_integral_value(rounding=ROUND_DOWN) * step
    if min_qty > 0:
        qty = max(qty, (min_qty / step).to_integral_value(rounding=ROUND_CEILING) * step)
    max_qty = decimal_field("max_market_order_quantity", "max_quantity")
    if max_qty > 0 and qty > max_qty:
        qty = (max_qty / step).to_integral_value(rounding=ROUND_DOWN) * step
    if qty <= 0 or (min_qty > 0 and qty < min_qty):
        raise CoinDcxError("computed quantity is below the instrument minimum")
    required_capital = qty * price_usdt * unit * usdt_inr / Decimal(str(leverage))
    if required_capital > capital_inr:
        raise CoinDcxError("minimum exchange quantity exceeds the capital limit")
    return qty


def round_price(price: Decimal, instrument: dict[str, Any]) -> Decimal:
    tick = Decimal(0)
    for name in ("price_increment", "tick_size", "price_step", "min_price_increment"):
        value = instrument.get(name)
        if value is not None and value != "":
            try:
                candidate = Decimal(str(value))
            except (TypeError, ValueError):
                continue
            if candidate > 0:
                tick = candidate
                break
    if tick <= 0 or price <= 0:
        return price
    steps = (price / tick).to_integral_value(rounding=ROUND_HALF_UP)
    snapped = steps * tick
    return snapped if snapped > 0 else tick


async def inr_wallet_balance() -> Decimal:
    data = await signed_get("/exchange/v1/derivatives/futures/wallets", {})
    rows = data if isinstance(data, list) else [data]
    inr_rows = [
        row
        for row in rows
        if isinstance(row, dict)
        and str(row.get("currency_short_name") or row.get("currency") or "").upper() == "INR"
    ]
    if not inr_rows:
        raise CoinDcxError("CoinDCX futures wallet response did not contain INR")
    row = inr_rows[0]
    available = row.get("available_balance")
    if available is not None and available != "":
        try:
            return max(Decimal(0), Decimal(str(available)))
        except (TypeError, ValueError):
            pass
    balance = Decimal(str(row.get("balance") or 0))
    locked = Decimal(str(row.get("locked_balance") or row.get("locked") or 0))
    return max(Decimal(0), balance - locked)


async def validate_live_credentials() -> dict[str, Any]:
    if not credentials()[0] or not credentials()[1]:
        raise CoinDcxError("CoinDCX API credentials are not configured")
    balance = await inr_wallet_balance()
    active = await inr_instruments()
    rate = await usdt_inr_rate()
    positions = await open_positions()
    summary = {
        "configured": True,
        "live_ready": True,
        "wallet_balance_inr": float(balance),
        "active_instruments_count": len(active),
        "open_positions_count": len(positions) if isinstance(positions, list) else 0,
        "usdt_inr_rate": float(rate),
        "message": "Credentials validated successfully against CoinDCX INR account balance.",
    }
    return summary


def _normalize_dict_response(data: Any) -> dict[str, Any]:
    """CoinDCX occasionally wraps a single object in a list."""
    if isinstance(data, dict):
        return data
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0]
    return {}


async def open_short(
    pair: str, quantity: Decimal, leverage: float, margin_currency_short_name: str = "INR"
) -> dict[str, Any]:
    data = await signed_post(
        "/exchange/v1/derivatives/futures/orders/create",
        {
            "order": {
                "side": "sell",
                "pair": pair,
                "order_type": "market_order",
                "total_quantity": float(quantity),
                "leverage": int(leverage),
                "notification": "email_notification",
                "time_in_force": "good_till_cancel",
                "hidden": False,
                "post_only": False,
                "margin_currency_short_name": margin_currency_short_name,
            }
        },
    )
    return _normalize_dict_response(data)


async def place_market(
    pair: str,
    side: str,
    quantity: Decimal,
    leverage: float,
    margin_currency_short_name: str = "INR",
    client_order_id: str | None = None,
) -> dict[str, Any]:
    order = {
        "side": side,
        "pair": pair,
        "order_type": "market_order",
        "total_quantity": float(quantity),
        "leverage": int(leverage),
        "notification": "email_notification",
        "time_in_force": "good_till_cancel",
        "hidden": False,
        "post_only": False,
        "margin_currency_short_name": margin_currency_short_name,
    }
    if client_order_id:
        order["client_order_id"] = client_order_id
    data = await signed_post(
        "/exchange/v1/derivatives/futures/orders/create",
        {"order": order},
    )
    return _normalize_dict_response(data)


async def reduce_position(
    pair: str,
    side: str,
    quantity: Decimal,
    leverage: float,
    margin_currency_short_name: str = "INR",
) -> dict[str, Any]:
    """Reduce an existing futures position with an opposite market order."""
    opposite = "sell" if side == "buy" else "buy"
    return await place_market(
        pair,
        opposite,
        quantity,
        leverage,
        margin_currency_short_name,
    )


async def place_limit(
    pair: str,
    side: str,
    price: Decimal,
    quantity: Decimal,
    leverage: float,
    margin_currency_short_name: str = "INR",
    client_order_id: str | None = None,
) -> dict[str, Any]:
    order = {
        "side": side,
        "pair": pair,
        "order_type": "limit_order",
        "price": float(price),
        "total_quantity": float(quantity),
        "leverage": int(leverage),
        "notification": "email_notification",
        "time_in_force": "good_till_cancel",
        "hidden": False,
        "post_only": False,
        "margin_currency_short_name": margin_currency_short_name,
    }
    if client_order_id:
        order["client_order_id"] = client_order_id
    data = await signed_post(
        "/exchange/v1/derivatives/futures/orders/create",
        {"order": order},
    )
    return _normalize_dict_response(data)


async def order_status(order_id: str) -> dict[str, Any]:
    data = await signed_post("/exchange/v1/derivatives/futures/orders", {"id": order_id})
    rows = data if isinstance(data, list) else [data]
    return rows[0] if rows and isinstance(rows[0], dict) else {}


async def cancel_order(order_id: str) -> Any:
    return await signed_post("/exchange/v1/derivatives/futures/orders/cancel", {"id": order_id})


async def open_positions(
    pair: str | None = None,
    position_id: str | None = None,
) -> list[dict[str, Any]]:
    payload: dict[str, Any] = {
        "page": 1,
        "size": 50,
        "margin_currency_short_name": ["INR"],
    }
    if position_id:
        payload["position_ids"] = position_id
    elif pair:
        payload["pairs"] = pair
    data = await signed_post(
        "/exchange/v1/derivatives/futures/positions",
        payload,
    )
    return data if isinstance(data, list) else []


def _position_recency(pos: dict[str, Any]) -> float:
    for key in ("created_at", "updated_at"):
        value = pos.get(key)
        if value is not None:
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
    return 0.0


def _position_side_and_active(position: dict[str, Any]) -> tuple[str, bool]:
    position_side = str(position.get("side") or "").lower()

    try:
        active_pos = float(position.get("active_pos"))
    except (TypeError, ValueError):
        active_pos = 0.0

    # CoinDCX documents active_pos (negative means short), while some live
    # responses expose directional active_pos_buy/active_pos_sell fields.
    if active_pos == 0.0:
        try:
            active_sell = float(position.get("active_pos_sell") or 0)
        except (TypeError, ValueError):
            active_sell = 0.0
        try:
            active_buy = float(position.get("active_pos_buy") or 0)
        except (TypeError, ValueError):
            active_buy = 0.0
        if active_sell > 0 and active_buy <= 0:
            active_pos = -active_sell
        elif active_buy > 0 and active_sell <= 0:
            active_pos = active_buy

    if not position_side:
        if active_pos < 0:
            position_side = "sell"
        elif active_pos > 0:
            position_side = "buy"

    return position_side, active_pos != 0.0


async def find_open_position(pair: str, side: str) -> dict[str, Any] | None:
    for attempt in range(POSITION_LOOKUP_ATTEMPTS):
        try:
            positions = await open_positions(pair=pair)
        except TypeError:
            # Compatibility for injected test doubles using the old no-argument API.
            positions = await open_positions()
        logger.warning("RAW POSITIONS (attempt %d): %s", attempt, positions)
        matches: list[dict[str, Any]] = []
        for position in positions:
            if not isinstance(position, dict):
                continue
            logger.warning("POSITION ITEM: %s", position)
            position_pair = str(position.get("pair") or position.get("symbol") or "")
            position_side, is_active = _position_side_and_active(position)
            active = position.get("active_pos")
            logger.warning(
                "CHECK pair=%s side=%s active_pos_raw=%s is_active=%s (want pair=%s side=%s)",
                position_pair, position_side, active, is_active, pair, side.lower(),
            )
            if position_pair == pair and position_side == side.lower() and is_active:
                position_id = position.get("id") or position.get("position_id")
                if position_id:
                    matches.append(position)

        if len(matches) == 1:
            return matches[0]

        # if len(matches) > 1:
        #     logger.error(
        #         "ambiguous open position match for pair=%s side=%s; refusing to guess",
        #         pair,
        #         side,
        #     )
        #     return None

        if len(matches) > 1:
            matches.sort(key=_position_recency, reverse=True)
            logger.warning(
                "multiple open positions matched pair=%s side=%s; picking most recent",
                pair, side,
            )
            return matches[0]

        if attempt < POSITION_LOOKUP_ATTEMPTS - 1:
            await asyncio.sleep(POSITION_LOOKUP_DELAY)
    return None


async def position_status(position_id: str) -> dict[str, Any]:
    positions = await open_positions(position_id=position_id)
    for position in positions:
        if not isinstance(position, dict):
            continue
        if str(position.get("id") or position.get("position_id") or "") == position_id:
            return position
    return {}


async def attach_tpsl(position_id: str, tp_price: Decimal, sl_price: Decimal | None) -> Any:
    payload: dict[str, Any] = {
        "id": position_id,
        "take_profit": {
            "stop_price": float(tp_price),
            "order_type": "take_profit_market",
        },
    }
    if sl_price is not None:
        payload["stop_loss"] = {
            "stop_price": float(sl_price),
            "order_type": "stop_market",
        }
    return await signed_post("/exchange/v1/derivatives/futures/positions/create_tpsl", payload)


async def set_leverage(pair: str, leverage: int) -> Any:
    return await signed_post(
        "/exchange/v1/derivatives/futures/positions/update_leverage",
        {"pair": pair, "leverage": leverage, "margin_currency_short_name": "INR"},
    )


async def exit_position(position_id: str) -> Any:
    return await signed_post("/exchange/v1/derivatives/futures/positions/exit", {"id": position_id})
