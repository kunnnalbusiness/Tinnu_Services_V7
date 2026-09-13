from datetime import datetime, timedelta, timezone

import pytest

import lib.bot_engine as module
from lib.bot_engine import BotEngine, Runtime, current_slot_boundary, next_slot
from models.bot import Strategy


def candle(time: int, opening: float, closing: float) -> dict:
    return {
        "time": time,
        "open": opening,
        "high": max(opening, closing),
        "low": min(opening, closing),
        "close": closing,
        "volume": 1,
    }


@pytest.mark.asyncio
async def test_strategy2_uses_5m_match_then_1m_green_red_entry(monkeypatch):
    engine = BotEngine()
    strategy = Strategy(
        name="strategy-2-check",
        rule_set="top4_5m_reversal_short",
        coin_pick="top4_gainer_sell",
        timeframe="5m",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    runtime = Runtime()
    runtime.candidates = ["B-MOVR_USDT", "B-HEMI_USDT", "B-MAGMA_USDT", "B-CLO_USDT"]
    scan_now = datetime.now(timezone.utc)
    first_candle = int(scan_now.timestamp() // 300 - 4) * 300
    series = [
        candle(first_candle, 100, 100),
        candle(first_candle + 300, 100, 101),
        candle(first_candle + 600, 101, 102),
        candle(first_candle + 900, 102, 95),
    ]
    trigger_series = iter(
        [
            [candle(9, 100, 100), candle(11, 99, 98), candle(12, 98, 98)],
            [candle(10, 100, 100), candle(12, 98, 101), candle(13, 101, 101)],
            [candle(11, 99, 99), candle(13, 101, 97), candle(14, 97, 97)],
        ]
    )
    placed: dict[str, object] = {}

    async def fake_candles(pair, resolution, limit):
        if resolution == "5m":
            return series
        return next(trigger_series)

    async def fake_inr(pair):
        return {"pair": pair}

    async def fake_place(s, rt, price):
        placed.update(pair=rt.pair, side=rt.side, price=float(price))

    monkeypatch.setattr(module.candle_api, "get_candles", fake_candles)
    monkeypatch.setattr(engine, "_inr_instrument", fake_inr)
    monkeypatch.setattr(engine, "_place", fake_place)
    monkeypatch.setattr(engine, "log", lambda *args, **kwargs: None)

    await engine._select_reversal_candidate(strategy, runtime, scan_now)
    assert runtime.phase == "trigger_wait"
    assert runtime.pair == "B-MOVR_USDT"

    now = datetime.now(timezone.utc)
    runtime.trigger_deadline = now + timedelta(minutes=1)
    await engine._await_reversal_trigger(strategy, runtime, now)
    assert not placed
    await engine._await_reversal_trigger(strategy, runtime, now)
    assert not placed
    await engine._await_reversal_trigger(strategy, runtime, now)
    assert placed == {"pair": "B-MOVR_USDT", "side": "sell", "price": 97.0}


@pytest.mark.asyncio
async def test_strategy2_uses_strategy_trigger_timeframe(monkeypatch):
    engine = BotEngine()
    strategy = Strategy(
        name="strategy-2-trigger-check",
        rule_set="top4_5m_reversal_short",
        coin_pick="top4_gainer_sell",
        timeframe="5m",
        trigger_timeframe="5m",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    runtime = Runtime()
    runtime.candidates = ["B-MOVR_USDT"]
    scan_now = datetime.now(timezone.utc)
    first_candle = int(scan_now.timestamp() // 300 - 4) * 300
    series = [
        candle(first_candle, 100, 100),
        candle(first_candle + 300, 100, 101),
        candle(first_candle + 600, 101, 102),
        candle(first_candle + 900, 102, 95),
    ]
    trigger_series = iter(
        [
            [candle(9, 100, 100), candle(11, 99, 98), candle(12, 98, 98)],
            [candle(10, 100, 100), candle(12, 98, 101), candle(13, 101, 101)],
            [candle(11, 99, 99), candle(13, 101, 97), candle(14, 97, 97)],
        ]
    )

    async def fake_candles(pair, resolution, limit):
        if resolution == "5m":
            return series
        return next(trigger_series)

    async def fake_inr(pair):
        return {"pair": pair}

    async def fake_place(s, rt, price):
        return None

    monkeypatch.setattr(module.candle_api, "get_candles", fake_candles)
    monkeypatch.setattr(engine, "_inr_instrument", fake_inr)
    monkeypatch.setattr(engine, "_place", fake_place)
    monkeypatch.setattr(engine, "log", lambda *args, **kwargs: None)

    await engine._select_reversal_candidate(strategy, runtime, scan_now)
    assert runtime.phase == "trigger_wait"
    assert runtime.pair == "B-MOVR_USDT"

    now = datetime.now(timezone.utc)
    runtime.trigger_deadline = now + timedelta(minutes=1)
    await engine._await_reversal_trigger(strategy, runtime, now)
    await engine._await_reversal_trigger(strategy, runtime, now)

    assert runtime.phase in {"trigger_wait", "pending_order"}


def test_1h_slot_alignment_uses_530_ist_anchor():
    tz = timezone(timedelta(hours=5, minutes=30))

    assert current_slot_boundary(datetime(2024, 7, 18, 5, 29, tzinfo=tz), 60) == datetime(2024, 7, 18, 3, 30, tzinfo=tz)
    assert current_slot_boundary(datetime(2024, 7, 18, 6, 29, tzinfo=tz), 60) == datetime(2024, 7, 18, 5, 30, tzinfo=tz)
    assert current_slot_boundary(datetime(2024, 7, 18, 6, 30, tzinfo=tz), 60) == datetime(2024, 7, 18, 6, 30, tzinfo=tz)
    assert next_slot(datetime(2024, 7, 18, 0, 0, tzinfo=tz), "1h") == datetime(2024, 7, 18, 0, 30, tzinfo=tz)
    assert next_slot(datetime(2024, 7, 18, 6, 29, tzinfo=tz), "1h") == datetime(2024, 7, 18, 6, 30, tzinfo=tz)
    assert next_slot(datetime(2024, 7, 18, 3, 31, tzinfo=tz), "1h") == datetime(2024, 7, 18, 5, 30, tzinfo=tz)
    assert current_slot_boundary(datetime(2024, 7, 18, 4, 10, tzinfo=tz), 60) == datetime(2024, 7, 18, 3, 30, tzinfo=tz)
    assert current_slot_boundary(datetime(2024, 7, 18, 5, 29, tzinfo=tz), 60) == datetime(2024, 7, 18, 3, 30, tzinfo=tz)