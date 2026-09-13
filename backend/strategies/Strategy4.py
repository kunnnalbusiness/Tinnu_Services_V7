from __future__ import annotations

from dataclasses import dataclass
from datetime import time as dtime
from decimal import Decimal
from typing import Any


WINDOW_START = dtime(5, 30)
WINDOW_END = dtime(3, 40)

TF_MINUTES: dict[str, int] = {
    "1m": 1,
    "1h": 60,
}

ORDER_WINDOW: dict[str, int] = {
    "1m": 120,
    "1h": 300,
}

TRIGGER_TIMEFRAMES: tuple[str, str] = ("1m", "5m")
DEFAULT_TRIGGER_TIMEFRAME = "1m"

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

STRATEGY_NAME = "1HR VOL. CONF."
RULE_SET = "Strategy4"
DEFAULT_COIN_PICK = "top4_gainer_sell"
DEFAULT_TIMEFRAME = "1h"
REQUIRES_TOP4_FORMAT = True
ORDER_TYPE = "limit"
DEFAULT_LEVERAGE = 2
MAX_LEVERAGE = 10
DEFAULT_CAPITAL_CAP_INR = None

CYCLE_LEVERAGES: list[float] = [2, 5, 10]
MAX_CYCLES_PER_HOUR = 3
PARTIAL_REDUCE_FRACTION = 0.5

TP_PCT = 2.0   # ratio numerator (TP side of 1:2)
SL_PCT = 1.0   # ratio denominator (SL side of 1:2)


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


