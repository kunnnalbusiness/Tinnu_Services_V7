"""Backend error-handling checks for bot and market APIs."""


def test_market_instrument_not_found(client):
    resp = client.get("/market/instrument/B-NOPE_USDT")
    assert resp.status_code == 404, f"expected 404, got {resp.status_code}: {resp.text[:200]}"


def test_market_candles_invalid_resolution(client):
    resp = client.get("/market/candles/B-BTC_USDT", params={"resolution": "7x"})
    assert resp.status_code == 400, f"expected 400, got {resp.status_code}: {resp.text[:200]}"


def test_bot_delete_strategy_not_found(client):
    resp = client.delete("/bot/strategies/nope")
    assert resp.status_code == 404, f"expected 404, got {resp.status_code}: {resp.text[:200]}"


def test_bot_create_strategy_empty_name_rejected(client):
    resp = client.post("/bot/strategies", json={"name": ""})
    assert resp.status_code == 422, f"expected 422, got {resp.status_code}: {resp.text[:200]}"
