# CoinDCX-style Live Crypto Futures Dashboard

## What it does
Single-page dark trading terminal for CoinDCX USDT perpetual futures.
- **Left panel**: scrolling table of all active USDT futures instruments — symbol,
  max leverage, last price, 24h change %, 24h high/low, volume. Search by symbol,
  filter chips (All / Leverage > 20x / Gainers / Losers), sortable columns,
  green/red flash on each price tick. Renders the top 200 rows of the current
  sort/filter (of ~700) for frame-rate reasons.
- **Right panel**: top 4 instruments by 24h change %, each box showing live
  OHLC (Open, High, Low, Close), rank badge, sparkline, volume and funding rate.
  Re-ranked on every incoming frame (~1s). Each box also draws a **candlestick chart**
  with a per-box timeframe selector (1m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1w, 1M);
  the chosen timeframe is held per box slot in `Dashboard.tsx`, so it survives a
  live re-rank. Candles refresh every 10s.
- **Footer**: "Scanning live from CoinDCX" with a pulsing beacon and stream clock.

## Data flow
- Backend background task (`backend/lib/market_store.py`) polls CoinDCX's realtime
  futures price stream `https://public.coindcx.com/market_data/v3/current_prices/futures/rt`
  every 1s, and the active-instruments list
  `.../derivatives/futures/data/active_instruments?margin_currency_short_name[]=USDT`.
- Max leverage per pair comes from `.../data/instrument?pair=<pair>&margin_currency_short_name=USDT`
  (one call per pair, 150 pairs per 20s cycle, cached in Mongo `instrument_meta`),
  taken from `max_leverage_long` or the highest key of `dynamic_position_leverage_details`.
- 24h open is derived from last price and the published 24h change %.
- Frames are fanned out to browsers over the app's own WebSocket `GET /api/ws`
  (Vite proxies it with `ws: true`). No page reloads.

## API (all on api_router, prefix /api)
- `GET /api/market/snapshot` → `Snapshot` { ts, count, connected, source, instruments[], top[] }
- `GET /api/market/instrument/{pair}` → `Ticker` (404 if unknown)
- `GET /api/market/candles/{pair}?resolution=5m&limit=60` → `CandleSeries`
  (400 on an unsupported resolution, 404 on an unknown pair). Backed by
  `https://public.coindcx.com/market_data/candlesticks` with an 8s in-process cache;
  CoinDCX serves no native 2h series, so 2h is synthesised by merging 1h candles.
- `WS  /api/ws` → pushes a `Snapshot` JSON frame every second

## Models
`backend/models/market.py` (`Ticker`, `Snapshot`) ↔ `frontend/src/lib/types.ts`.

## Auth
The dashboard uses an admin session. The frontend calls `/api/login`, the backend
stores the authenticated user ID in an HTTP session cookie, and private bot routes
select that user's engine, strategies, logs, trades, and credentials.

## Page 2 — `/bot` Bot Control Center
Short-only strategy bot driven by the same live feed.

- **Header**: BOT ON/OFF (global kill switch), Add Strategy, Delete Strategy,
  execution-mode badge (PAPER / LIVE ORDERS), stream badge, link back to the scanner.
  There is NO force-run/manual-trigger control — trades only happen at real hourly slots.
- **Left**: strategy cards — status (Idle / Stopped / Waiting / Scanning / Confirming /
  Running / Error), per-strategy ARMED toggle, coin-pick mode, leverage, TP, capital cap,
  trades today, next slot, open position.
- **Right**: live log console (info / signal / trade / error) streamed over WebSocket.
- Footer: "Scanning live from CoinDCX".

### Strategy logic (short + long, limit entry)
1. Clock: IST (Asia/Kolkata). Window 05:30 → 03:40 next day. **Slots are the chosen
   timeframe's candle boundaries** (`5m` → :00/:05/:10…, `15m` → :00/:15/:30/:45,
   `1h` → on the hour, `4h` → 00/04/08/12/16/20). Starting mid-slot waits for the next one.
2. 60s before the slot: scan the top 4 from the live scanner — biggest 24h **losers** or
   **gainers**, per the strategy's `coin_pick` setting.
3. At the slot: read the just-closed candle on the strategy's timeframe for each candidate.
   **GREEN → BUY, RED → SELL**, flat candle → skip. Of the candidates with a clear candle,
   the strongest **absolute** 24h mover is traded (`_select`).
4. Entry: **LIMIT order at that candle's closing price** (`_place`). No 1-minute
   confirmation step any more.
5. TP/SL from the entry and side (`tp_sl_for`): long → TP `entry×(1+tp)`, SL `entry×(1−sl)`;
   short → mirrored. Defaults TP 0.5%, SL 5%, both editable per strategy.
6. Fill window (`ORDER_WINDOW`): 5m → 60s, 15m → 120s, 1h/4h → 300s. Filled → position
   goes live and TP/SL are attached; not filled → order cancelled, trade row marked
   `cancelled`, strategy waits for the next slot (`_await_fill`).
7. Exit: `_monitor` checks the live price every 2s and closes on TP or SL, writing
   `pnl_pct` and `pnl_inr`.
8. Capital: `min(strategy cap, ₹40,000, free INR margin)` fully used per trade;
   leverage 10x or the pair's max if lower. One coin at a time per strategy, max 5
   trades per IST day, multiple strategies run concurrently.

### CoinDCX signed-API contract (verified against the live route behavior)
A wrong route returns `404 not_found` **before** auth; a right route with bad keys returns
`401 Invalid credentials`. The live contract used by this app is:

