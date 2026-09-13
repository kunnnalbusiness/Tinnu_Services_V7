from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from lib.bot_engine import get_engine
from lib.clock import now_ist
from lib.db import db
from lib import credentials as creds
from lib import wsutil
from lib import coindcx_trade as trade
from lib.historical_test import run_historical_test
from strategies.registry import get_strategy_templates
from models.bot import (
    BotState,
    CredentialStatus,
    CredentialUpdate,
    CredentialValidation,
    DayPnl,
    LivePosition,
    LogEntry,
    Strategy,
    StrategyCreate,
    StrategyUpdate,
    TodaySummary,
    ToggleRequest,
    Trade,
)

router = APIRouter(prefix="/bot", tags=["bot"])
logger = logging.getLogger(__name__)
def session_user_id(request: Request) -> str:
    user_id = str(request.session.get("user_id") or "").strip().lower()
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id


def validate_strategy_update(existing: Strategy, changes: dict[str, object]) -> None:
    values = existing.model_dump()
    values.update(changes)
    try:
        Strategy(**values)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


async def user_engine(request: Request):
    user_id = session_user_id(request)
    from lib import credentials as user_credentials
    user_credentials.set_user(user_id)
    selected = get_engine(user_id)
    if not selected.loaded:
        await selected.load()
    return selected


class HistoricalTestRequest(BaseModel):
    strategy_id: str
    target_time: datetime


@router.post("/historical-test")
async def historical_test(body: HistoricalTestRequest, request: Request) -> dict[str, object]:
    selected = await user_engine(request)
    strategy = selected.strategies.get(body.strategy_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail="strategy not found")
    try:
        return await run_historical_test(strategy, body.target_time)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"historical data test failed: {exc}") from exc


@router.get("/state", response_model=BotState)
async def get_state(request: Request) -> BotState:
    return (await user_engine(request)).state()


@router.post("/toggle", response_model=BotState)
async def toggle_bot(body: ToggleRequest, request: Request) -> BotState:
    selected = await user_engine(request)
    await selected.set_bot(body.on)
    return selected.state()


@router.get("/strategies", response_model=list[Strategy])
async def list_strategies(request: Request) -> list[Strategy]:
    return list((await user_engine(request)).strategies.values())


@router.get("/strategies/templates")
async def strategy_templates() -> list[dict[str, object]]:
    return get_strategy_templates()


@router.post("/strategies", response_model=Strategy, status_code=201)
async def create_strategy(body: StrategyCreate, request: Request) -> Strategy:
    selected = await user_engine(request)
    strategy = Strategy(
        **body.model_dump(),
        owner_id=session_user_id(request),
        created_at=now_ist().isoformat(timespec="seconds"),
    )
    return await selected.add(strategy)


@router.delete("/strategies/{sid}", status_code=204, response_class=Response)
async def delete_strategy(sid: str, request: Request) -> Response:
    if not await (await user_engine(request)).remove(sid):
        raise HTTPException(status_code=404, detail="strategy not found")
    return Response(status_code=204)


@router.put("/strategies/{sid}", response_model=Strategy)
async def update_strategy(sid: str, body: StrategyUpdate, request: Request) -> Strategy:
    selected = await user_engine(request)
    existing = selected.strategies.get(sid)
    if existing is None:
        raise HTTPException(status_code=404, detail="strategy not found")
    changes = body.model_dump(exclude_unset=True)
    validate_strategy_update(existing, changes)
    strategy = await selected.update(sid, changes)
    if strategy is None:
        raise HTTPException(status_code=404, detail="strategy not found")
    return strategy


@router.post("/strategies/{sid}/enabled", response_model=Strategy)
async def set_enabled(sid: str, body: ToggleRequest, request: Request) -> Strategy:
    strategy = await (await user_engine(request)).set_enabled(sid, body.on)
    if strategy is None:
        raise HTTPException(status_code=404, detail="strategy not found")
    return strategy


@router.get("/logs", response_model=list[LogEntry])
async def get_logs(request: Request, limit: int = Query(200, ge=1, le=1000)) -> list[LogEntry]:
    selected = await user_engine(request)
    try:
        docs = await db.bot_logs.find({"owner_id": selected.owner_id}).sort("ts", -1).to_list(limit)
        logs: list[LogEntry] = []
        for doc in reversed(docs):
            doc.pop("_id", None)
            try:
                logs.append(LogEntry(**doc))
            except Exception:
                continue
        return logs
    except Exception as exc:
        logger.warning("bot log history unavailable; using in-memory logs: %s", exc)
        return selected.logs[-limit:]


