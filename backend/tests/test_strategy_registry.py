from strategies.registry import get_strategy_templates


def test_strategy_registry_exposes_dynamic_templates():
    templates = get_strategy_templates()
    assert templates
    rule_sets = {template["rule_set"] for template in templates}
    assert "legacy" not in rule_sets
    assert "Strategy1" in rule_sets
    assert "top4_5m_reversal_short" in rule_sets
    assert "highest_mover_sell" in rule_sets
    assert "Strategy4" in rule_sets
