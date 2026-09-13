"""Shared WebSocket bookkeeping so hot reload / shutdown never hangs.

uvicorn closes each connection first and only then waits for handler tasks, so a
handler parked forever on an idle queue keeps the whole server alive and unresponsive
(seen as a wedged reload). Every wait is therefore bounded: on each idle second the
handler emits a heartbeat, which fails fast once the transport is going away.
"""
from __future__ import annotations

import asyncio
import contextlib

from fastapi import WebSocket

from lib.config import WS_HEARTBEAT, WS_IDLE_TIMEOUT

HEARTBEAT = WS_HEARTBEAT
IDLE_TIMEOUT = float(WS_IDLE_TIMEOUT)

_sockets: set[WebSocket] = set()
shutdown = asyncio.Event()


def register(ws: WebSocket) -> None:
    _sockets.add(ws)


def unregister(ws: WebSocket) -> None:
    _sockets.discard(ws)


async def next_payload(queue: "asyncio.Queue[str]") -> str | None:
    """Next frame, HEARTBEAT when idle, or None once shutdown was requested."""
    if shutdown.is_set():
        return None
    try:
        return await asyncio.wait_for(queue.get(), timeout=IDLE_TIMEOUT)
    except asyncio.TimeoutError:
        return None if shutdown.is_set() else HEARTBEAT


async def close_all() -> None:
    shutdown.set()
    for ws in list(_sockets):
        with contextlib.suppress(Exception):
            await ws.close()
    _sockets.clear()
