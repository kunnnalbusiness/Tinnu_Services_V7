import os

from lib.config import (
    APP_URL,
    CANDLES_URL,
    COINDCX_API_BASE_URL,
    COINDCX_PUBLIC_BASE_URL,
    COINDCX_WS_URL,
    PRICES_URL,
)


def test_coin_dcx_urls_are_centralized():
    assert APP_URL == os.environ.get("APP_URL")
    assert COINDCX_PUBLIC_BASE_URL == "https://public.coindcx.com"
    assert COINDCX_API_BASE_URL == os.environ.get("COINDCX_BASE_URL")
    assert COINDCX_WS_URL == os.environ.get("COINDCX_WS_URL")
    assert CANDLES_URL == "https://public.coindcx.com/market_data/candlesticks"
    assert PRICES_URL == "https://public.coindcx.com/market_data/v3/current_prices/futures/rt"
