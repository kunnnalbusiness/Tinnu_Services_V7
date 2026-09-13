from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

StrategyStatus = Literal[
    "idle", "waiting", "scanning", "trigger_wait", "pending_order", "linking_position", "in_position", "error", "stopped"
]
CoinPick = Literal[
    "top_loser",
    "top_gainer",
    "top4_gainer_buy",
    "top4_gainer_sell",
    "top4_loser_buy",
    "top4_loser_sell",
]
RuleSet = Literal[
    "legacy",
    "Strategy1",
    "top4_5m_reversal_short",
    "highest_mover_sell",
    "Strategy4",
    "Strategy5",
    "Strategy6",
]
LogLevel = Literal["info", "signal", "trade", "error"]
Timeframe = str
TriggerTimeframe = Literal["1m", "5m"]
OrderType = Literal["market", "limit"]


class StrategyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    rule_set: RuleSet = "legacy"
    coin_pick: CoinPick = "top_loser"
    custom_coins: list[str] = Field(default_factory=list)
    timeframe: str = "1h"
    trigger_timeframe: TriggerTimeframe = "1m"
    order_type: OrderType = "market"
    capital_cap_inr: float = Field(default=40000, gt=0, le=1_000_000_000)
    leverage: float = Field(default=10, ge=1, le=50)
    tp_pct: float | None = Field(default=0.5, ge=0, le=20)
    sl_pct: float | None = Field(default=5.0, ge=0, le=50)
    max_trades_per_day: int = Field(default=5, ge=1, le=20)
    daily_target_inr: float = Field(default=25000, ge=0)
    cycle_leverages: list[float] = Field(default_factory=lambda: [2, 5, 10])
    partial_ratio: float = Field(default=0.75, ge=0.05, le=0.95)

    @model_validator(mode="before")
    @classmethod
    def apply_strategy_defaults(cls, values: object) -> object:
        if isinstance(values, dict):
            values = dict(values)
            for key, value in _strategy_defaults(values.get("rule_set", "legacy")).items():
                if key in {"coin_pick", "order_type", "sl_pct", "partial_ratio"}:
                    values.setdefault(key, value)
            values.setdefault("leverage", _strategy_defaults(values.get("rule_set", "legacy")).get("default_leverage", values.get("leverage", 10)))
            values.setdefault("timeframe", _strategy_defaults(values.get("rule_set", "legacy")).get("timeframe", values.get("timeframe", "1h")))
        return values

    @model_validator(mode="after")
    def validate_strategy_contract(self) -> "StrategyCreate":
        _validate_strategy_contract(self.rule_set, self.coin_pick, self.timeframe, self.order_type, self.leverage)
        _validate_cycle_leverages(self.rule_set, self.cycle_leverages)
        return self


class StrategyUpdate(BaseModel):
    rule_set: RuleSet | None = None
    coin_pick: CoinPick | None = None
    custom_coins: list[str] | None = None
    name: str | None = Field(default=None, min_length=1, max_length=60)
    timeframe: str | None = None
    trigger_timeframe: TriggerTimeframe | None = None
    order_type: OrderType | None = None
    capital_cap_inr: float | None = Field(default=None, gt=0, le=1_000_000_000)
    leverage: float | None = Field(default=None, ge=1, le=50)
    tp_pct: float | None = Field(default=None, ge=0, le=20)
    sl_pct: float | None = Field(default=None, ge=0, le=50)
    max_trades_per_day: int | None = Field(default=None, ge=1, le=20)
    daily_target_inr: float | None = Field(default=None, ge=0)
    cycle_leverages: list[float] | None = None
    partial_ratio: float | None = Field(default=None, ge=0.05, le=0.95)