class Strategy4:
    """Strategy 4: 1h GREEN->RED confirmation + trigger-timeframe volume-
    confirmed entry, fixed 3-level leverage cycle chaining on the same pair,
    partial-reduce + breakeven.

    - Configured decision-timeframe candles: last two CLOSED candles must be
      GREEN then RED — same for BUY and SELL (side only sets order
      direction via coin_pick, not the pattern).
    - Trigger-timeframe (1m/5m): same GREEN then RED sequence. Entry only
      fires if the GREEN (first) trigger candle's volume is greater than
      the RED (second) trigger candle's volume; otherwise skip and keep
      scanning on the same pair.
    - SL = higher HIGH of the two confirming trigger candles (SELL) /
      lower LOW of the two (BUY). TP = SL-distance * (tp_pct/sl_pct)
      from entry — default 1:2.
    - At the entry<->TP midpoint, 50% is reduced and the remaining 50%'s
      SL moves to breakeven (entry price).
    - A (real or breakeven) SL hit chains into the next cycle on the SAME
      pair/side with the next leverage step (2x -> 5x -> 10x) — no fresh
      1h check, no fresh top-4 rescan, only the trigger-timeframe scan
      restarts. Max 3 cycles per 1h window.
    - A full TP hit on the remaining 50% closes the trade completely;
      the strategy goes back to waiting for the next 1h slot.
    """

    name = STRATEGY_NAME
    rule_set = RULE_SET
    selection_mode = "reversal"

    # ---- shared helpers ---------------------------------------------

    @staticmethod
    def _value(candle: Any, key: str) -> float:
        return float(candle.get(key, 0.0)) if isinstance(candle, dict) else float(getattr(candle, key))

    @staticmethod
    def side_for(coin_pick: str) -> str:
        return "buy" if coin_pick.endswith("_buy") else "sell"

    # ---- decision-candle scan -----------------------------------

    @staticmethod
    def ranked_candidates(pool: list[Any], coin_pick: str = DEFAULT_COIN_PICK) -> list[Any]:
        if not pool:
            return []
        return sorted(
            pool,
            key=lambda item: float(getattr(item, "change_pct", 0.0)),
            reverse="gainer" in coin_pick,
        )[:4]

    @staticmethod
    def should_enter(symbol: str, ticker: Any, series: list[Any], coin_pick: str = DEFAULT_COIN_PICK) -> bool:
        """GREEN -> RED on the last two closed candles. Side-independent."""
        if len(series) < 2:
            return False
        prev, last = series[-2], series[-1]
        prev_open = Strategy4._value(prev, "open")
        prev_close = Strategy4._value(prev, "close")
        last_open = Strategy4._value(last, "open")
        last_close = Strategy4._value(last, "close")
        return prev_close > prev_open and last_close < last_open

    @staticmethod
    def select_pair(
        tickers: dict[str, Any],
        candles: dict[str, list[Any]],
        coin_pick: str = DEFAULT_COIN_PICK,
    ) -> str | None:
        ranked: list[tuple[float, str]] = []
        for symbol, ticker in tickers.items():
            series = candles.get(symbol, [])
            if len(series) < 2:
                continue
            if not Strategy4.should_enter(symbol, ticker, series[-2:], coin_pick):
                continue
            ranked.append((abs(float(getattr(ticker, "change_pct", 0.0))), symbol))
        if not ranked:
            return None
        ranked.sort(key=lambda item: item[0], reverse=True)
        return ranked[0][1]

    # ---- trigger-timeframe scan --------------------------------------

    @staticmethod
    def trigger_action(series: list[Any], trigger_seen: bool, coin_pick: str = DEFAULT_COIN_PICK) -> str | None:
        """GREEN then RED, side-independent (mirrors the 1h pattern)."""
        if not series:
            return None
        candle = series[-1]
        opening = Strategy4._value(candle, "open")
        closing = Strategy4._value(candle, "close")
        current = "green" if closing > opening else "red" if closing < opening else None
        first_trigger, second_trigger = "green", "red"
        if current == first_trigger and not trigger_seen:
            return first_trigger
        if current == second_trigger and trigger_seen:
            return second_trigger
        return None

    @staticmethod
    def volume_confirmed(first_candle: Any, second_candle: Any) -> bool:
        """Entry only fires if the GREEN (first) trigger candle's volume
        beats the RED (second) trigger candle's volume."""
        return Strategy4._value(first_candle, "volume") > Strategy4._value(second_candle, "volume")

    # ---- SL / TP ------------------------------------------------------

    @staticmethod
    def stop_loss_price(side: str, candle_a: Any, candle_b: Any) -> float:
        if side == "sell":
            return max(Strategy4._value(candle_a, "high"), Strategy4._value(candle_b, "high"))
        return min(Strategy4._value(candle_a, "low"), Strategy4._value(candle_b, "low"))

    @staticmethod
    def tp_sl_for(
        side: str,
        entry: float,
        candle_a: Any,
        candle_b: Any,
        sl_ratio: float = SL_PCT,
        tp_ratio: float = TP_PCT,
    ) -> tuple[float, float]:
        """Returns (tp, sl). sl_ratio/tp_ratio are the strategy's
        sl_pct/tp_pct fields reused as a ratio (default 1:2)."""
        sl = Strategy4.stop_loss_price(side, candle_a, candle_b)
        risk = abs(entry - sl)
        ratio = (tp_ratio / sl_ratio) if sl_ratio else 2.0
        reward = risk * ratio
        tp = entry - reward if side == "sell" else entry + reward
        return tp, sl

    # ---- cycle chaining -------------------------------------------------

    @staticmethod
    def next_cycle_leverage(cycle_number: int) -> float:
        idx = min(max(cycle_number - 1, 0), len(CYCLE_LEVERAGES) - 1)
        return CYCLE_LEVERAGES[idx]

    # ---- partial reduce / breakeven ----------------------------------

    @staticmethod
    def partial_target_price(entry: float, tp: float, side: str) -> float:
        return (entry + tp) / 2

    @staticmethod
    def build_signal(symbol: str, ticker: Ticker, series: list[Candle], coin_pick: str = DEFAULT_COIN_PICK) -> dict[str, Any]:
        last = series[-1]
        return {
            "name": STRATEGY_NAME,
            "rule_set": RULE_SET,
            "pair": symbol,
            "side": Strategy4.side_for(coin_pick),
            "entry": float(last.close),
            "change_pct": float(ticker.change_pct),
            "reason": "1h GREEN->RED + trigger volume-confirmed entry",
        }


__all__ = [
    "Strategy4",
    "STRATEGY_NAME",
    "RULE_SET",
    "DEFAULT_COIN_PICK",
    "DEFAULT_TIMEFRAME",
    "DEFAULT_TRIGGER_TIMEFRAME",
    "REQUIRES_TOP4_FORMAT",
    "ORDER_TYPE",
    "DEFAULT_LEVERAGE",
    "MAX_LEVERAGE",
    "CYCLE_LEVERAGES",
    "MAX_CYCLES_PER_HOUR",
    "PARTIAL_REDUCE_FRACTION",
    "TP_PCT",
    "SL_PCT",
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
