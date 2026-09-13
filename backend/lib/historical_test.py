from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from lib.candles import fetch_candle_at, fetch_range
from lib.config import HISTORICAL_CONCURRENCY
from lib.market_store import store
from models.bot import Strategy
from strategies.registry import get_strategy_mode, get_strategy_module

IST = ZoneInfo("Asia/Kolkata")
HISTORICAL_CONCURRENCY = int(HISTORICAL_CONCURRENCY)


def candle_closed_at(row: dict[str, Any], timeframe_seconds: int, target_ts: int) -> bool:
    timestamp = float(row["time"])
    if timestamp > 10_000_000_000:
        timestamp /= 1000
    return timestamp + timeframe_seconds <= target_ts + 60


def candle_timestamp(row: dict[str, Any]) -> int:
    timestamp = int(row["time"])
    return timestamp // 1000 if timestamp > 10_000_000_000 else timestamp


def candle_colour(row: dict[str, Any]) -> str:
    return "GREEN" if row["close"] > row["open"] else "RED" if row["close"] < row["open"] else "FLAT"


async def run_historical_test(strategy: Strategy, target: datetime) -> dict[str, Any]:
    target = target.astimezone(IST).replace(second=0, microsecond=0)
    target_ts_ms = int(target.timestamp() * 1000)
    pairs = list(store.pairs or store.tickers.keys())
    if not pairs:
        raise RuntimeError("No CoinDCX futures instruments are loaded")

    request_slots = asyncio.Semaphore(HISTORICAL_CONCURRENCY)

    async def mover(pair: str) -> dict[str, Any] | None:
        try:
            async with request_slots:
                current, previous = await asyncio.gather(
                    fetch_candle_at(pair, "1m", target_ts_ms),
                    fetch_candle_at(pair, "1m", target_ts_ms - 24 * 60 * 60 * 1000),
                )
            if not current or not previous or previous["close"] <= 0:
                return None
            price = float(current["close"])
            previous_price = float(previous["close"])
            return {"pair": pair, "price": price, "change_pct": (price - previous_price) / previous_price * 100}
        except Exception:
            return None

    movers = [item for item in await asyncio.gather(*(mover(pair) for pair in pairs)) if item]
    if not movers:
        raise RuntimeError("No historical candles were available for the selected time")
    movers.sort(key=lambda item: item["change_pct"], reverse="gainer" in strategy.coin_pick)
    mode = get_strategy_mode(strategy.rule_set)
    selected = movers[:1] if mode == "highest_mover" else movers[:4]
    if mode == "reversal":
        return await run_reversal_test(strategy, target, target_ts_ms // 1000, selected, movers)
    timeframe_seconds = {"5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400}.get(strategy.timeframe, 3600)
    candidates: list[dict[str, Any]] = []
    for item in selected:
        try:
            rows = await fetch_range(item["pair"], strategy.timeframe, target_ts_ms // 1000 - timeframe_seconds * 3, target_ts_ms // 1000 + timeframe_seconds * 2, 10)
        except Exception:
            continue
        closed = [row for row in rows if candle_closed_at(row, timeframe_seconds, target_ts_ms // 1000)]
        if not closed:
            continue
        candle = closed[-1]
        side = "buy" if candle["close"] > candle["open"] else "sell" if candle["close"] < candle["open"] else None
        if get_strategy_mode(strategy.rule_set) == "highest_mover":
            side = "sell"
        if side:
            candidates.append({**item, "side": side, "entry": float(candle["close"])})
    if not candidates:
        return {"status": "skipped", "message": "No clear candle signal at the selected time.", "movers": selected}

    pick = max(candidates, key=lambda item: abs(item["change_pct"]))
    entry = pick["entry"]
    tp = entry * (1 + strategy.tp_pct / 100) if pick["side"] == "buy" else entry * (1 - strategy.tp_pct / 100)
    sl = None if strategy.sl_pct is None else entry * (1 - strategy.sl_pct / 100) if pick["side"] == "buy" else entry * (1 + strategy.sl_pct / 100)
    future = await fetch_range(pick["pair"], "1m", target_ts_ms // 1000 + 60, target_ts_ms // 1000 + 3600, 80)
    result, exit_price = "open_at_end", None
    for candle in future:
        if pick["side"] == "buy":
            if sl is not None and candle["low"] <= sl: result, exit_price = "sl_hit", sl; break
            if candle["high"] >= tp: result, exit_price = "tp_hit", tp; break
        else:
            if sl is not None and candle["high"] >= sl: result, exit_price = "sl_hit", sl; break
            if candle["low"] <= tp: result, exit_price = "tp_hit", tp; break
    mark = exit_price or (float(future[-1]["close"]) if future else entry)
    pnl_pct = ((mark - entry) / entry * 100) if pick["side"] == "buy" else ((entry - mark) / entry * 100)
    return {"status": result, "target_time": target.isoformat(), "strategy": strategy.name, "pair": pick["pair"], "side": pick["side"], "change_pct": pick["change_pct"], "entry_price": entry, "tp_price": tp, "sl_price": sl, "exit_price": exit_price, "pnl_pct": pnl_pct, "movers": movers[:10]}


async def run_reversal_test(
    strategy: Strategy,
    target: datetime,
    target_ts: int,
    selected: list[dict[str, Any]],
    movers: list[dict[str, Any]],
) -> dict[str, Any]:
    """Replay Strategy 2 using its configured decision and trigger settings."""
    strategy_module = get_strategy_module(strategy.rule_set)
    if strategy_module is None:
        raise RuntimeError("Strategy2 module is unavailable")

    timeframe_seconds = {"5m": 300, "1h": 3600}[strategy.timeframe]
    boundary = ((target_ts + timeframe_seconds - 1) // timeframe_seconds) * timeframe_seconds
    candidates: list[dict[str, Any]] = []
    decisions: list[dict[str, Any]] = []
    for item in selected:
        try:
            rows = await fetch_range(
                item["pair"],
                strategy.timeframe,
                boundary - timeframe_seconds * 3,
                boundary + 60,
                10,
            )
        except Exception:
            continue
        closed = [
            row
            for row in rows
            if candle_timestamp(row) + timeframe_seconds <= boundary + 60
        ]
        if len(closed) < 2:
            continue
        cn1, cn2 = closed[-2], closed[-1]
        decision = {"pair": item["pair"], "cn1": candle_colour(cn1), "cn2": candle_colour(cn2), "cn1_close": cn1["close"], "cn2_close": cn2["close"]}
        decisions.append(decision)
        if strategy_module.should_enter(
            item["pair"],
            None,
            [cn1, cn2],
            strategy.coin_pick,
        ):
            candidates.append({**item, "decision": decision})
    if not candidates:
            return {"status": "skipped", "message": "No configured Strategy2 decision-candle match at the selected time.", "target_time": target.isoformat(), "strategy": strategy.name, "decision_candles": decisions, "movers": movers[:10]}

    trigger_matches: list[dict[str, Any]] = []
    for item in candidates:
        try:
            trigger_rows = await fetch_range(
                item["pair"],
                strategy.trigger_timeframe,
                boundary,
                boundary + 3600,
                80,
            )
        except Exception:
            continue
        trigger_seen = False
        for row in sorted(trigger_rows, key=candle_timestamp):
            action = strategy_module.trigger_action(
                [row],
                trigger_seen,
                strategy.coin_pick,
            )
            if action == ("red" if strategy_module.side_for(strategy.coin_pick) == "buy" else "green"):
                trigger_seen = True
                continue
            if action == ("green" if strategy_module.side_for(strategy.coin_pick) == "buy" else "red"):
                trigger_matches.append({**item, "trigger": row, "trigger_colour": candle_colour(row)})
                break
    if not trigger_matches:
        return {"status": "trigger_not_found", "message": "Decision match found, but no configured trigger sequence appeared in the next hour.", "target_time": target.isoformat(), "strategy": strategy.name, "decision_candles": decisions, "movers": movers[:10]}

    pick = max(trigger_matches, key=lambda item: abs(item["change_pct"]))
    trigger = pick["trigger"]
    entry = float(trigger["close"])
    side = strategy_module.side_for(strategy.coin_pick)
    tp = entry * (1 + strategy.tp_pct / 100) if side == "buy" else entry * (1 - strategy.tp_pct / 100)
    sl = (
        None
        if strategy.sl_pct is None
        else entry * (1 - strategy.sl_pct / 100)
        if side == "buy"
        else entry * (1 + strategy.sl_pct / 100)
    )
    trigger_time = candle_timestamp(trigger)
    future = await fetch_range(pick["pair"], "1m", trigger_time + 60, trigger_time + 3600, 80)
    result, exit_price = "open_at_end", None
    for candle in sorted(future, key=candle_timestamp):
        if side == "buy":
            if sl is not None and candle["low"] <= sl:
                result, exit_price = "sl_hit", sl
                break
            if candle["high"] >= tp:
                result, exit_price = "tp_hit", tp
                break
        else:
            if sl is not None and candle["high"] >= sl:
                result, exit_price = "sl_hit", sl
                break
            if candle["low"] <= tp:
                result, exit_price = "tp_hit", tp
                break
    mark = exit_price or (float(future[-1]["close"]) if future else entry)
    pnl_pct = ((mark - entry) / entry * 100) if side == "buy" else ((entry - mark) / entry * 100)
    return {
        "status": result,
        "target_time": target.isoformat(),
        "strategy": strategy.name,
        "pair": pick["pair"],
        "side": side,
        "change_pct": pick["change_pct"],
        "entry_price": entry,
        "tp_price": tp,
        "sl_price": sl,
        "exit_price": exit_price,
        "pnl_pct": pnl_pct,
        "decision_candles": decisions,
        "trigger_time": datetime.fromtimestamp(trigger_time, IST).isoformat(),
        "trigger": {"open": trigger["open"], "high": trigger["high"], "low": trigger["low"], "close": trigger["close"], "colour": candle_colour(trigger)},
        "movers": movers[:10],
    }