"""In-memory live market store: polls the CoinDCX futures stream and fans out to clients."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time

import httpx

from lib import coindcx
from lib.config import (
    COINDCX_WS_PRICE_CHANNEL,
    COINDCX_WS_URL,
    MARKET_PRICE_EVENT,
    MARKET_TOP_N,
    PRICES_URL,
)
from models.market import Snapshot, Ticker

logger = logging.getLogger(__name__)

TOP_N = int(MARKET_TOP_N)
SOCKET_URL = COINDCX_WS_URL
PRICE_CHANNEL = COINDCX_WS_PRICE_CHANNEL
PRICE_EVENT = MARKET_PRICE_EVENT


def _symbol(pair: str, mkt: str | None) -> str:
    if mkt:
        return str(mkt)
    return pair.split("-", 1)[-1].replace("_", "")


class MarketStore:
    def __init__(self) -> None:
        self.pairs: list[str] = []
        self.leverage: dict[str, int] = {}
        self.tickers: dict[str, Ticker] = {}
        self.candles_1h: dict[str, tuple[bool, bool]] = {}
        self.ts: int = 0
        self.connected: bool = False
        self._subscribers: set[asyncio.Queue[str]] = set()
        self._tasks: list[asyncio.Task[None]] = []

    # ---------- snapshot ----------
    def snapshot(self) -> Snapshot:
        instruments = sorted(self.tickers.values(), key=lambda t: -t.change_pct)
        return Snapshot(
            ts=self.ts or int(time.time() * 1000),
            count=len(instruments),
            connected=self.connected,
            source="coindcx-futures-stream",
            instruments=instruments,
            top=instruments[:TOP_N],
        )

    # ---------- pub/sub ----------
    def subscribe(self) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue(maxsize=2)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[str]) -> None:
        self._subscribers.discard(q)

    def _broadcast(self) -> None:
        if not self._subscribers:
            return
        payload = json.dumps(self.snapshot().model_dump())
        for q in list(self._subscribers):
            if q.full():          # slow client: drop the stale frame, keep the newest
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                pass

    # ---------- ingest ----------
    def _apply(self, ts: int, prices: dict[str, object]) -> None:
        allowed = set(self.pairs)
        for pair, raw in prices.items():
            if pair not in allowed or not isinstance(raw, dict):
                continue
            previous = self.tickers.get(pair)
            try:
                last = float(raw.get("ls") or raw.get("mp") or (previous.last if previous else 0))
                change = float(raw.get("pc") if raw.get("pc") is not None else (previous.change_pct if previous else 0))
            except (TypeError, ValueError):
                continue
            if last <= 0:
                continue
            # CoinDCX publishes the 24h change %, so the 24h open is derivable from it.
            denom = 1 + change / 100
            open_price = last / denom if denom else last
            if pair in self.candles_1h:
                c1_g, c2_g = self.candles_1h[pair]
            elif previous:
                # keep previous ticker's known colors until candle loop refreshes
                c1_g, c2_g = previous.c1_green, previous.c2_green
            else:
                # first time seeing this pair — schedule immediate fetch, use neutral default
                asyncio.get_event_loop().call_soon(lambda p=pair: asyncio.ensure_future(self._fetch_candle_now(p)))
                c1_g, c2_g = True, True
            # Priority: efr (next estimated funding rate) > fr (last funding rate) > previous known rate
            efr = raw.get("efr")
            fr = raw.get("fr")
            try:
                efr_val = float(efr) if efr is not None else None
            except (ValueError, TypeError):
                efr_val = None
            try:
                fr_val = float(fr) if fr is not None else None
            except (ValueError, TypeError):
                fr_val = None

            if efr_val is not None and efr_val != 0:
                funding_rate = efr_val
            elif fr_val is not None and fr_val != 0:
                funding_rate = fr_val
            elif previous and previous.funding_rate is not None and previous.funding_rate != 0:
                funding_rate = previous.funding_rate
            elif efr_val is not None:
                funding_rate = efr_val
            elif fr_val is not None:
                funding_rate = fr_val
            else:
                funding_rate = 0.0

            self.tickers[pair] = Ticker(
                pair=pair,
                symbol=_symbol(pair, raw.get("mkt") if isinstance(raw.get("mkt"), str) else None),
                max_leverage=self.leverage.get(pair),
                last=last,
                open=open_price,
                high=float(raw.get("h") or (previous.high if previous else last)),
                low=float(raw.get("l") or (previous.low if previous else last)),
                change_pct=change,
                volume=float(raw.get("v") or (previous.volume if previous else 0)),
                funding_rate=funding_rate,
                c1_green=c1_g,
                c2_green=c2_g,
            )
        self.ts = ts or int(time.time() * 1000)

    async def _poll_prices_loop(self) -> None:
        """Continuously poll CoinDCX futures prices REST endpoint to ensure all funding rates and market data remain fresh."""
        async with httpx.AsyncClient(timeout=10) as http:
            while True:
                try:
                    res = await http.get(PRICES_URL)
                    if res.status_code == 200:
                        payload = res.json()
                        if isinstance(payload, dict):
                            prices = payload.get("prices")
                            if isinstance(prices, dict) and prices:
                                if not self.pairs:
                                    self.pairs = [p for p in prices.keys() if p.startswith("B-") and p.endswith("_USDT")]
                                ts = int(payload.get("ts") or time.time() * 1000)
                                self._apply(ts, prices)
                                self.connected = True
                                self._broadcast()
                except Exception as exc:
                    logger.debug("REST prices poll failed: %s", exc)
                await asyncio.sleep(6)

    # ---------- background loops ----------
    async def _price_loop(self) -> None:
        import socketio

        try:
            async with httpx.AsyncClient(timeout=15) as http:
                self.pairs = await coindcx.fetch_active_instruments(http)
                try:
                    res = await http.get(PRICES_URL)
                    if res.status_code == 200:
                        payload = res.json()
                        if isinstance(payload, dict) and isinstance(payload.get("prices"), dict):
                            self._apply(int(payload.get("ts") or time.time() * 1000), payload["prices"])
                except Exception as e:
                    logger.warning("initial prices fetch failed: %s", e)
        except Exception as exc:
            logger.warning("active instrument bootstrap failed: %s", exc)
        while True:
            client = socketio.AsyncClient(
                reconnection=True,
                reconnection_attempts=0,
                reconnection_delay=1,
                reconnection_delay_max=10,
                logger=False,
                engineio_logger=False,
            )

            @client.event
            async def connect() -> None:
                self.connected = True
                await client.emit("join", {"channelName": PRICE_CHANNEL})
                logger.info("CoinDCX futures price stream connected")

            @client.on(PRICE_EVENT)
            async def price_update(payload: object) -> None:
                if not isinstance(payload, dict):
                    return
                data = payload.get("data")
                if isinstance(data, str):
                    try:
                        data = json.loads(data)
                    except json.JSONDecodeError:
                        return
                if isinstance(data, dict):
                    payload = data
                prices = payload.get("prices")
                if not isinstance(prices, dict):
                    return
                raw_ts = payload.get("ts") or payload.get("T") or int(time.time() * 1000)
                try:
                    ts = int(raw_ts)
                except (TypeError, ValueError):
                    ts = int(time.time() * 1000)
                self._apply(ts, prices)
                self.connected = True
                self._broadcast()

            @client.event
            async def disconnect() -> None:
                self.connected = False
                logger.warning("CoinDCX futures price stream disconnected")

            try:
                await client.connect(SOCKET_URL, transports=["websocket"])
                await client.wait()
            except asyncio.CancelledError:
                await client.disconnect()
                raise
            except Exception as exc:
                self.connected = False
                logger.warning("market WebSocket failed: %s", exc)
                await asyncio.sleep(2)
            finally:
                if client.connected:
                    await client.disconnect()

    async def _leverage_loop(self) -> None:
        try:
            self.leverage = await coindcx.load_cached_leverage()
        except Exception as exc:
            logger.warning("leverage cache read failed: %s", exc)
        async with httpx.AsyncClient(timeout=20) as http:
            while True:
                try:
                    if not self.pairs:
                        self.pairs = await coindcx.fetch_active_instruments(http)
                    missing = [p for p in self.pairs if p not in self.leverage]
                    if missing:
                        fetched = await coindcx.fetch_leverage(http, missing[:150])
                        self.leverage.update(fetched)
                        for pair, lev in fetched.items():
                            if pair in self.tickers:
                                self.tickers[pair].max_leverage = lev
                except Exception as exc:
                    logger.warning("leverage refresh failed: %s", exc)
                await asyncio.sleep(20)

    async def _fetch_candle_now(self, pair: str) -> None:
        """Immediately fetch and store 1h candle colors for a single pair."""
        from lib import candles as candle_api
        try:
            rows = await candle_api.get_candles(pair, "1h", 2)
            if len(rows) >= 2:
                c1_g = float(rows[-2]["close"]) >= float(rows[-2]["open"])
                c2_g = float(rows[-1]["close"]) >= float(rows[-1]["open"])
                self.candles_1h[pair] = (c1_g, c2_g)
                if pair in self.tickers:
                    self.tickers[pair].c1_green = c1_g
                    self.tickers[pair].c2_green = c2_g
        except Exception:
            pass

    async def _candles_1h_loop(self) -> None:
        """Background loop: refresh all 1h candle colors sequentially every cycle."""
        while True:
            try:
                for pair in list(self.pairs):
                    await self._fetch_candle_now(pair)
                    await asyncio.sleep(0.05)
            except Exception as exc:
                logger.warning("1h candles background loop failed: %s", exc)
            await asyncio.sleep(25)

    def start(self) -> None:
        self._tasks = [
            asyncio.create_task(self._price_loop()),
            asyncio.create_task(self._poll_prices_loop()),
            asyncio.create_task(self._leverage_loop()),
            asyncio.create_task(self._candles_1h_loop()),
        ]

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass


store = MarketStore()
