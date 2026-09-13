from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from lib.candles import RESOLUTIONS, fetch_range, get_candles
from lib.market_store import store
from lib import wsutil
from models.market import Candle, CandleSeries, Snapshot, Ticker

router = APIRouter(tags=["market"])


@router.get("/market/candles/{pair}", response_model=CandleSeries)
async def get_candle_series(
    pair: str,
    resolution: str = Query("5m"),
    limit: int = Query(60, ge=2, le=200),
    start: int | None = Query(None, ge=0),
    end: int | None = Query(None, ge=0),
) -> CandleSeries:
    if resolution not in RESOLUTIONS:
        raise HTTPException(status_code=400, detail=f"unsupported resolution: {resolution}")
    try:
        rows = await fetch_range(pair, resolution, start, end, limit) if start is not None and end is not None else await get_candles(pair, resolution, limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"candle upstream failed: {exc}") from exc
    return CandleSeries(
        pair=pair,
        resolution=resolution,
        candles=[Candle(**row) for row in rows],
    )


@router.get("/market/snapshot", response_model=Snapshot)
async def get_snapshot() -> Snapshot:
    return store.snapshot()


@router.get("/market/instrument/{pair}", response_model=Ticker)
async def get_instrument(pair: str) -> Ticker:
    ticker = store.tickers.get(pair)
    if ticker is None:
        raise HTTPException(status_code=404, detail="instrument not found")
    return ticker


@router.websocket("/ws")
async def market_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    wsutil.register(websocket)
    queue = store.subscribe()
    try:
        await websocket.send_text(json.dumps(store.snapshot().model_dump()))
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
        store.unsubscribe(queue)
        wsutil.unregister(websocket)
