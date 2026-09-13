"""tscheck: CoinDCX signing/route-layer fixes.

Verifies (without any real API key, and without ever placing a real order):
  1. _signed() timestamps are in MILLISECONDS (13 digits), not seconds (10 digits).
  2. Futures order payloads are wrapped in an `order` object and use the futures enums
     `limit_order` / `market_order` as required by the CoinDCX derivatives API.
  3. Every signed CoinDCX route this app calls resolves to a real endpoint: with dummy
     (invalid) credentials each call must fail with HTTP 401 'Invalid credentials'
     (route exists, auth rejected) and never HTTP 404 'not_found' (wrong route, fails
     before auth is even checked). This hits api.coindcx.com read-only with garbage
     keys and can never place or affect a real order.
  4. inr_wallet_balance() reads the FUTURES wallet (GET, signed body) — not the spot
     balance endpoint (POST). Those are two different pools of money; hitting the
     wrong one silently sizes every order off a balance that isn't the trading margin.
"""
from __future__ import annotations

import json
from decimal import Decimal

import os

import pytest

from lib import coindcx_trade as trade
from lib import credentials as creds

# Deliberately invalid placeholders — never real credentials. Overridable from the
# environment so no literal that looks like a secret sits in source control.
DUMMY_KEY = os.getenv("TSCHECK_DUMMY_KEY", "tscheck-placeholder-key")
DUMMY_SECRET = os.getenv("TSCHECK_DUMMY_SECRET", "tscheck-placeholder-value")


@pytest.fixture(autouse=True)
def dummy_live_credentials():
    """Seed the in-process credentials cache with dummy, invalid, live-enabled creds.

    This never touches Mongo (no .save()/.set_live() call) and is restored immediately
    after the test — the real /api/bot/credentials state is untouched.
    """
    original = dict(creds._cache)
    creds._cache.update(api_key=DUMMY_KEY, api_secret=DUMMY_SECRET, live_trading=True, loaded=True)
    try:
        yield
    finally:
        creds._cache.clear()
        creds._cache.update(original)


def test_signed_timestamp_is_milliseconds():
    raw, headers = trade._signed({"foo": "bar"})
    body = json.loads(raw.decode())
    ts = body["timestamp"]
    assert isinstance(ts, int)
    assert len(str(ts)) == 13, f"expected a 13-digit millisecond timestamp, got {ts}"
    assert "X-AUTH-APIKEY" in headers and headers["X-AUTH-APIKEY"] == DUMMY_KEY
    assert "X-AUTH-SIGNATURE" in headers and len(headers["X-AUTH-SIGNATURE"]) == 64  # sha256 hex


@pytest.mark.asyncio
async def test_futures_order_payload_uses_futures_enums(monkeypatch):
    captured: dict = {}

    async def fake_signed_post(path, payload):
        captured["path"] = path
        captured["payload"] = payload
        return {"id": "fake-order-id"}

    monkeypatch.setattr(trade, "signed_post", fake_signed_post)

    await trade.place_limit("B-BTC_USDT", "sell", Decimal("100.5"), Decimal("2"), 10)
    payload = captured["payload"]
    assert captured["path"] == "/exchange/v1/derivatives/futures/orders/create"
    assert "order" in payload, "body MUST have 'order' wrapper per CoinDCX API spec"
    order_obj = payload["order"]
    assert order_obj["order_type"] == "limit_order", "must use futures enum 'limit_order'"
    assert order_obj["pair"] == "B-BTC_USDT"
    assert order_obj["total_quantity"] == 2.0
    assert order_obj["side"] == "sell"
    assert order_obj["time_in_force"] == "good_till_cancel"
    assert order_obj["margin_currency_short_name"] == "INR", (
        "order create MUST pin margin_currency_short_name — CoinDCX shares one pair "
        "name across the INR and USDT margin books, so omitting this silently targets "
        "(or gets rejected against) the wrong wallet"
    )

    await trade.place_market("B-BTC_USDT", "sell", Decimal("2"), 10)
    payload_market = captured["payload"]
    order_obj_market = payload_market["order"]
    assert order_obj_market["order_type"] == "market_order", "must use futures enum 'market_order'"
    assert order_obj_market["margin_currency_short_name"] == "INR", (
        "place_market is the default entry path for every strategy template — it must "
        "pin margin_currency_short_name to INR for the same reason place_limit does"
    )

    await trade.open_short("B-BTC_USDT", Decimal("2"), 10)
    payload2 = captured["payload"]
    assert "order" in payload2, "body MUST have 'order' wrapper per CoinDCX API spec"
    order_obj2 = payload2["order"]
    assert order_obj2["order_type"] == "market_order", "must use futures enum 'market_order'"
    assert order_obj2["side"] == "sell"
    assert order_obj2["margin_currency_short_name"] == "INR"


