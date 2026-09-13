# Live Trading Guide

## Purpose

This guide is the real-world operating checklist for the bot. It explains the exact conditions required to move from paper mode to live CoinDCX futures execution and the key safety points to monitor while the bot is online.

## Safety rule

The bot only sends a live futures order when all of the following are true:

- valid CoinDCX API key and secret are present
- the app is authenticated and credentials are loaded
- the live toggle is enabled in the app/backend state (`true`), not a hardcoded literal value
- the bot is on and the strategy is active
- the INR futures wallet has usable margin
- the selected pair is valid for the INR futures book

If any of the above fails, the engine remains in paper mode and only simulates the fill path.

## Actual repo setup

Use the project root in this workspace:

```bash
cd /workspaces/codespaces-blank/Tinnu_Services_V3
```

### Backend

```bash
cd /workspaces/codespaces-blank/Tinnu_Services_V3/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Frontend

```bash
cd /workspaces/codespaces-blank/Tinnu_Services_V3/frontend
npm install
npm run dev -- --host 0.0.0.0 --port 3000
```

### Backend runtime

```bash
cd /workspaces/codespaces-blank/Tinnu_Services_V3/backend
source .venv/bin/activate
python -m uvicorn server:app --host 0.0.0.0 --port 8001
```

## Required environment variables

The backend loads `.env` from the backend directory. The app reads `MONGODB_URI` and `DB_NAME` directly in `backend/lib/db.py`.

Example `backend/.env`:

```env
MONGODB_URI="mongodb://127.0.0.1:27017"
DB_NAME="scalping"
ADMIN_EMAIL="admin"
ADMIN_PASSWORD="kunal"
SECOND_ADMIN_EMAIL=""
SECOND_ADMIN_PASSWORD=""
APP_URL="http://localhost:3000"
COINDCX_BASE_URL="https://api.coindcx.com"
COINDCX_WS_URL="https://stream.coindcx.com"
COINDCX_WS_PRICE_CHANNEL="currentPrices@futures@rt"
```

> The database layer reads `MONGODB_URI` and `DB_NAME`; the live execution gate is
> enforced by runtime state and the UI/API toggle, which stores a boolean value.

## Admin login flow

The app bootstraps admin users from environment variables.

Default values are:

```env
ADMIN_EMAIL="admin"
ADMIN_PASSWORD="kunal"
```

The frontend protects routes until the user is authenticated. After login, the session stores the user ID and that user is used to select the correct engine instance and credential store.

## Paper mode operation

Open the app and create a strategy. In paper mode, the bot still runs the same decision pipeline, reads candles, evaluates the strategy, and simulates fills, but it never submits an actual order to CoinDCX.

## Preflight validation before live mode

Before enabling live orders, validate the API credentials against the real CoinDCX account:

```bash
curl -X POST http://127.0.0.1:8001/api/bot/credentials/validate
```

This route checks that the key pair is usable and the futures wallet is readable. A successful response includes values such as:

```json
{
  "configured": true,
  "live_ready": true,
  "wallet_balance_inr": 50000,
  "active_instruments_count": 50,
  "open_positions_count": 0,
  "usdt_inr_rate": 84.5,
  "message": "Credentials validated successfully against CoinDCX INR account balance."
}
```

If validation fails, fix the issue before toggling live mode.

## Enable live trading safely

Use the app UI or the API route:

```bash
curl -X POST http://127.0.0.1:8001/api/bot/credentials/live \
  -H "Content-Type: application/json" \
  -d '{"on": true}'
