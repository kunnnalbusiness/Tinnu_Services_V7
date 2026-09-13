from __future__ import annotations

from dataclasses import dataclass
from datetime import time as dtime
from decimal import Decimal
from typing import Any


WINDOW_START = dtime(5, 30)
WINDOW_END = dtime(3, 40)

TF_MINUTES: dict[str, int] = {
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
}

ORDER_WINDOW: dict[str, int] = {
    "5m": 60,
    "15m": 120,
    "1h": 300,
    "4h": 300,
}

PRESCAN_LEAD = 60
TICK_SECONDS = 2.0
MAX_LOGS = 400
MAX_TRADE_HISTORY = 400

FEE_SAFETY_BUFFER = Decimal("0.98")
LIVE_MARGIN_UTILIZATION_LIMIT = Decimal("0.70")
LIVE_MARGIN_MINIMUM = Decimal("250")

ORDER_RETRY_ATTEMPTS = 3
ORDER_RETRY_DELAY = 2.0

LIQUIDATION_CHECK_SECONDS = 10

DB_RETRY_ATTEMPTS = 3
DB_RETRY_DELAY = 1.0

STRATEGY_NAME = "HIGHEST MOVER SELL"
RULE_SET = "highest_mover_sell"
SIDE = "sell"
DEFAULT_COIN_PICK = "top_gainer"
DEFAULT_TIMEFRAME = "1h"
ORDER_TYPE = "market"
MAX_LEVERAGE = 10
TP_PCT = 5.0
SL_PCT = 0.0


@dataclass
class Ticker:
    symbol: str
    change_pct: float
    volume_24h: float | None = None
    quote_volume: float | None = None


class Strategy3:
    """Strategy 3: highest positive mover short logic.

    Logic summary:
    - scan all available movers
    - keep only pairs with a positive daily move
    - sort by strongest mover and trading volume
    - choose the strongest positive mover as the sell candidate
    """

    name = STRATEGY_NAME
    rule_set = RULE_SET
    side = SIDE
    selection_mode = "highest_mover"

    @staticmethod
    def ranked_candidates(pool: list[Any]) -> list[Any]:
        if not pool:
            return []
        return sorted(
            pool,
            key=lambda item: (
                float(getattr(item, "change_pct", 0.0)),
                float(getattr(item, "volume_24h", 0.0) or getattr(item, "quote_volume", 0.0) or 0.0),
            ),
            reverse=True,
        )

    @staticmethod
    def select_pair(tickers: dict[str, Ticker]) -> str | None:
        winners: list[tuple[float, float, str]] = []

        for symbol, ticker in tickers.items():
            if ticker.change_pct <= 0:
                continue

            volume = float(ticker.volume_24h or ticker.quote_volume or 0.0)
            winners.append((ticker.change_pct, volume, symbol))

        if not winners:
            return None

        winners.sort(key=lambda item: (-item[0], -item[1], item[2]))
        return winners[0][2]

    @staticmethod
    def build_signal(symbol: str, ticker: Ticker, entry: float) -> dict[str, Any]:
        return {
            "name": STRATEGY_NAME,
            "rule_set": RULE_SET,
            "pair": symbol,
            "side": SIDE,
            "entry": float(entry),
            "change_pct": float(ticker.change_pct),
            "reason": "highest positive mover sell setup",
        }


__all__ = [
    "Strategy3",
    "STRATEGY_NAME",
    "RULE_SET",
    "SIDE",
    "DEFAULT_COIN_PICK",
    "ORDER_TYPE",
    "MAX_LEVERAGE",
    "TP_PCT",
    "SL_PCT",
    "WINDOW_START",
    "WINDOW_END",
    "TF_MINUTES",
    "ORDER_WINDOW",
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
