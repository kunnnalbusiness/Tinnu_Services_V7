from __future__ import annotations

import sys
from typing import Any

from .Strategy1 import Strategy1
from .Strategy2 import Strategy2
from .Strategy3 import Strategy3
from .Strategy4 import Strategy4
from .Strategy5 import Strategy5
from .Strategy6 import Strategy6


def _strategy_namespace(strategy_cls: type[Any]) -> dict[str, Any]:
    namespace: dict[str, Any] = {}
    module = sys.modules.get(strategy_cls.__module__)
    if module is not None:
        namespace.update(vars(module))
    namespace.update(vars(strategy_cls))
    return namespace

STRATEGY_REGISTRY: dict[str, type[Any]] = {
    Strategy1.rule_set: Strategy1,
    Strategy2.rule_set: Strategy2,
    Strategy3.rule_set: Strategy3,
    Strategy4.rule_set: Strategy4,
    Strategy5.rule_set: Strategy5,
    Strategy6.rule_set: Strategy6,
}


def get_strategy_module(rule_set: str | None) -> type[Any] | None:
    if not rule_set or rule_set == "legacy":
        return None
    return STRATEGY_REGISTRY.get(rule_set)


def get_strategy_mode(rule_set: str | None) -> str:
    strategy_module = get_strategy_module(rule_set)
    if strategy_module is None:
        return "default"
    namespace = _strategy_namespace(strategy_module)
    return namespace.get("selection_mode", "default")


def get_strategy_prescan_lead(rule_set: str | None) -> int:
    strategy_module = get_strategy_module(rule_set)
    if strategy_module is None:
        return 60
    namespace = _strategy_namespace(strategy_module)
    return namespace.get("PRESCAN_LEAD", 60)


def get_strategy_runtime_config(rule_set: str | None) -> dict[str, Any]:
    strategy_module = get_strategy_module(rule_set)
    if strategy_module is None:
        return {}
    namespace = _strategy_namespace(strategy_module)
    return {
        key: namespace[key]
        for key in (
            "WINDOW_START",
            "WINDOW_END",
            "TF_MINUTES",
            "ORDER_WINDOW",
            "PRESCAN_LEAD",
            "TICK_SECONDS",
            "MAX_LOGS",
            "MAX_TRADE_HISTORY",
            "CYCLE_LEVERAGES",
            "MAX_CYCLES_PER_HOUR",
            "PARTIAL_REDUCE_FRACTION",
        )
        if key in namespace
    }


def _template_from_strategy(strategy_cls: type[Any], *, name: str | None = None) -> dict[str, Any]:
    rule_set = getattr(strategy_cls, "rule_set", "legacy")
    namespace = _strategy_namespace(strategy_cls)
    metadata = {
        "rule_set": rule_set,
        "name": name or getattr(strategy_cls, "name", str(rule_set)),
        "coin_pick": namespace.get("DEFAULT_COIN_PICK", "top_loser"),
        "timeframe": namespace.get("DEFAULT_TIMEFRAME", "1h"),
        "trigger_timeframe": namespace.get("DEFAULT_TRIGGER_TIMEFRAME", "1m"),
        "order_type": namespace.get("ORDER_TYPE", "market"),
        "capital_cap_inr": namespace.get("DEFAULT_CAPITAL_CAP_INR", 40000 if "DEFAULT_CAPITAL_CAP_INR" not in namespace else namespace["DEFAULT_CAPITAL_CAP_INR"]),
        "leverage": namespace.get("DEFAULT_LEVERAGE", namespace.get("MAX_LEVERAGE", 10)),
        "tp_pct": namespace.get("TP_PCT", 0.5),
        "sl_pct": namespace.get("SL_PCT"),
        "partial_ratio": namespace.get("PARTIAL_REDUCE_FRACTION", 0.75),
        "max_trades_per_day": namespace.get("DEFAULT_MAX_TRADES_PER_DAY", 5),
        "daily_target_inr": 25000,
    }
    return metadata


STRATEGY_TEMPLATES: list[dict[str, Any]] = [
    _template_from_strategy(Strategy1, name="1. 1PERIOD CYCLE V1"),
    _template_from_strategy(Strategy2, name="2. 1PERIOD CYCLE V2"),
    _template_from_strategy(Strategy3, name="HIGHEST MOVER SELL"),
    _template_from_strategy(Strategy4, name="1HR VOL. CONF."),
    _template_from_strategy(Strategy5, name="1HR VOL. CONF. V2"),
    _template_from_strategy(Strategy6, name="6. FUNDING LOSS"),
]


def get_strategy_template(rule_set: str) -> dict[str, Any] | None:
    for template in STRATEGY_TEMPLATES:
        if template["rule_set"] == rule_set:
            return template.copy()
    return None


def get_strategy_templates() -> list[dict[str, Any]]:
    return [template.copy() for template in STRATEGY_TEMPLATES]


__all__ = [
    "STRATEGY_REGISTRY",
    "STRATEGY_TEMPLATES",
    "get_strategy_module",
    "get_strategy_mode",
    "get_strategy_prescan_lead",
    "get_strategy_runtime_config",
    "get_strategy_template",
    "get_strategy_templates",
]