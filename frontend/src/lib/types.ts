// Mirrors backend/models/market.py — keep both sides in sync in one edit.
export interface Ticker {
  pair: string;
  symbol: string;
  max_leverage: number | null;
  last: number;
  open: number;
  high: number;
  low: number;
  change_pct: number;
  volume: number;
  funding_rate: number;
  c1_green?: boolean;
  c2_green?: boolean;
}

export interface Snapshot {
  ts: number;
  count: number;
  connected: boolean;
  source: string;
  instruments: Ticker[];
  top: Ticker[];
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleSeries {
  pair: string;
  resolution: string;
  candles: Candle[];
}

export const RESOLUTIONS = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w", "1M"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export function fmtPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 7,
    maximumFractionDigits: 8,
    useGrouping: true,
  });
}

export function fmtCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
