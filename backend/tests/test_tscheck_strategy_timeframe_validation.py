"""Backend contract checks: strategy timeframe validation, daily-history bounds,
removed force-run endpoint, and invalid candle resolution."""


def test_strategy_invalid_timeframe_rejected(client):
    resp = client.post(
        "/bot/strategies",
        json={"name": "tscheck-strategy-badtf", "timeframe": "7m"},
    )
    assert resp.status_code == 422, f"expected 422, got {resp.status_code}: {resp.text[:200]}"


def test_strategy_valid_timeframe_5m_accepted_and_persisted(client):
    resp = client.post(
        "/bot/strategies",
        json={"name": "tscheck-strategy-5m", "timeframe": "5m"},
    )
    assert resp.status_code == 201, f"expected 201, got {resp.status_code}: {resp.text[:200]}"
    created = resp.json()
    assert created["timeframe"] == "5m"

    list_resp = client.get("/bot/strategies")
    assert list_resp.status_code == 200
    match = next((s for s in list_resp.json() if s["id"] == created["id"]), None)
    assert match is not None and match["timeframe"] == "5m", f"strategy not found/wrong timeframe: {match}"

    del_resp = client.delete(f"/bot/strategies/{created['id']}")
    assert del_resp.status_code == 204, f"cleanup delete failed: {del_resp.status_code}"


def test_strategy_valid_timeframe_30m_accepted(client):
    resp = client.post(
        "/bot/strategies",
        json={"name": "tscheck-strategy-30m", "timeframe": "30m"},
    )
    assert resp.status_code == 201, f"expected 201, got {resp.status_code}: {resp.text[:200]}"
    created = resp.json()
    assert created["timeframe"] == "30m"

    list_resp = client.get("/bot/strategies")
    assert list_resp.status_code == 200
    match = next((s for s in list_resp.json() if s["id"] == created["id"]), None)
    assert match is not None and match["timeframe"] == "30m", f"strategy not found/wrong timeframe: {match}"

    del_resp = client.delete(f"/bot/strategies/{created['id']}")
    assert del_resp.status_code == 204, f"cleanup delete failed: {del_resp.status_code}"


def test_strategy4_uses_supported_decision_timeframes(client):
    resp = client.post(
        "/bot/strategies",
        json={
            "name": "tscheck-strategy4-5m",
            "rule_set": "Strategy4",
            "timeframe": "5m",
        },
    )
    assert resp.status_code == 201, f"expected 201, got {resp.status_code}: {resp.text[:200]}"
    created = resp.json()
    assert created["timeframe"] == "5m"

    del_resp = client.delete(f"/bot/strategies/{created['id']}")
    assert del_resp.status_code == 204, f"cleanup delete failed: {del_resp.status_code}"

    compatibility_resp = client.post(
        "/bot/strategies",
        json={
            "name": "tscheck-strategy4-1m",
            "rule_set": "Strategy4",
            "timeframe": "1m",
        },
    )
    assert compatibility_resp.status_code == 201, f"expected 201, got {compatibility_resp.status_code}: {compatibility_resp.text[:200]}"
    assert compatibility_resp.json()["timeframe"] == "1m"
    del_resp = client.delete(f"/bot/strategies/{compatibility_resp.json()['id']}")
    assert del_resp.status_code == 204, f"cleanup delete failed: {del_resp.status_code}"


def test_daily_history_days_zero_rejected(client):
    resp = client.get("/bot/history/daily", params={"days": 0})
    assert resp.status_code == 422, f"expected 422, got {resp.status_code}: {resp.text[:200]}"


def test_force_run_endpoint_removed(client):
    resp = client.post("/bot/strategies/any-id/run")
    assert resp.status_code == 404, f"expected 404, got {resp.status_code}: {resp.text[:200]}"


def test_candles_invalid_resolution_rejected(client):
    resp = client.get("/market/candles/B-BTC_USDT", params={"resolution": "7x"})
    assert resp.status_code == 400, f"expected 400, got {resp.status_code}: {resp.text[:200]}"
