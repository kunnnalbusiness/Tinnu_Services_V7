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

STRATEGY_NAME = "1HR VOL. CONF. V2"
RULE_SET = "Strategy5"
DEFAULT_COIN_PICK = "top4_gainer_sell"
DEFAULT_TIMEFRAME = "1h"
REQUIRES_TOP4_FORMAT = True
ORDER_TYPE = "limit"
DEFAULT_LEVERAGE = 2
MAX_LEVERAGE = 10
DEFAULT_CAPITAL_CAP_INR = None

CYCLE_LEVERAGES: list[float] = [2, 5, 10]
MAX_CYCLES_PER_HOUR = 3
PARTIAL_REDUCE_FRACTION = 0.75

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


class Strategy5:
    """Strategy 5: 1h GREEN->RED confirmation + trigger-timeframe
    GREEN -> RED1 -> RED2 confirmed entry, fixed 3-level leverage cycle
    chaining on the same pair, partial-reduce + breakeven.

    - Configured decision-timeframe candles: last two CLOSED candles must be
      GREEN then RED — same for BUY and SELL (side only sets order
      direction via coin_pick, not the pattern).
    - Trigger-timeframe (1m/5m) sequence:
        1. GREEN candle starts the sequence.
        2. RED1 (first RED after the GREEN) closes -> volume check: the
           GREEN candle's volume must be greater than RED1's volume.
           Fail -> full reset, wait for a fresh GREEN.
        3. On volume pass, entry does NOT fire yet -> wait for RED2 (the
           next RED candle).
        4. RED2 closes -> compare candle bodies:
             - RED2 body > RED1 body -> entry confirmed. Entry price is
               RED1's close (not RED2's close).
             - RED2 body <= RED1 body -> full reset, wait for a fresh
               GREEN (RED2 is never reused as a new RED1).
    - SL = higher HIGH of RED1/RED2 (SELL) / lower LOW of RED1/RED2 (BUY).
      TP = SL-distance * (tp_pct/sl_pct) from entry — default 1:2.
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
        prev_open = Strategy5._value(prev, "open")
        prev_close = Strategy5._value(prev, "close")
        last_open = Strategy5._value(last, "open")
        last_close = Strategy5._value(last, "close")
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
            if not Strategy5.should_enter(symbol, ticker, series[-2:], coin_pick):
                continue
            ranked.append((abs(float(getattr(ticker, "change_pct", 0.0))), symbol))
        if not ranked:
            return None
        ranked.sort(key=lambda item: item[0], reverse=True)
        return ranked[0][1]

    # ---- trigger-timeframe scan --------------------------------------

    @staticmethod
    def trigger_action(series: list[Any], trigger_seen: bool, coin_pick: str = DEFAULT_COIN_PICK) -> str | None:
        """GREEN then RED, side-independent (mirrors the 1h pattern).

        Note: this only classifies a single candle as the "green" or "red"
        step of the GREEN->RED sequence. The RED1 vs RED2 distinction (and
        the body-size comparison between them) is tracked by the caller
        (bot_engine), not by this helper — this keeps trigger_action
        identical in shape to Strategy4's, so the engine's GREEN-detection
        and re-arming logic can stay shared between the two strategies.
        """
        if not series:
            return None
        candle = series[-1]
        opening = Strategy5._value(candle, "open")
        closing = Strategy5._value(candle, "close")
        current = "green" if closing > opening else "red" if closing < opening else None
        first_trigger, second_trigger = "green", "red"
        if current == first_trigger and not trigger_seen:
            return first_trigger
        if current == second_trigger and trigger_seen:
            return second_trigger
        return None

    @staticmethod
    def volume_confirmed(first_candle: Any, second_candle: Any) -> bool:
        """Entry sequence only continues past RED1 if the GREEN (first)
        trigger candle's volume beats RED1 (second) trigger candle's
        volume."""
        return Strategy5._value(first_candle, "volume") > Strategy5._value(second_candle, "volume")

    # @staticmethod
    # def red2_confirmed(red1_candle: Any, red2_candle: Any) -> bool:
    #     """RED2 only confirms the entry if its candle body is strictly
    #     bigger than RED1's candle body. Equal or smaller -> reject."""
    #     red1_body = abs(
    #         Strategy5._value(red1_candle, "close") - Strategy5._value(red1_candle, "open")
    #     )
    #     red2_body = abs(
    #         Strategy5._value(red2_candle, "close") - Strategy5._value(red2_candle, "open")
    #     )
    #     return red2_body > red1_body

    @staticmethod
    def red2_confirmed(red1_candle: Any, red2_candle: Any) -> bool:
        """RED2 only confirms the entry if its close is below RED1's low
        wick. Otherwise -> reject."""
        red1_low = Strategy5._value(red1_candle, "low")
        red2_close = Strategy5._value(red2_candle, "close")
        return red2_close < red1_low
    # ---- SL / TP ------------------------------------------------------

    @staticmethod
    def stop_loss_price(side: str, candle_a: Any, candle_b: Any | None = None) -> float:
        """SL trigger candles calculation:
        Always Highest High: max(Candle A High, Candle B High) for both BUY and SELL (no min).
        """
        if candle_b is None:
            candle_b = candle_a
        high_a = Strategy5._value(candle_a, "high")
        high_b = Strategy5._value(candle_b, "high")
        return max(high_a, high_b)

    @staticmethod
    def tp_sl_for(
        side: str,
        entry: float,
        candle_a: Any,
        candle_b: Any | None = None,
        sl_ratio: float = SL_PCT,
        tp_ratio: float = TP_PCT,
    ) -> tuple[float, float]:
        """Returns (tp, sl).
        SL is always set from trigger candles:
          - SELL / SHORT: max(Candle A High, Candle B High)
          - BUY / LONG:   min(Candle A Low, Candle B Low)
        TP is calculated from risk distance:
          - SELL / SHORT: entry - (risk * ratio)
          - BUY / LONG:   entry + (risk * ratio)
        """
        is_sell = str(side).lower() in ("sell", "short")
        sl = Strategy5.stop_loss_price(side, candle_a, candle_b)
        risk = abs(entry - sl)
        if risk == 0:
            risk = entry * 0.01
        ratio = (tp_ratio / sl_ratio) if sl_ratio else 2.0
        reward = risk * ratio
        tp = entry - reward if is_sell else entry + reward
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
            "side": Strategy5.side_for(coin_pick),
            "entry": float(last.close),
            "change_pct": float(ticker.change_pct),
            "reason": "1h GREEN->RED + trigger GREEN->RED1->RED2 confirmed entry",
        }


__all__ = [
    "Strategy5",
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