```

The backend requires:

- non-empty API credentials
- successful `validate_live_credentials()` call
- a boolean live flag set to `true` via the runtime toggle

The app can switch back to paper mode by sending `{"on": false}` or by clearing credentials.

## Real execution path

The actual execution happens inside the backend Python runtime, not through a public order route in the frontend.

Flow:

1. Strategy is created and stored in MongoDB.
2. `bot_engine` schedules the strategy in the configured timeframe window.
3. Signal detection reads the last closed candle and the selected strategy rule.
4. Quantity is calculated from capital, leverage, and CoinDCX instrument metadata.
5. The backend validates INR wallet balance and live-trading status.
6. A signed CoinDCX futures order is created only when live mode is enabled.
7. The position is monitored and TP/SL is attached if enabled.

## Live order contract

The backend uses the INR-margin futures book and includes the required `margin_currency_short_name` field.

### Market order example

```json
{
  "order": {
    "side": "sell",
    "pair": "B-BTC_USDT",
    "order_type": "market_order",
    "total_quantity": 0.02,
    "leverage": 10,
    "notification": "no_notification",
    "time_in_force": "good_till_cancel",
    "hidden": false,
    "post_only": false,
    "margin_currency_short_name": "INR"
  }
}
```

### Take-profit / stop-loss example

```json
{
  "id": "position_123",
  "take_profit": {
    "stop_price": 81000.0,
    "order_type": "take_profit_market"
  },
  "stop_loss": {
    "stop_price": 76000.0,
    "order_type": "stop_market"
  }
}
```

## Important live-money notes

- The pair name alone is not enough; the correct wallet is selected by `margin_currency_short_name = "INR"`.
- Real orders are never created just because a strategy exists.
- Real orders are blocked unless live mode is explicitly enabled.
- The bot may reject or skip a trade if free INR margin is insufficient.
- Paper mode is the safe default until validation passes.

## Emergency stop

Use any of the following immediately:

- stop the bot from the frontend
- send `{"on": false}` to `/api/bot/credentials/live`
- clear credentials via the UI/API
- close positions manually on CoinDCX if needed

Stopping the bot or disabling live mode only prevents new execution. Immediately
check `/api/bot/positions` and the CoinDCX positions page/API. If an order times out,
position ID cannot be resolved, TP/SL attachment fails, or an exit fails, do not retry
blindly: reconcile the exchange state first and keep the case in manual intervention
until the position is confirmed closed or protected.

## Operational checks while trading

```bash
curl http://127.0.0.1:8001/api/bot/state
curl http://127.0.0.1:8001/api/bot/positions
curl http://127.0.0.1:8001/api/bot/logs
```

These endpoints are the operational monitor while trading.

## Daily checklist

- [ ] Check live logs for errors
- [ ] Confirm strategies are firing at the expected timeframe
- [ ] Review P&L and trade history
- [ ] Verify capital allocation stays within the set limits
- [ ] Check that position sizing matches the intended risk

## Security best practices

- [ ] Store CoinDCX API keys only through the credentials UI/API; never put them in
  `backend/.env` or commit them to git
- [ ] Keep CoinDCX IP whitelisting enabled
- [ ] Enable 2FA on the exchange account
- [ ] Rotate keys periodically
- [ ] Use a dedicated, trusted internet source for live trading
- [ ] Keep a recovery plan ready for emergency shutdown

## Troubleshooting

| Problem | Likely cause | Action |
| --- | --- | --- |
| `401 Unauthorized` | bad API key or secret | re-check credentials and wallet access |
| `400 Bad Request` | invalid payload or trade parameters | revalidate the strategy and order values |
| no live fills | insufficient free INR margin | check account balance and open positions |
| WebSocket disconnect | backend restart or network blip | reconnect automatically; review logs |
| bot stays in paper mode | credentials missing or live flag off | save keys and enable live mode |

## Final checklist before real money

- [ ] MongoDB is running
- [ ] Backend tests pass: `cd backend && pytest -q`
- [ ] `backend/.env` contains valid real credentials
- [ ] `POST /api/bot/credentials/validate` succeeds
- [ ] Live toggle is enabled only after validation
- [ ] Strategy risk is deliberately small for the first live run
- [ ] You can manually close positions on CoinDCX if needed
- [ ] The bot is monitored continuously during the first live period

This bot is designed to be safe by default: without valid credentials and an explicit live toggle, the app remains in paper mode.
✅ TP/SL attachment working correctly
✅ All tests passing (28/28)
✅ Paper mode verified
✅ Real money configuration ready

**Happy trading! 🚀**

---

## 📚 Documentation

- Full setup guide: [SETUP_GUIDE.txt](SETUP_GUIDE.txt)
- Production guide: [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Strategy docs: [docs/EDIT_STRATEGY.md](docs/EDIT_STRATEGY.md)

