"""tscheck: a coin with no INR-margin instrument is skipped, not ordered.

engine._select() must never hand an untradable pair to order placement even if it is
the strongest 24h mover of the scan slot — it should skip it and log the reason, then
fall through to the next tradable candidate.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from lib import bot_engine
from lib.bot_engine import BotEngine, Runtime
from lib.market_store import store
from models.bot import Strategy

PAIR_UNTRADABLE = "B-TSCHECK_BIGMOVER_USDT"
PAIR_TRADABLE = "B-TSCHECK_SMALLMOVER_USDT"


def _make_strategy() -> Strategy:
    return Strategy(
        name="tscheck-inr-skip-strategy",
        coin_pick="top_loser",
        timeframe="1h",
        created_at=datetime.now(timezone.utc).isoformat(),
    )


async def _fake_get_candles(pair: str, timeframe: str, limit: int):
    # Both candidates close RED (close < open) -> a clear SELL candle for each.
    return [
        {"time": 1, "open": 100.0, "high": 101.0, "low": 90.0, "close": 95.0},
        {"time": 2, "open": 95.0, "high": 96.0, "low": 80.0, "close": 85.0},
    ]


@pytest.mark.asyncio
async def test_untradable_biggest_mover_is_skipped_and_tradable_one_selected(monkeypatch):
    engine = BotEngine()
    s = _make_strategy()
    rt = Runtime()
    rt.candidates = [PAIR_UNTRADABLE, PAIR_TRADABLE]

    # Seed the INR-detail cache directly: empty dict == "not tradable on INR margin".
    engine._inr_detail = {
        PAIR_UNTRADABLE: {},
        PAIR_TRADABLE: {"min_quantity": 1, "quantity_increment": 1, "unit_contract_value": 1},
    }

    monkeypatch.setattr(bot_engine.candle_api, "get_candles", _fake_get_candles)

    original_tickers = dict(store.tickers)
    store.tickers[PAIR_UNTRADABLE] = SimpleNamespace(change_pct=-25.0, symbol="BIGMOVERUSDT")
    store.tickers[PAIR_TRADABLE] = SimpleNamespace(change_pct=-4.0, symbol="SMALLMOVERUSDT")

    placed: dict = {}

    async def fake_place(strategy, runtime, price):
        placed["pair"] = runtime.pair
        placed["side"] = runtime.side

    monkeypatch.setattr(engine, "_place", fake_place)

    try:
        await engine._select(s, rt, datetime.now(timezone.utc))
    finally:
        for pair in (PAIR_UNTRADABLE, PAIR_TRADABLE):
            if pair in original_tickers:
                store.tickers[pair] = original_tickers[pair]
            else:
                store.tickers.pop(pair, None)

    messages = [entry.message for entry in engine.logs]
    skip_msgs = [m for m in messages if PAIR_UNTRADABLE in m and "not tradable on INR margin" in m]
    assert skip_msgs, f"expected an INR-margin skip log for {PAIR_UNTRADABLE}, got: {messages}"

    assert placed.get("pair") == PAIR_TRADABLE, (
        f"expected the tradable-but-smaller mover {PAIR_TRADABLE} to be selected instead of "
        f"the untradable biggest mover, got: {placed}"
    )