@pytest.mark.asyncio
async def test_futures_wallet_balance_uses_futures_wallet_endpoint_via_get(monkeypatch):
    """inr_wallet_balance() must read the FUTURES wallet (GET, signed body) — not
    the spot /exchange/v1/users/balances (POST), a different pool of money that was
    silently making the bot size orders off the wrong balance."""
    async def fake_signed_get(path, payload):
        assert path == "/exchange/v1/derivatives/futures/wallets"
        assert payload == {}
        return [
            {"currency_short_name": "INR", "balance": "1000", "locked_balance": "125"},
            {"currency_short_name": "USDT", "balance": "100", "locked_balance": "2"},
        ]

    monkeypatch.setattr(trade, "signed_get", fake_signed_get)
    balance = await trade.inr_wallet_balance()
    assert balance == Decimal("875")


@pytest.mark.asyncio
async def test_futures_wallet_balance_prefers_available_balance_field(monkeypatch):
    """CoinDCX can report a real free-balance field; using balance - locked_balance
    can undercount available margin and trigger false insufficient-funds rejections."""
    async def fake_signed_get(path, payload):
        assert path == "/exchange/v1/derivatives/futures/wallets"
        assert payload == {}
        return [
            {"currency_short_name": "INR", "balance": "1500", "locked_balance": "1100", "available_balance": "425"},
            {"currency_short_name": "USDT", "balance": "100", "locked_balance": "2"},
        ]

    monkeypatch.setattr(trade, "signed_get", fake_signed_get)
    balance = await trade.inr_wallet_balance()
    assert balance == Decimal("425")


@pytest.mark.asyncio
async def test_open_positions_preserves_coin_dcx_position_list(monkeypatch):
    async def fake_signed_post(path, payload):
        assert path == "/exchange/v1/derivatives/futures/positions"
        return [{"id": "first"}, {"id": "second"}]

    monkeypatch.setattr(trade, "signed_post", fake_signed_post)
    positions = await trade.open_positions(pair="B-BTC_USDT")
    assert [position["id"] for position in positions] == ["first", "second"]


@pytest.mark.asyncio
async def test_find_open_position_matches_pair_and_side(monkeypatch):
    async def fake_open_positions():
        return [
            {"id": "wrong-side", "pair": "B-BTC_USDT", "side": "buy", "active_pos": 1},
            {"id": "target", "pair": "B-BTC_USDT", "side": "sell", "active_pos": 1},
        ]

    monkeypatch.setattr(trade, "open_positions", fake_open_positions)
    position = await trade.find_open_position("B-BTC_USDT", "sell")
    assert position is not None
    assert position["id"] == "target"


@pytest.mark.asyncio
async def test_find_open_position_matches_directional_active_fields(monkeypatch):
    async def fake_open_positions():
        return [
            {
                "id": "target",
                "pair": "B-BTC_USDT",
                "active_pos": 0,
                "active_pos_buy": 0,
                "active_pos_sell": 2,
            }
        ]

    monkeypatch.setattr(trade, "open_positions", fake_open_positions)
    position = await trade.find_open_position("B-BTC_USDT", "sell")
    assert position is not None
    assert position["id"] == "target"


@pytest.mark.asyncio
async def test_every_signed_route_resolves_with_401_not_404():
    """With dummy credentials each signed call must 401 (route exists) not 404 (wrong route)."""
    checks = [
        ("place_limit", trade.place_limit("B-BTC_USDT", "sell", Decimal("100"), Decimal("1"), 10)),
        ("order_status", trade.order_status("tscheck-fake-order-id")),
        ("cancel_order", trade.cancel_order("tscheck-fake-order-id")),
        ("open_positions", trade.open_positions()),
        ("attach_tpsl", trade.attach_tpsl("tscheck-fake-position-id", Decimal("100"), Decimal("90"))),
        ("exit_position", trade.exit_position("tscheck-fake-position-id")),
        ("set_leverage", trade.set_leverage("B-BTC_USDT", 10)),
        ("inr_wallet_balance", trade.inr_wallet_balance()),
    ]
    failures = []
    for name, coro in checks:
        try:
            await coro
            failures.append(f"{name}: expected CoinDcxError, call succeeded unexpectedly")
        except trade.CoinDcxError as exc:
            msg = str(exc)
            if "404" in msg or "not_found" in msg:
                failures.append(f"{name}: got 404/not_found (wrong route) -> {msg[:200]}")
            elif "401" not in msg and "invalid" not in msg.lower():
                failures.append(f"{name}: unexpected non-401 error -> {msg[:200]}")
    assert not failures, f"signed routes that did not resolve correctly:\n{'\n'.join(failures)}"