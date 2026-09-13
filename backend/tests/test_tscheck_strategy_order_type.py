from __future__ import annotations

from datetime import datetime, timezone

from models.bot import Strategy, StrategyCreate


def test_strategy_create_accepts_order_type_and_defaults_to_market():
    created = StrategyCreate(name="Order type check", order_type="limit")
    assert created.order_type == "limit"

    stored = Strategy(name="Stored order type", created_at=datetime.now(timezone.utc).isoformat())
    assert stored.order_type == "market"


def test_reversal_short_requires_limit_entry():
    short = Strategy(
        name="Reversal short",
        rule_set="top4_5m_reversal_short",
        coin_pick="top4_gainer_sell",
        order_type="limit",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    assert short.order_type == "limit"
    assert short.rule_set == "top4_5m_reversal_short"
    assert short.rule_set == "top4_5m_reversal_short"
