# How to edit a strategy properly

The current app is built on a dynamic strategy model. The engine does not own a
package of hardcoded strategy branches; each strategy owns its own runtime config
and selection logic in its strategy module, while the registry exposes the public
metadata used by the UI and engine.

## 1. Strategy files and the registry
The real strategy code lives in:

- `backend/strategies/Strategy2.py`
- `backend/strategies/Strategy3.py`
- `backend/strategies/Strategy4.py`
- `backend/strategies/registry.py`

If you want to add or edit a strategy, update the corresponding module and then
register it in `STRATEGY_REGISTRY` in `registry.py`.

The current registry contains three strategy classes:

| Class | Rule set | Selection mode |
|---|---|---|
| `Strategy2` | `top4_5m_reversal_short` | top-four reversal |
| `Strategy3` | `highest_mover_sell` | highest positive mover |
| `Strategy4` | `Strategy4` | reversal-compatible extension |

## 2. Runtime values stay with the strategy, not the engine
Each strategy module owns its own runtime settings, for example:

```python
WINDOW_START = dtime(5, 30)
WINDOW_END = dtime(3, 40)
TF_MINUTES = {"5m": 5, "15m": 15, "1h": 60, "4h": 240}
ORDER_WINDOW = {"5m": 60, "15m": 120, "1h": 300, "4h": 300}
TRIGGER_TF = {"5m": "1m", "15m": "1m", "1h": "1m"}
PRESCAN_LEAD = 60
TICK_SECONDS = 2.0
MAX_LOGS = 400
MAX_TRADE_HISTORY = 400
```

The engine reads these values via `get_strategy_runtime_config()` and related
helpers. It should not keep a duplicate set of strategy-specific defaults in its
own file.

## 3. Strategy logic stays separate and mode-based
Each strategy declares a `selection_mode` and a `rule_set`, for example:

```python
selection_mode = "reversal"
rule_set = "top4_5m_reversal_short"
```

The engine chooses the decision path from `get_strategy_mode()`, not from a
hardcoded `if rule_set == ...` block in the scheduler.

## 4. The UI is template-driven
The frontend reads the templates exported from the registry model and renders
that list in `frontend/src/components/bot/AddStrategyDialog.tsx`. This avoids
hardcoded strategy buttons or special cases for one strategy name.

## 5. How to add a new strategy
1. Create a new strategy module under `backend/strategies/`.
2. Define a strategy class plus `RULE_SET`, `selection_mode`, and runtime constants in that file.
3. Add the class to `STRATEGY_REGISTRY` in `backend/strategies/registry.py`.
4. Add a template entry or metadata builder so the frontend can render it.
5. Re-run the backend syntax/tests and frontend typecheck.

## 6. Class-oriented backend services

Shared configuration and credential state are owned by `ConfigService` and
`CredentialsService`. Compatibility adapters remain at module level so existing
routers and integrations keep their imports. `BotEngine` owns per-user scheduling
and execution state, while `MarketStore` owns the shared market stream. Keep new
mutable state on these service instances instead of adding process-wide globals.

## Where each other piece lives
| Concern | File |
|---|---|
| Strategy registry and templates | `backend/strategies/registry.py` |
| Strategy execution logic | `backend/strategies/*.py` |
| Engine scheduling and order lifecycle | `backend/lib/bot_engine.py` |
| Signed CoinDCX calls (orders, cancel, positions, wallet) | `backend/lib/coindcx_trade.py` |
| API keys + live switch (DB-backed) | `backend/lib/credentials.py` |
| Candle fetching / cache / 2h synthesis | `backend/lib/candles.py` |
| Live price feed the bot reads | `backend/lib/market_store.py` |
| HTTP + WebSocket endpoints | `backend/routers/bot.py` |
| Strategy fields and validation | `backend/models/bot.py` |
| Frontend type contracts | `frontend/src/lib/botTypes.ts` |

## Safe way to test a change
1. Keep live trading OFF in paper mode.
2. Create one strategy from the registry templates.
3. Observe the log flow and strategy status to confirm the selected module is being used.
4. Only then switch to live with reduced risk.

## Rule of thumb
If a value affects a specific strategy, it belongs in that strategy module. If a
value affects all strategies, it belongs in a shared helper or registry function.
The engine should orchestrate, not hardcode strategy rules.
