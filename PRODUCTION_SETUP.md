# Production Setup

## Production checklist

Before any live money is used, make sure all of these are true:

- the app has been tested in paper mode
- the CoinDCX credentials are valid
- the futures wallet has usable INR balance
- the strategy parameters are intentionally small for the first live run
- the live trading toggle is kept off until validation is complete
- there is a clear emergency-stop procedure

## Required environment variables

The repository does not include an `.env.example` file. Create `backend/.env`
manually with the values below, then keep the resulting file local and untracked.

```env
MONGODB_URI="mongodb://127.0.0.1:27017"
DB_NAME="scalping"
ADMIN_EMAIL="admin"
ADMIN_PASSWORD="kunal"
SECOND_ADMIN_EMAIL=""
SECOND_ADMIN_PASSWORD=""
SESSION_SECRET="use-a-long-random-production-secret"
CREDENTIAL_ENCRYPTION_KEY="generate-a-fernet-key-and-store-it-as-a-secret"
APP_URL="http://localhost:3000"
COINDCX_BASE_URL="https://api.coindcx.com"
COINDCX_WS_URL="https://stream.coindcx.com"
COINDCX_WS_PRICE_CHANNEL="currentPrices@futures@rt"
```

> Keep this file local. Do not commit it to git. CoinDCX API keys are never environment variables: add them through the API Keys UI, where they are encrypted and stored per user in MongoDB.

Generate the encryption key once and store the same value in local `.env` and the deployment secret manager:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Do not rotate `CREDENTIAL_ENCRYPTION_KEY` unless all stored credentials have been re-encrypted first; the old key is required to decrypt existing settings.

## Install and run locally

### Backend

```bash
cd /workspaces/codespaces-blank/Tinnu_Services_V3/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn server:app --host 0.0.0.0 --port 8001
```

### Frontend

```bash
cd /workspaces/codespaces-blank/Tinnu_Services_V3/frontend
npm install
npm run dev -- --host 0.0.0.0 --port 3000
```

## Preflight validation

Before any live order is enabled, validate the credentials:

```bash
curl -X POST http://127.0.0.1:8001/api/bot/credentials/validate
```

This is the real preflight check. It verifies that the keys can read the CoinDCX futures wallet and that the account is usable for live trading.

## Production activation

Only after the validation succeeds and the bot has proven stable in paper mode should you enable live execution.

Use the app UI or call the route:

```bash
curl -X POST http://127.0.0.1:8001/api/bot/credentials/live \
  -H "Content-Type: application/json" \
  -d '{"on": true}'
```

The live toggle is the last gate. The bot will stay in paper mode if either credentials are missing or the live flag is off.

## Safety rules

- the order path is gated by valid credentials and the explicit live toggle
- trade sizing uses the actual wallet balance and strategy inputs
- the engine skips trades when the free INR margin is not sufficient
- pair validation is required for the INR margin book
- use an explicit `CORS_ORIGINS` frontend allowlist; do not use `*` with
  credentialed sessions
- all real-money execution should start with very small capital

## Operational endpoints

- `GET /api/bot/state` — bot mode and engine state
- `GET /api/bot/positions` — live and pending positions
- `GET /api/bot/logs` — execution and error logs
- `POST /api/bot/credentials/live` — enable or disable live execution
- `POST /api/bot/credentials/validate` — validate keys before going live

## Emergency stop

If the bot behaves incorrectly, stop it immediately using one of these actions:

- disable the bot in the UI
- send `{"on": false}` to `/api/bot/credentials/live`
- clear the stored credentials
- close positions manually on CoinDCX

After stopping the bot, query `/api/bot/positions` and the CoinDCX account directly.
Disabling the bot or live toggle does not prove that an exchange position is closed.
For any failed order, position lookup, TP/SL attachment, or exit, stop retries until
the exchange state has been reconciled and document any position requiring manual
intervention.

## Production advice

- run the bot with a small initial capital allocation
- monitor logs and positions continuously during the first live period
- prefer paper mode until the strategy has proven stable over a meaningful period
- keep the app and environment ready for manual intervention at all times

## Security checklist

- [ ] `backend/.env` is not committed to git
- [ ] CoinDCX IP whitelisting is enabled
- [ ] 2FA is enabled on the exchange account
- [ ] API keys are rotated on a routine schedule
- [ ] There is a documented emergency-stop procedure
- [ ] Strategic risk parameters remain conservative at launch
- [ ] `SESSION_SECRET` is configured with a long random value
- [ ] `CREDENTIAL_ENCRYPTION_KEY` is configured and backed up securely

## Common operational issues

| Problem | Action |
| --- | --- |
| `401 Unauthorized` | re-check the API key and secret |
| `400 Bad Request` | verify strategy and order parameters |
| live trades skipped | check wallet balance and pair availability |
| backend disconnect | verify MongoDB and the local backend process |
| bot remains in paper mode | save keys and enable the live toggle |

## Final pre-launch checklist

- [ ] MongoDB is running
- [ ] `cd backend && pytest -q` succeeds
- [ ] Mongo runtime credentials are configured and validated
- [ ] `/api/bot/credentials/validate` returns success
- [ ] live mode is enabled only after preflight validation
- [ ] the strategy is conservative for the first live run
- [ ] the user can manually stop or exit all positions
- [ ] logs are being actively monitored

This repository is intentionally safe by default: unless valid credentials are loaded and the live toggle is turned on, the engine stays in paper mode.
