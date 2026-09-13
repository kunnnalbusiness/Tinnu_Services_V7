"""tscheck: live trading cannot be enabled without credentials; short keys are rejected."""
import httpx

BASE_URL = "http://localhost:8001/api"


def test_live_toggle_without_credentials_returns_400():
    with httpx.Client(timeout=10) as client:
        # Ensure no credentials are stored (best-effort cleanup of any prior state).
        client.delete(f"{BASE_URL}/bot/credentials")

        status = client.get(f"{BASE_URL}/bot/credentials")
        assert status.status_code == 200
        assert status.json()["configured"] is False

        resp = client.post(f"{BASE_URL}/bot/credentials/live", json={"on": True})
        assert resp.status_code == 400, f"expected 400, got {resp.status_code}: {resp.text}"
        assert "credential" in resp.json()["detail"].lower() or "key" in resp.json()["detail"].lower()


def test_short_api_key_and_secret_rejected_with_422():
    with httpx.Client(timeout=10) as client:
        resp = client.post(
            f"{BASE_URL}/bot/credentials",
            json={"api_key": "abc", "api_secret": "xyz"},
        )
        assert resp.status_code == 422, f"expected 422, got {resp.status_code}: {resp.text}"
        body = resp.json()
        assert "detail" in body

        # Confirm nothing got persisted as configured from the rejected payload.
        status = client.get(f"{BASE_URL}/bot/credentials")
        assert status.status_code == 200
        assert status.json()["configured"] is False
