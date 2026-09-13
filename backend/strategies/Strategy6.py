from __future__ import annotations

from dataclasses import dataclass
from datetime import time as dtime
from decimal import Decimal
from typing import Any


WINDOW_START = dtime(0, 0)
WINDOW_END = dtime(23, 59)

TF_MINUTES: dict[str, int] = {
    "4h": 240,
    "1h": 60,
}

ORDER_WINDOW: dict[str, int] = {
    "4h": 60,
    "1h": 60,
}

PRESCAN_LEAD = 30
TICK_SECONDS = 0.5
MAX_LOGS = 400
MAX_TRADE_HISTORY = 400

FEE_SAFETY_BUFFER = Decimal("0.98")
LIVE_MARGIN_UTILIZATION_LIMIT = Decimal("1.0")
LIVE_MARGIN_MINIMUM = Decimal("250")

ORDER_RETRY_ATTEMPTS = 3
ORDER_RETRY_DELAY = 1.0

LIQUIDATION_CHECK_SECONDS = 10

DB_RETRY_ATTEMPTS = 3
DB_RETRY_DELAY = 1.0

STRATEGY_NAME = "6. FUNDING LOSS"
RULE_SET = "Strategy6"
DEFAULT_COIN_PICK = "top_loser"
DEFAULT_TIMEFRAME = "4h"
ORDER_TYPE = "market"
DEFAULT_LEVERAGE = 10
MAX_LEVERAGE = 50
DEFAULT_CAPITAL_CAP_INR = None
DEFAULT_MAX_TRADES_PER_DAY = 10

TP_PCT = 0.0
SL_PCT = None

# Exact funding countdown triggers:
# Entry: 4 seconds before settlement (00:00:04 countdown)
ENTRY_COUNTDOWN_SECONDS = 4.0
# Exit: 2 seconds after settlement (03:59:58 countdown in new 4-hour cycle)
EXIT_COUNTDOWN_OFFSET_SECONDS = 2.0


@dataclass
class Ticker:
    symbol: str
    pair: str
    change_pct: float
    funding_rate: float = 0.0
    last: float = 0.0
    volume: float = 0.0


class Strategy6:
    """Strategy 6: Funding Loss / Arbitrage Strategy.

    Execution cycle:
    - Tracks CoinDCX 4-hour funding settlements (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC).
    - Selects candidate based on user preference: Top Loser, Top Buyer / Gainer (evaluating next funding rate), or Custom Coins.
    - Entry: Triggers exact market order when funding countdown reaches 00:00:04 (<= 4.0s before settlement).
    - Holding: Holds position through the 00:00:00 settlement snapshot to capture/harvest the funding rate payment.
    - Exit: Automatically closes the position at 03:59:58 (2 seconds into the new cycle).
    Total in-trade duration is ~6 seconds.
    """

    name = STRATEGY_NAME
    rule_set = RULE_SET
    selection_mode = "funding_loss"

    @staticmethod
    def _val(obj: Any, key: str, default: float = 0.0) -> float:
        if isinstance(obj, dict):
            val = obj.get(key, default)
        else:
            val = getattr(obj, key, default)
        try:
            return float(val) if val is not None else default
        except (ValueError, TypeError):
            return default

    @staticmethod
    def side_for(coin_pick: str, funding_rate: float | None = None) -> str:
        """Determines side based on funding rate fee mechanics or coin pick.
        - Positive funding rate (+): Longs pay Shorts. Taking a SELL (Short) receives funding fee.
        - Negative funding rate (-): Shorts pay Longs. Taking a BUY (Long) receives funding fee.
        """
        if funding_rate is not None and abs(funding_rate) > 1e-7:
            return "sell" if funding_rate > 0 else "buy"

        cp = str(coin_pick).lower()
        if "buy" in cp or "loser" in cp:
            return "buy"
        return "sell"

    @staticmethod
    def ranked_candidates(pool: list[Any], coin_pick: str = DEFAULT_COIN_PICK) -> list[Any]:
        """Rank candidates according to next funding rate or 24h change."""
        if not pool:
            return []

        cp = str(coin_pick).lower()
        # If user picked Top Buyer / Gainer:
        # Prioritize highest positive funding rate (or strongest gainer)
        if "gainer" in cp or "buyer" in cp or "buy" in cp:
            # Sort primarily by funding rate descending; if 0, by change_pct
            return sorted(
                pool,
                key=lambda item: (
                    Strategy6._val(item, "funding_rate", 0.0),
                    Strategy6._val(item, "change_pct", 0.0),
                ),
                reverse=True,
            )

        # If user picked Top Loser:
        # Prioritize most negative funding rate (or biggest loser)
        return sorted(
            pool,
            key=lambda item: (
                Strategy6._val(item, "funding_rate", 0.0),
                Strategy6._val(item, "change_pct", 0.0),
            ),
            reverse=False,
        )

    @staticmethod
    def select_candidate(pool: list[Any], coin_pick: str = DEFAULT_COIN_PICK) -> Any | None:
        ranked = Strategy6.ranked_candidates(pool, coin_pick)
        return ranked[0] if ranked else None


__all__ = [
    "Strategy6",
    "STRATEGY_NAME",
    "RULE_SET",
    "DEFAULT_TIMEFRAME",
    "DEFAULT_LEVERAGE",
    "DEFAULT_COIN_PICK",
    "ORDER_TYPE",
    "ENTRY_COUNTDOWN_SECONDS",
    "EXIT_COUNTDOWN_OFFSET_SECONDS",
]
