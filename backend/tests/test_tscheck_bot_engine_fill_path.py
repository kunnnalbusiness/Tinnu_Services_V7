"""tscheck: refactored fill path (_is_filled / _on_filled / _cancel_unfilled) behaves
identically to the pre-refactor _await_fill in PAPER mode.

Covers:
  1. Price away from the limit -> stays pending_order (no fill, no crash).
  2. Price trades through the limit -> in_position, trades_today incremented, trade
     row marked open.
  3. Deadline passes with no fill -> trade row 'cancelled', runtime cleared, back to
     waiting with a 'no fill' message.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from lib import bot_engine
from lib.bot_engine import BotEngine, Runtime
from lib.market_store import store
from models.bot import Strategy

from types import SimpleNamespace

PAIR = "B-TSCHECK_FILLPATH_USDT"


@pytest.mark.asyncio
async def test_concurrent_engine_load_starts_one_load_task(monkeypatch):
    """Concurrent requests for one owner must not create duplicate engine loads."""
    engine = BotEngine("second-admin@example.com")
    calls = 0

    async def fake_load_once():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0)
        engine.loaded = True

    monkeypatch.setattr(engine, "_load_once", fake_load_once)

    await asyncio.gather(
        engine.load(),
        engine.load(),
        engine.load(),
    )

    assert calls == 1


async def _noop_save(s) -> None:
    """Avoid persisting throwaway test strategies to the shared Mongo instance."""
    return None


def _make_strategy(**kw) -> Strategy:
    return Strategy(
        name="tscheck-fill-path-strategy",
        coin_pick="top_loser",
        timeframe="1h",
        created_at=datetime.now(timezone.utc).isoformat(),
        **kw,
    )


def _make_runtime(side: str, entry: float, deadline: datetime) -> Runtime:
    rt = Runtime()
    rt.phase = "pending_order"
    rt.pair = PAIR
    rt.side = side
    rt.entry = entry
    rt.tp = entry * (0.99 if side == "sell" else 1.01)
    rt.sl = entry * (1.05 if side == "sell" else 0.95)
    rt.order_deadline = deadline
    rt.trade_id = None  # no DB row needed for the pending-stays-pending case
    rt.trades_today = 0
    return rt


def test_live_capital_limit_uses_conservative_wallet_share():
    """Live orders should be capped below the wallet's full free margin to avoid
    repeated CoinDCX 400 insufficient-funds rejections on small-but-not-zero balances."""
    assert bot_engine.live_capital_limit(Decimal("20000"), Decimal("10000")) == Decimal("7000")
    assert bot_engine.live_capital_limit(Decimal("40000"), Decimal("500")) == Decimal("350")
    assert bot_engine.live_capital_limit(Decimal("40000"), Decimal("0")) == Decimal("0")


@pytest.mark.asyncio
async def test_highest_mover_sell_uses_strategy_tp_sl(monkeypatch):
    """highest_mover_sell must honor the configured TP/SL values, not force 5% TP / no SL."""
    engine = BotEngine()
    monkeypatch.setattr(engine, "_save", _noop_save)
    monkeypatch.setattr(engine, "_insert_trade", _noop_save)
    monkeypatch.setattr(engine, "_mark_open", _noop_save)
    monkeypatch.setattr(bot_engine.trade, "live_enabled", lambda: False)
    monkeypatch.setattr(bot_engine.trade, "usdt_inr_rate", lambda: 80.0)
    monkeypatch.setattr(bot_engine.trade, "inr_instruments", lambda: [PAIR])
    monkeypatch.setattr(engine, "_inr_instrument", lambda pair: {"symbol": pair})
    engine._inr_pairs = {PAIR}

    s = _make_strategy(
        rule_set="highest_mover_sell",
        tp_pct=1.8,
        sl_pct=3.2,
    )
    rt = Runtime()
    rt.pair = PAIR
    rt.side = "sell"
    rt.phase = "waiting"

    await engine._place(s, rt, Decimal("100"))

    assert rt.tp == pytest.approx(98.2)
    assert rt.sl == pytest.approx(103.2)
    assert s.tp_price == pytest.approx(98.2)
    assert s.sl_price == pytest.approx(103.2)


@pytest.mark.asyncio
async def test_price_away_from_limit_stays_pending_order_no_crash(monkeypatch):
    """While the price stays away from the limit, the strategy must remain
    pending_order and _await_fill must not raise (regression guard for the
    _await_fill 'left seconds' status message)."""
    engine = BotEngine()
    monkeypatch.setattr(engine, "_save", _noop_save)  # avoid writing this throwaway strategy to Mongo
    s = _make_strategy()
    now = datetime.now(timezone.utc)
    # SELL limit at 100 fills once last >= entry; keep price below the limit (90) -> not filled.
    rt = _make_runtime(side="sell", entry=100.0, deadline=now + timedelta(seconds=60))

    original = store.tickers.get(PAIR)
    store.tickers[PAIR] = SimpleNamespace(last=90.0)
    try:
        await engine._await_fill(s, rt, now)  # must not raise (regression: NameError on 'side'/'entry')
    finally:
        if original is not None:
            store.tickers[PAIR] = original
        else:
            store.tickers.pop(PAIR, None)

    assert rt.phase == "pending_order", f"expected phase to remain pending_order, got {rt.phase}"


@pytest.mark.asyncio
async def test_price_trades_through_limit_fills_and_opens_position(monkeypatch):
    """Once the live price trades through the limit, _await_fill must mark the
    strategy in_position, increment trades_today, and mark the trade row open."""
    engine = BotEngine()
    monkeypatch.setattr(engine, "_save", _noop_save)
    s = _make_strategy()
    now = datetime.now(timezone.utc)
    rt = _make_runtime(side="sell", entry=100.0, deadline=now + timedelta(seconds=60))
    rt.trade_id = "tscheck-fill-path-trade-id"

    marked_open: dict = {}

    async def fake_mark_open(runtime):
        marked_open["trade_id"] = runtime.trade_id
        marked_open["entry"] = runtime.entry

    monkeypatch.setattr(engine, "_mark_open", fake_mark_open)

    # SELL limit at 100; price at/through the limit (last <= entry is buy-side; for
    # sell side the fill condition is ticker.last >= entry) -> price 101 fills a sell.
    original = store.tickers.get(PAIR)
    store.tickers[PAIR] = SimpleNamespace(last=101.0)
    try:
        await engine._await_fill(s, rt, now)
    finally:
        if original is not None:
            store.tickers[PAIR] = original
        else:
            store.tickers.pop(PAIR, None)

    assert rt.phase == "in_position", f"expected phase in_position, got {rt.phase}"
    assert rt.trades_today == 1, f"expected trades_today incremented to 1, got {rt.trades_today}"
    assert s.trades_today == 1
    assert marked_open.get("trade_id") == "tscheck-fill-path-trade-id"
    assert s.status == "in_position"


@pytest.mark.asyncio
async def test_deadline_passes_with_no_fill_cancels_and_resets():
    """If the order deadline passes with no fill, _cancel_unfilled must mark the
    trade row cancelled, clear the runtime pair/entry/order id, and return to
    waiting with a 'no fill' message."""
    engine = BotEngine()
    engine._save = _noop_save
    s = _make_strategy()
    now = datetime.now(timezone.utc)
    # Deadline already in the past -> immediate cancel path.
    rt = _make_runtime(side="sell", entry=100.0, deadline=now - timedelta(seconds=1))
    rt.trade_id = "tscheck-fill-path-cancel-trade-id"

    # Price stays away from the limit so _is_filled returns False (PAPER path).
    original = store.tickers.get(PAIR)
    store.tickers[PAIR] = SimpleNamespace(last=90.0)
    try:
        await engine._await_fill(s, rt, now)
    finally:
        if original is not None:
            store.tickers[PAIR] = original
        else:
            store.tickers.pop(PAIR, None)

    assert rt.phase == "waiting", f"expected phase waiting after cancel, got {rt.phase}"
    assert rt.pair is None and rt.entry is None and rt.order_id is None, (
        f"expected runtime cleared, got pair={rt.pair} entry={rt.entry} order_id={rt.order_id}"
    )
    assert s.status == "waiting"
    assert "no fill" in (s.detail or "").lower() or "cancel" in (s.detail or "").lower()


@pytest.mark.asyncio
async def test_live_fill_check_is_throttled_and_uses_order_status(monkeypatch):
    """With live enabled and an order id, _is_filled must consult order_status at
    most once per 5s and must NOT use the paper price-touch shortcut."""
    engine = BotEngine()
    rt = Runtime()
    rt.pair = PAIR
    rt.side = "sell"
    rt.entry = 100.0
    rt.order_id = "tscheck-live-order-id"
    rt.last_order_check = 0.0

    calls = {"n": 0}

    async def fake_order_status(order_id):
        calls["n"] += 1
        return {"status": "open"}  # not filled yet

    monkeypatch.setattr(bot_engine.trade, "live_enabled", lambda: True)
    monkeypatch.setattr(bot_engine.trade, "order_status", fake_order_status)

    # Ensure a paper price-touch would otherwise report "filled" (last >= entry for sell)
    # to prove the LIVE path ignores it and asks CoinDCX instead.
    original = store.tickers.get(PAIR)
    store.tickers[PAIR] = SimpleNamespace(last=999.0)
    try:
        filled_1 = await engine._is_filled(None, rt)
        assert filled_1 is False, "expected not filled while order_status reports 'open'"
        assert calls["n"] == 1, f"expected exactly 1 order_status call, got {calls['n']}"

        # Immediately calling again (within 5s) must NOT call order_status again (throttled).
        filled_2 = await engine._is_filled(None, rt)
        assert filled_2 is False
        assert calls["n"] == 1, f"expected throttle to skip the 2nd call, got {calls['n']} calls"
    finally:
        if original is not None:
            store.tickers[PAIR] = original
        else:
            store.tickers.pop(PAIR, None)


@pytest.mark.asyncio
async def test_close_trade_persists_pnl_inr(monkeypatch):
    """Closing a trade must persist INR P&L as well as the percentage, so the
    history API can show profit/loss for both new and legacy rows."""
    engine = BotEngine()
    s = _make_strategy()
    rt = Runtime()
    rt.trade_id = "trade-1"
    rt.pair = PAIR
    rt.side = "sell"
    rt.entry = 100.0
    rt.capital = 20000.0
    rt.leverage = 10.0
    rt.quantity = 2.0

    captured: dict[str, object] = {}

    class FakeTrades:
        async def update_one(self, filter_doc, update_doc):
            captured["filter"] = filter_doc
            captured["update"] = update_doc

            class Result:
                matched_count = 1

            return Result()

    monkeypatch.setattr(bot_engine, "db", SimpleNamespace(trades=FakeTrades()))
    monkeypatch.setattr(engine, "_reset", lambda *args, **kwargs: None)
    monkeypatch.setattr(engine, "_set", lambda *args, **kwargs: None)
    monkeypatch.setattr(engine, "log", lambda *args, **kwargs: None)

    await engine._close_trade(s, rt, "tp", 95.0, "Take profit hit.")

    assert captured["filter"] == {"id": "trade-1", "owner_id": engine.owner_id}
    fields = captured["update"]["$set"]
    assert fields["pnl_pct"] == 50.0
    assert fields["pnl_inr"] == 10000.0


@pytest.mark.asyncio
async def test_live_fill_check_failed_status_call_is_treated_as_not_filled(monkeypatch):
    """A failed order-status check in LIVE mode is logged and treated as not filled."""
    engine = BotEngine()
    rt = Runtime()
    rt.pair = PAIR
    rt.side = "sell"
    rt.entry = 100.0
    rt.order_id = "tscheck-live-order-id-2"
    rt.last_order_check = 0.0

    async def failing_order_status(order_id):
        raise RuntimeError("tscheck: simulated CoinDCX order-status failure")

    monkeypatch.setattr(bot_engine.trade, "live_enabled", lambda: True)
    monkeypatch.setattr(bot_engine.trade, "order_status", failing_order_status)

    s = _make_strategy()
    filled = await engine._is_filled(s, rt)
    assert filled is False
    assert any("Order status check failed" in e.message for e in engine.logs), (
        f"expected a logged error for the failed status check, got: {[e.message for e in engine.logs]}"
    )