class Strategy(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str = "admin"
    name: str
    rule_set: RuleSet = "legacy"
    coin_pick: CoinPick = "top_loser"
    custom_coins: list[str] = Field(default_factory=list)
    timeframe: str = "1h"
    trigger_timeframe: TriggerTimeframe = "1m"
    order_type: OrderType = "market"
    capital_cap_inr: float = 40000
    leverage: float = 10
    tp_pct: float | None = 0.5
    sl_pct: float | None = 5.0
    max_trades_per_day: int = 5
    daily_target_inr: float = 25000
    cycle_leverages: list[float] = Field(default_factory=lambda: [2, 5, 10])
    partial_ratio: float = 0.75
    enabled: bool = False
    status: StrategyStatus = "idle"
    detail: str = "Created — switch the bot on to arm this strategy."
    next_slot_ist: str | None = None
    trades_today: int = 0
    open_pair: str | None = None
    open_side: str | None = None
    entry_price: float | None = None
    tp_price: float | None = None
    sl_price: float | None = None
    created_at: str
    cycle_number: int = 1
    cycle_leverage: float = 0.0
    cycles_this_hour: int = 0
    partial_taken: bool = False
    cycle_group_id: str | None = None

    @model_validator(mode="before")
    @classmethod
    def apply_strategy_defaults(cls, values: object) -> object:
        if isinstance(values, dict):
            values = dict(values)
            for key, value in _strategy_defaults(values.get("rule_set", "legacy")).items():
                if key in {"coin_pick", "order_type", "sl_pct"}:
                    values.setdefault(key, value)
            values.setdefault("leverage", _strategy_defaults(values.get("rule_set", "legacy")).get("default_leverage", values.get("leverage", 10)))
            values.setdefault("timeframe", _strategy_defaults(values.get("rule_set", "legacy")).get("timeframe", values.get("timeframe", "1h")))
        return values

    @model_validator(mode="after")
    def validate_strategy_contract(self) -> "Strategy":
        _validate_strategy_contract(self.rule_set, self.coin_pick, self.timeframe, self.order_type, self.leverage)
        _validate_cycle_leverages(self.rule_set, self.cycle_leverages)
        return self


def _validate_strategy_contract(
    rule_set: RuleSet,
    coin_pick: CoinPick,
    timeframe: str,
    order_type: OrderType,
    leverage: float,
) -> None:
    if timeframe not in allowed_timeframes_for(rule_set):
        raise ValueError(f"{rule_set} does not support timeframe {timeframe}")
    defaults = _strategy_defaults(rule_set)
    if not defaults:
        return
    if defaults.get("requires_top4_format") and (
        not coin_pick.startswith("top4_") or not coin_pick.endswith(("_buy", "_sell"))
    ):
        raise ValueError(f"{rule_set} requires a top4 BUY or SELL coin selection")
    if order_type != defaults["order_type"]:
        raise ValueError(f"{rule_set} requires {defaults['order_type']} orders")
    if leverage > defaults["max_leverage"]:
        raise ValueError(f"{rule_set} leverage cannot exceed {defaults['max_leverage']}x")


def _validate_cycle_leverages(rule_set: RuleSet, cycle_leverages: list[float]) -> None:
    if rule_set not in ("Strategy4", "Strategy5"):
        return
    if len(cycle_leverages) != 3:
        raise ValueError("Strategy4 requires exactly three cycle leverage values")
    if any(value < 1 or value > 10 for value in cycle_leverages):
        raise ValueError("Strategy4 cycle leverage values must be between 1x and 10x")


LEGACY_TIMEFRAMES: set[str] = {"5m", "15m", "30m", "1h", "4h", "1d"}


def allowed_timeframes_for(rule_set: str) -> set[str]:
    if not rule_set or rule_set == "legacy":
        return LEGACY_TIMEFRAMES
    defaults = _strategy_defaults(rule_set)
    return set(defaults.get("timeframes") or LEGACY_TIMEFRAMES)


def _strategy_defaults(rule_set: str) -> dict[str, object]:
    if rule_set == "legacy":
        return {}
    import sys
    from strategies.registry import get_strategy_module

    strategy_module = get_strategy_module(rule_set)
    if strategy_module is None:
        return {}
    namespace = vars(sys.modules[strategy_module.__module__]).copy()
    namespace.update(vars(strategy_module))
    return {
        "coin_pick": namespace.get("DEFAULT_COIN_PICK", "top_loser"),
        "order_type": namespace.get("ORDER_TYPE", "market"),
        "sl_pct": namespace.get("SL_PCT"),
        "timeframe": namespace.get("DEFAULT_TIMEFRAME", "1h"),
        "timeframes": set(namespace.get("TF_MINUTES", {"1h": 60})),
        "max_leverage": namespace.get("MAX_LEVERAGE", 50),
        "default_leverage": namespace.get("DEFAULT_LEVERAGE", namespace.get("MAX_LEVERAGE", 10)),
        "requires_top4_format": namespace.get("REQUIRES_TOP4_FORMAT", False),
    }


class LogEntry(BaseModel):
    id: str
    owner_id: str = "admin"
    strategy_id: str | None = None
    strategy_name: str | None = None
    level: LogLevel
    message: str
    ts: str


class Trade(BaseModel):
    id: str
    owner_id: str = "admin"
    strategy_id: str
    strategy_name: str
    rule_set: RuleSet = "legacy"
    pair: str
    side: str = "sell"
    mode: str
    timeframe: str = "1h"
    entry_price: float
    tp_price: float | None = None
    sl_price: float | None = None
    cycle_group_id: str | None = None
    cycle_number: int = 1
    partial_booked_pct: float | None = None
    partial_booked_price: float | None = None
    partial_booked_pnl_inr: float | None = None
    partial_taken: bool = False
    original_sl_price: float | None = None
    quantity: float
    leverage: float
    capital_inr: float
    status: str
    exit_price: float | None = None
    pnl_pct: float | None = None
    pnl_inr: float | None = None
    opened_at: str
    closed_at: str | None = None
    order_id: str | None = None
    client_order_id: str | None = None
    position_id: str | None = None


class LivePosition(BaseModel):
    trade_id: str
    strategy_id: str
    strategy_name: str
    rule_set: RuleSet = "legacy"
    pair: str
    symbol: str
    side: str
    timeframe: str
    mode: str
    state: str                 # pending_order | open
    entry_price: float
    tp_price: float | None = None
    sl_price: float | None
    cycle_group_id: str | None = None
    cycle_number: int = 1
    partial_taken: bool = False
    partial_booked_pnl_inr: float | None = None
    original_sl_price: float | None = None
    quantity: float
    leverage: float
    capital_inr: float
    last_price: float | None
    pnl_pct: float | None
    pnl_inr: float | None
    distance_to_tp_pct: float | None
    distance_to_sl_pct: float | None
    opened_at: str
    order_deadline_ist: str | None = None
    order_id: str | None = None
    client_order_id: str | None = None
    position_id: str | None = None


class CredentialStatus(BaseModel):
    configured: bool
    api_key_masked: str
    api_secret_masked: str
    live_trading: bool


class CredentialValidation(BaseModel):
    configured: bool = True
    live_ready: bool = True
    wallet_balance_inr: float = 0.0
    active_instruments_count: int = 0
    open_positions_count: int = 0
    usdt_inr_rate: float = 0.0
    message: str = "Credentials validated successfully."


class CredentialUpdate(BaseModel):
    api_key: str = Field(min_length=8, max_length=200)
    api_secret: str = Field(min_length=8, max_length=200)

    @field_validator("api_key", "api_secret")
    @classmethod
    def trim_and_require_value(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 8:
            raise ValueError("API key and secret must each contain at least 8 characters")
        return value


class DayPnl(BaseModel):
    date: str
    pnl_inr: float
    trades: int
    wins: int
    losses: int


class TodaySummary(BaseModel):
    date: str
    server_time_ist: str
    pnl_inr: float
    target_inr: float
    target_achieved: bool
    trades_done: int
    max_trades: int
    open_trades: int
    trades: list[Trade]


class BotState(BaseModel):
    bot_on: bool
    execution_mode: str
    credentials_configured: bool
    timezone: str
    trading_window: str
    server_time_ist: str
    display_timezone: str = "UTC"
    in_window: bool
    strategies: list[Strategy]


class ToggleRequest(BaseModel):
    on: bool