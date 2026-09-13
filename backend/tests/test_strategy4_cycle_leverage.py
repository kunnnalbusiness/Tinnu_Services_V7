from __future__ import annotations

import pytest

from models.bot import Strategy, StrategyCreate


def test_strategy4_cycle_leverages_are_editable_and_persisted():
    created = StrategyCreate(
        name="Custom Strategy4",
        rule_set="Strategy4",
        cycle_leverages=[2, 5, 10],
    )
    strategy = Strategy(
        **created.model_dump(),
        created_at="2026-01-01T00:00:00+00:00",
    )

    assert strategy.cycle_leverages == [2, 5, 10]


@pytest.mark.parametrize(
    "cycle_leverages",
    ([2, 5], [2, 5, 11]),
)
def test_strategy4_rejects_invalid_cycle_leverage_values(cycle_leverages):
    with pytest.raises(ValueError):
        StrategyCreate(
            name="Invalid Strategy4",
            rule_set="Strategy4",
            cycle_leverages=cycle_leverages,
        )