# @router.delete("/logs", status_code=204)
# async def clear_logs(request: Request) -> None:
#     selected = await user_engine(request)
#     await db.bot_logs.delete_many({"owner_id": selected.owner_id})
#     selected.logs.clear()
#     selected._push({"type": "logs", "logs": []})
@router.delete("/logs", status_code=204, response_class=Response)
async def clear_logs(request: Request) -> Response:
    selected = await user_engine(request)
    await db.bot_logs.delete_many({"owner_id": selected.owner_id})
    selected.logs.clear()
    selected._push({"type": "logs", "logs": []})
    return Response(status_code=204)

@router.get("/trades", response_model=list[Trade])
async def get_trades(
    request: Request,
    limit: int = Query(50, ge=1, le=500),
    date: str | None = None,
    timezone: str = "Asia/Kolkata",
    strategy_id: str | None = None,
    cycle_group_id: str | None = None,
) -> list[Trade]:
    selected = await user_engine(request)
    query: dict[str, object] = {"owner_id": selected.owner_id}
    requested_day = None
    requested_zone = ZoneInfo("Asia/Kolkata")
    if date:
        try:
            requested_zone = ZoneInfo(timezone)
            requested_day = datetime.fromisoformat(date).date()
        except (ValueError, ZoneInfoNotFoundError) as exc:
            raise HTTPException(status_code=422, detail="date and timezone must be valid") from exc
    if strategy_id:
        query["strategy_id"] = strategy_id
    if cycle_group_id:
        query["cycle_group_id"] = cycle_group_id
    docs = await db.trades.find(query).sort("cycle_number", 1).to_list(500 if requested_day else limit)
    if requested_day:
        filtered_docs = []
        for document in docs:
            try:
                opened = datetime.fromisoformat(str(document.get("opened_at", ""))).astimezone(requested_zone)
            except ValueError:
                continue
            if opened.date() == requested_day:
                filtered_docs.append(document)
        docs = filtered_docs[:limit]
    trades: list[Trade] = []
    for doc in docs:
        doc.pop("_id", None)
        try:
            trades.append(Trade(**doc))
        except Exception as exc:
            logger.warning("invalid trade document skipped: %s", exc)
    return trades


@router.get("/credentials", response_model=CredentialStatus)
async def get_credentials(request: Request) -> CredentialStatus:
    await user_engine(request)
    await creds.ensure_loaded()
    return CredentialStatus(**creds.status())


@router.post("/credentials", response_model=CredentialStatus)
async def set_credentials(body: CredentialUpdate, request: Request) -> CredentialStatus:
    selected = await user_engine(request)
    try:
        await creds.save(body.api_key, body.api_secret)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=f"Credential encryption error: {exc}") from exc
    selected.log("info", "CoinDCX API credentials saved securely (live trading still needs confirmation).")
    selected._push_state()
    return CredentialStatus(**creds.status())


@router.delete("/credentials", response_model=CredentialStatus)
async def delete_credentials(request: Request) -> CredentialStatus:
    selected = await user_engine(request)
    await creds.clear()
    selected.log("info", "CoinDCX API credentials removed — back to PAPER mode.")
    selected._push_state()
    return CredentialStatus(**creds.status())


@router.post("/credentials/validate", response_model=CredentialValidation)
async def validate_credentials(request: Request, body: dict[str, str] | None = None) -> CredentialValidation:
    await user_engine(request)
    await creds.ensure_loaded()
    previous_key, previous_secret = creds.credentials()
    submitted_key = ""
    submitted_secret = ""

    if body:
        submitted_key = str(body.get("api_key", "")).strip()
        submitted_secret = str(body.get("api_secret", "")).strip()

    if submitted_key or submitted_secret:
        if not submitted_key or not submitted_secret:
            raise HTTPException(status_code=400, detail="add API key and secret before validating live trading")
        try:
            submitted = CredentialUpdate(api_key=submitted_key, api_secret=submitted_secret)
        except Exception as exc:
            raise HTTPException(status_code=422, detail="API key and secret must each contain at least 8 non-space characters") from exc
        submitted_key, submitted_secret = submitted.api_key, submitted.api_secret
        creds.set_runtime(submitted_key, submitted_secret)
    elif not creds.configured():
        raise HTTPException(status_code=400, detail="add API key and secret before validating live trading")

    try:
        info = await trade.validate_live_credentials()
        return CredentialValidation(**info)
    except trade.CoinDcxError as exc:
        raise HTTPException(status_code=400, detail=f"Credential validation failed: {exc}") from exc
    except Exception as exc:
        logger.exception("unexpected credential validation failure")
        raise HTTPException(status_code=502, detail="CoinDCX validation service is temporarily unavailable") from exc
    finally:
        if submitted_key or submitted_secret:
            creds.set_runtime(previous_key, previous_secret)