| Purpose | Verified route |
|---|---|
| Create order (limit + market) | `POST /exchange/v1/derivatives/futures/orders/create` |
| Order status by id | `POST /exchange/v1/derivatives/futures/orders` with `{"id": …}` |
| Cancel order | `POST /exchange/v1/derivatives/futures/orders/cancel` |
| Positions list | `POST /exchange/v1/derivatives/futures/positions` |
| Exit position | `POST /exchange/v1/derivatives/futures/positions/exit` |
| TP/SL on a position | `POST /exchange/v1/derivatives/futures/positions/create_tpsl` with nested `take_profit` / `stop_loss` objects |
| Change leverage | `POST /exchange/v1/derivatives/futures/positions/update_leverage` |
| Futures wallet balance | `GET /exchange/v1/derivatives/futures/wallets` with a signed JSON body |

Important implementation details:
- `timestamp` is **milliseconds** (`int(time.time()*1000)`), generated immediately before signing.
- The order payload must be wrapped as `{"order": {...}}`.
- The futures enums are `market_order` and `limit_order` for the inner `order_type` field.
- TP/SL uses nested objects such as `{"take_profit": {"stop_price": ..., "order_type": "take_profit_market"}}`.
- `active_instruments?margin_currency_short_name[]=INR` is not the source of truth for margin tradability; the app checks `instrument?pair=…&margin_currency_short_name=INR` per pair and skips any pair that is not available in INR margin.
- The free margin read is `GET /exchange/v1/derivatives/futures/wallets` and prefers `available_balance` when CoinDCX exposes it; this avoids false `Insufficient funds` rejections caused by reading a stale or locked balance.

### Credentials (DB-backed, editable from the UI)
`backend/lib/credentials.py` exposes `CredentialsService`, which stores the CoinDCX
key/secret and live switch in Mongo (`settings`, `_id="coindcx:<user_id>"`), falling
back to environment variables when the DB is empty. The UI panel is `ApiKeysDialog`
(header → **API Keys**): save keys, switch PAPER/LIVE, or delete keys. Secrets are
only ever returned masked. Live orders require configured credentials, the live switch,
BOT ON, and an armed strategy.

Configuration is owned by `ConfigService` in `backend/lib/config.py`. The safe local
template is `backend/.env.example`; `backend/.env` is ignored and must never be
committed.

## Page 4 — `/position` Live Position Monitor
Full-screen monitor for pending orders and open positions: candles for the traded pair on
the strategy's timeframe with **entry / TP / SL / last-price lines drawn**, side and state
badges (ORDER PENDING with its deadline, or POSITION LIVE), entry, last, TP, SL, live P&L
(% on margin and ₹), distance to TP and capital. Polls `GET /api/bot/positions` every 2s.

## Docs for the operator
- `docs/EDIT_STRATEGY.md` — exactly which functions to edit for timing, coin choice,
  entry rule, TP/SL and sizing; how to test safely in PAPER on the 5m timeframe.
- `docs/DEPLOY_DIGITALOCEAN.md` — droplet setup, supervisor (single worker!), nginx with
  WebSocket upgrade headers, HTTPS, and day-2 operations.

### Bot API (all under /api)
`GET /bot/state`, `POST /bot/toggle`, `GET/POST /bot/strategies`,
`DELETE /bot/strategies/{sid}`, `POST /bot/strategies/{sid}/enabled`,
`GET /bot/logs`, `GET /bot/trades`, `GET /bot/positions`,
`GET/POST/DELETE /bot/credentials`, `POST /bot/credentials/live`,
`GET /bot/history/today`, `GET /bot/history/daily?days=N`, `WS /bot/ws`.

## Page 3 — `/history` Trade History
Calendar heat map of two months (green = profitable day, red = losing day, grey = no
trades; prev/next arrows), plus Date, Today P&L (₹), Running trade `NN/NN`, and a
Target box that turns green when today's realised P&L reaches the daily target
(`daily_target_inr`, default ₹25,000, set per strategy — the page uses the highest).
Today's trades table lists each trade with pair, timeframe, ₹ P&L and TP hit / SL hit /
Running. Footer carries the live IST clock (UTC+5:30) and the scanning beacon.
`pnl_inr` = capital × price move × leverage, stored when a position closes.

### WebSocket shutdown contract (important)
uvicorn closes connections and only then waits for handler tasks, so a handler parked on
an idle queue wedges the whole server on reload (it stops answering every request).
`backend/lib/wsutil.py` bounds every wait: each idle second the handler sends
`{"type":"ping"}`. Frontend stream hooks must ignore frames that are not real payloads —
`useMarketStream` checks for `instruments`, `useBotStream` switches on `type`.
Models: `backend/models/bot.py` ↔ `frontend/src/lib/botTypes.ts`.
Collections: `strategies`, `bot_logs`, `trades`.

### Execution mode / safety
Real orders require both an enabled live-trading toggle (`true`) and valid API keys in
`backend/.env`, plus BOT ON and an armed strategy. Otherwise every fill is simulated
(PAPER) with identical logging. See `memory/test_credentials.md`.

### Deliberate deviations from the written spec
- FastAPI + React (not Flask + Jinja2) and MongoDB (not SQLite) — the pod's stack.
- Scheduler is an asyncio loop in-process, not APScheduler/Celery — no extra dependency.
- CoinDCX 1h candles are hour-aligned (:00), so the engine reads the last fully closed
  1h candle at the selected slot time.
- Signals are read from the USDT chart (the series the scanner ranks on); execution
  uses INR margin on that same pair.
