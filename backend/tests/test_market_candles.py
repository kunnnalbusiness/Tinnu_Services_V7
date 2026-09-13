from __future__ import annotations

from lib import candles


def test_normalise_returns_unique_unix_second_candles():
    rows = [
        {"time": 1_704_067_200_000, "open": 1, "high": 2, "low": 1, "close": 2, "volume": 3},
        {"time": 1_704_067_200, "open": 2, "high": 3, "low": 2, "close": 3, "volume": 4},
        {"time": 1_704_070_800, "open": 3, "high": 4, "low": 3, "close": 4, "volume": 5},
    ]

    result = candles._normalise(rows, 10)

    assert [row["time"] for row in result] == [1_704_067_200, 1_704_070_800]
    assert result[0]["open"] == 2.0


def test_merge_pairs_uses_only_aligned_complete_hours():
    hourly = [
        {"time": 1_704_067_200, "open": 1.0, "high": 2.0, "low": 1.0, "close": 2.0, "volume": 3.0},
        {"time": 1_704_070_800, "open": 2.0, "high": 4.0, "low": 2.0, "close": 3.0, "volume": 5.0},
    ]

    assert candles._merge_pairs(hourly) == [
        {"time": 1_704_067_200, "open": 1.0, "high": 4.0, "low": 1.0, "close": 3.0, "volume": 8.0}
    ]