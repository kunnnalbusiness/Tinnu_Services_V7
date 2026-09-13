from __future__ import annotations

from pydantic import BaseModel


class Ticker(BaseModel):
    pair: str
    symbol: str
    max_leverage: int | None = None
    last: float
    open: float
    high: float
    low: float
    change_pct: float
    volume: float
    funding_rate: float = 0.0
    c1_green: bool = True
    c2_green: bool = True


class Snapshot(BaseModel):
    ts: int
    count: int
    connected: bool
    source: str
    instruments: list[Ticker]
    top: list[Ticker]


class Candle(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float


class CandleSeries(BaseModel):
    pair: str
    resolution: str
    candles: list[Candle]
