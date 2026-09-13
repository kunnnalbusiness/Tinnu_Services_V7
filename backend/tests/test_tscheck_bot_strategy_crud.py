"""Backend CRUD check for bot strategies: create -> verify -> delete -> verify gone."""
import uuid


def test_bot_strategy_crud_lifecycle(client):
    name = f"tscheck-strategy-{uuid.uuid4().hex[:8]}"

    create_resp = client.post("/bot/strategies", json={"name": name})
    assert create_resp.status_code in (200, 201), f"create failed: {create_resp.status_code} {create_resp.text[:200]}"
    created = create_resp.json()
    strategy_id = created.get("id") or created.get("_id")
    assert strategy_id, f"no id in create response: {created}"

    list_resp = client.get("/bot/strategies")
    assert list_resp.status_code == 200
    ids = [s.get("id") or s.get("_id") for s in list_resp.json()]
    assert strategy_id in ids, f"created strategy {strategy_id} not found in list {ids}"

    del_resp = client.delete(f"/bot/strategies/{strategy_id}")
    assert del_resp.status_code in (200, 204), f"delete failed: {del_resp.status_code} {del_resp.text[:200]}"

    list_resp2 = client.get("/bot/strategies")
    ids2 = [s.get("id") or s.get("_id") for s in list_resp2.json()]
    assert strategy_id not in ids2, f"strategy {strategy_id} still present after delete"
