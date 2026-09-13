from __future__ import annotations

from dataclasses import dataclass
from datetime import time as dtime
from decimal import Decimal
from typing import Any


WINDOW_START = dtime(5, 30)
WINDOW_END = dtime(3, 40)

TF_MINUTES: dict[str, int] = {
    "5m": 5,
    "1h": 60,
}

ORDER_WINDOW: dict[str, int] = {
    "5m": 60,
    "1h": 1500,
}

TRIGGER_TIMEFRAMES: tuple[str, str] = ("1m", "5m")

PRESCAN_LEAD = 60
TICK_SECONDS = 2.0
MAX_LOGS = 400
MAX_TRADE_HISTORY = 400

FEE_SAFETY_BUFFER = Decimal("0.98")
LIVE_MARGIN_UTILIZATION_LIMIT = Decimal("1.0")
LIVE_MARGIN_MINIMUM = Decimal("250")

ORDER_RETRY_ATTEMPTS = 3
ORDER_RETRY_DELAY = 2.0

LIQUIDATION_CHECK_SECONDS = 10

DB_RETRY_ATTEMPTS = 3
DB_RETRY_DELAY = 1.0

STRATEGY_NAME = "1PERIOD CYCLE V1"
RULE_SET = "Strategy1"
DEFAULT_COIN_PICK = "top4_gainer_sell"
DEFAULT_TIMEFRAME = "1h"
DEFAULT_TRIGGER_TIMEFRAME = "5m"
DEFAULT_LEVERAGE = 10
REQUIRES_TOP4_FORMAT = True
ORDER_TYPE = "limit"
MAX_LEVERAGE = 10
TP_PCT = 0.5
SL_PCT = 2.5
DEFAULT_CAPITAL_CAP_INR = None
DEFAULT_MAX_TRADES_PER_DAY = 10


@dataclass
class Candle:
    time: str
    open: float
    high: float
    low: float
    close: float


@dataclass
class Ticker:
    symbol: str
    change_pct: float
    volume_24h: float | None = None
    quote_volume: float | None = None


class Strategy1:
    """Strategy 1: top-4 reversal short logic.

    Logic summary:
    - scan the top candidate pairs
    - rank the selected pool
    - wait for a green trigger, then confirm with a red close
    - execute a short entry when confirmation appears
    """

    name = STRATEGY_NAME
    rule_set = RULE_SET
    selection_mode = "reversal"

    @staticmethod
    def side_for(coin_pick: str) -> str:
        return "buy" if coin_pick.endswith("_buy") else "sell"

    @staticmethod
    def ranked_candidates(pool: list[Any], coin_pick: str = "top4_gainer_sell") -> list[Any]:
        if not pool:
            return []
        return sorted(
            pool,
            key=lambda item: float(getattr(item, "change_pct", 0.0)),
            reverse="gainer" in coin_pick,
        )[:4]

    @staticmethod
    def select_pair(
        tickers: dict[str, Any],
        candles: dict[str, list[Any]],
        coin_pick: str = "top4_gainer_sell",
    ) -> str | None:
        ranked: list[tuple[float, str]] = []

        for symbol, ticker in tickers.items():
            change_pct = float(getattr(ticker, "change_pct", 0.0))
            series = candles.get(symbol, [])
            if len(series) < 2:
                continue

            recent = series[-2:]
            prev = recent[0]
            last = recent[1]

            if not Strategy1.should_enter(symbol, ticker, [prev, last], coin_pick):
                continue

            ranked.append((abs(change_pct), symbol))

        if not ranked:
            return None

        ranked.sort(key=lambda item: item[0], reverse=True)
        return ranked[0][1]

    @staticmethod
    def should_enter(symbol: str, ticker: Any, series: list[Any], coin_pick: str = "top4_gainer_sell") -> bool:
        if len(series) < 2:
            return False

        last = series[-1]
        prev = series[-2]
        prev_open = float(prev.get("open", 0.0)) if isinstance(prev, dict) else prev.open
        prev_close = float(prev.get("close", 0.0)) if isinstance(prev, dict) else prev.close
        last_open = float(last.get("open", 0.0)) if isinstance(last, dict) else last.open
        last_close = float(last.get("close", 0.0)) if isinstance(last, dict) else last.close
        return prev_close > prev_open and last_close < last_open

    @staticmethod
    def trigger_action(series: list[Any], trigger_seen: bool, coin_pick: str = "top4_gainer_sell") -> str | None:
        if not series:
            return None

        candle = series[-1]
        opening = float(candle.get("open", 0.0)) if isinstance(candle, dict) else candle.open
        closing = float(candle.get("close", 0.0)) if isinstance(candle, dict) else candle.close

        first_trigger = "green"
        second_trigger = "red"
        current_trigger = "green" if closing > opening else "red" if closing < opening else None

        if current_trigger == first_trigger and not trigger_seen:
            return first_trigger
        if current_trigger == second_trigger and trigger_seen:
            return second_trigger
        return None

    @staticmethod
    def build_signal(symbol: str, ticker: Ticker, series: list[Candle], coin_pick: str = "top4_gainer_sell") -> dict[str, Any]:
        last = series[-1]
        return {
            "name": STRATEGY_NAME,
            "rule_set": RULE_SET,
            "pair": symbol,
            "side": Strategy1.side_for(coin_pick),
            "entry": float(last.close),
            "change_pct": float(ticker.change_pct),
            "reason": "top-4 reversal short confirmation",
        }


__all__ = [
    "Strategy1",
    "STRATEGY_NAME",
    "RULE_SET",
    "DEFAULT_COIN_PICK",
    "ORDER_TYPE",
    "MAX_LEVERAGE",
    "WINDOW_START",
    "WINDOW_END",
    "TF_MINUTES",
    "ORDER_WINDOW",
    "TRIGGER_TIMEFRAMES",
    "PRESCAN_LEAD",
    "TICK_SECONDS",
    "MAX_LOGS",
    "MAX_TRADE_HISTORY",
    "FEE_SAFETY_BUFFER",
    "LIVE_MARGIN_UTILIZATION_LIMIT",
    "LIVE_MARGIN_MINIMUM",
    "ORDER_RETRY_ATTEMPTS",
    "ORDER_RETRY_DELAY",
    "LIQUIDATION_CHECK_SECONDS",
    "DB_RETRY_ATTEMPTS",
    "DB_RETRY_DELAY",
]