@router.post("/credentials/live", response_model=CredentialStatus)
async def set_live_trading(body: ToggleRequest, request: Request) -> CredentialStatus:
    selected = await user_engine(request)
    await creds.ensure_loaded()
    if body.on and not creds.configured():
        raise HTTPException(status_code=400, detail="add API key and secret before enabling live trading")
    if body.on:
        try:
            await trade.validate_live_credentials()
        except trade.CoinDcxError as exc:
            raise HTTPException(status_code=400, detail=f"Live trading confirmation failed: {exc}") from exc
        except Exception as exc:
            logger.exception("unexpected live trading validation failure")
            raise HTTPException(status_code=502, detail="CoinDCX validation service is temporarily unavailable") from exc
    await creds.set_live(body.on)
    selected.log(
        "info",
        f"Execution mode switched to {'LIVE ORDERS — real money at risk' if creds.live_enabled() else 'PAPER'}.",
    )
    selected._push_state()
    return CredentialStatus(**creds.status())


@router.get("/positions", response_model=list[LivePosition])
async def get_positions(request: Request) -> list[LivePosition]:
    return (await user_engine(request)).positions()


@router.get("/trade-api-audit")
async def get_trade_api_audit(
    request: Request,
    limit: int = Query(100, ge=1, le=500),
) -> list[dict[str, object]]:
    """Return sanitized CoinDCX request/response audit records for the current user."""
    selected = await user_engine(request)
    docs = await db.trade_api_audit.find(
        {"owner_id": selected.owner_id}
    ).sort("created_at", -1).to_list(limit)
    result: list[dict[str, object]] = []
    for doc in docs:
        doc.pop("_id", None)
        result.append(doc)
    return result


@router.get("/history/today", response_model=TodaySummary)
async def today_summary(request: Request) -> TodaySummary:
    selected = await user_engine(request)
    now = now_ist()
    today = now.date().isoformat()
    docs = await db.trades.find({"owner_id": selected.owner_id, "opened_at": {"$regex": f"^{today}"}}).sort("opened_at", 1).to_list(200)
    trades: list[Trade] = []
    for doc in docs:
        doc.pop("_id", None)
        trades.append(Trade(**doc))
    pnl = sum((t.partial_booked_pnl_inr or 0.0) + (t.pnl_inr or 0.0) for t in trades)
    target = max((s.daily_target_inr for s in selected.strategies.values()), default=25000.0)
    max_trades = max((s.max_trades_per_day for s in selected.strategies.values()), default=5)
    return TodaySummary(
        date=today,
        server_time_ist=now.isoformat(timespec="seconds"),
        pnl_inr=pnl,
        target_inr=target,
        target_achieved=target > 0 and pnl >= target,
        trades_done=len([t for t in trades if t.status != "open"]),
        max_trades=max_trades,
        open_trades=len([t for t in trades if t.status == "open"]),
        trades=trades,
    )


@router.get("/history/daily", response_model=list[DayPnl])
async def daily_history(request: Request, days: int = Query(120, ge=1, le=400)) -> list[DayPnl]:
    """Per-day realised P&L, newest last — drives the calendar heat map."""
    since = (now_ist() - timedelta(days=days)).date().isoformat()
    selected = await user_engine(request)
    docs = await db.trades.find({"owner_id": selected.owner_id, "opened_at": {"$gte": since}}).to_list(5000)
    buckets: dict[str, DayPnl] = {}
    for doc in docs:
        day = str(doc.get("opened_at", ""))[:10]
        if not day:
            continue
        bucket = buckets.setdefault(day, DayPnl(date=day, pnl_inr=0, trades=0, wins=0, losses=0))
        bucket.trades += 1
        pnl = (doc.get("partial_booked_pnl_inr") or 0.0) + (doc.get("pnl_inr") or 0.0)
        bucket.pnl_inr += float(pnl)
        if float(pnl) >= 0:
            bucket.wins += 1
        else:
            bucket.losses += 1
    return [buckets[key] for key in sorted(buckets)]


@router.websocket("/ws")
async def bot_ws(websocket: WebSocket) -> None:
    owner_id = str(websocket.session.get("user_id") or "").strip().lower()
    if not owner_id:
        await websocket.close(code=1008, reason="Not authenticated")
        return
    await websocket.accept()
    selected = get_engine(owner_id)
    from lib import credentials as user_credentials
    user_credentials.set_user(owner_id)
    if not selected.loaded:
        await selected.load()
    wsutil.register(websocket)
    queue = selected.subscribe()
    try:
        await websocket.send_text(json.dumps({"type": "state", "state": selected.state().model_dump()}))
        await websocket.send_text(json.dumps({"type": "positions", "positions": [position.model_dump() for position in selected.positions()]}))
        await websocket.send_text(
            json.dumps({"type": "backlog", "logs": [log.model_dump() for log in selected.logs[-200:]]})
        )
        while True:
            payload = await wsutil.next_payload(queue)
            if payload is None:
                break
            await websocket.send_text(payload)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception:
        pass
    finally:
        selected.unsubscribe(queue)
        wsutil.unregister(websocket)
