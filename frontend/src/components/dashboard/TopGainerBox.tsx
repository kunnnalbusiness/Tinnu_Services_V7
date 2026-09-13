import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import CandleChart from "@/components/dashboard/CandleChart";
import { Maximize2, X, ZoomIn, ZoomOut } from "lucide-react";
import { apiGet } from "@/lib/api";
import { RESOLUTIONS, fmtCompact, fmtPct, fmtPrice } from "@/lib/types";
import type { CandleSeries, Resolution, Ticker } from "@/lib/types";
import { cn } from "@/lib/utils";

const RANK_ACCENT = ["#F5C451", "#C7D2DC", "#CD7F45", "#00C076"];

// Format price compactly for card boxes to prevent "0.04808..." truncation
function fmtCardPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 100) return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  // For small fractional prices, strip excessive trailing zero padding
  const str = value.toFixed(6);
  return str.replace(/(\.[0-9]*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

/** Returns next funding time as a HH:MM:SS string (CoinDCX perpetuals fund every 4h at 00:00 / 04:00 / 08:00 / 12:00 / 16:00 / 20:00 UTC). */
function useNextFundingCountdown(): string {
  const getCountdown = () => {
    const now = Date.now();
    const h4ms = 4 * 3600 * 1000;
    const nextMs = Math.ceil(now / h4ms) * h4ms;
    const diff = Math.max(0, nextMs - now);
    const hh = Math.floor(diff / 3600000);
    const mm = Math.floor((diff % 3600000) / 60000);
    const ss = Math.floor((diff % 60000) / 1000);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };
  const [countdown, setCountdown] = useState(getCountdown);
  useEffect(() => {
    const id = setInterval(() => setCountdown(getCountdown()), 1000);
    return () => clearInterval(id);
  }, []);
  return countdown;
}

/** Format a funding rate decimal to percentage string */
function fmtFR(rate: number | null | undefined): string {
  if (rate == null || isNaN(rate)) return "—";
  const pct = rate * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(4)}%`;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-center justify-between gap-1 leading-none">
      <span className="text-[8px] uppercase tracking-wider text-muted-foreground font-medium sm:text-[9px]">{label}</span>
      <span
        data-testid={`ohlc-${label.toLowerCase()}`}
        className={cn(
          "num truncate text-[9px] font-semibold sm:text-[10px]",
          tone === "up" ? "text-[#00c076]" : tone === "down" ? "text-[#ff455b]" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default function TopGainerBox({
  ticker,
  rank,
  resolution,
  onResolutionChange,
}: {
  ticker: Ticker;
  rank: number;
  resolution: Resolution;
  onResolutionChange: (value: Resolution) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const up = ticker.change_pct >= 0;
  const accent = RANK_ACCENT[rank - 1] ?? "#00C076";
  const fundingCountdown = useNextFundingCountdown();

  // Memoize funding rate color
  const frColor = useMemo(() => {
    const v = ticker.funding_rate ?? 0;
    return v > 0 ? "text-[#00c076]" : v < 0 ? "text-[#ff455b]" : "text-muted-foreground";
  }, [ticker.funding_rate]);

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);

  const series = useQuery({
    queryKey: ["candles", ticker.pair, resolution],
    queryFn: () =>
      apiGet<CandleSeries>(`/market/candles/${ticker.pair}?resolution=${resolution}&limit=60`),
    refetchInterval: 15_000,
    refetchOnMount: true,
    retry: 2,
    retryDelay: 1500,
    placeholderData: (prev) => prev,
  });

  return (
    <>
      {/* ─── Compact Card View ─── */}
      <div
        data-testid="top-gainer-box"
        data-pair={ticker.pair}
        role="button"
        tabIndex={0}
        aria-label={`${ticker.symbol} details. Click to expand.`}
        onClick={() => setExpanded(true)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded(true);
          }
        }}
        className="flex min-h-0 h-full w-full max-w-full flex-col gap-1.5 overflow-hidden rounded-2xl border border-border bg-card p-2.5 transition-[border-color] duration-200 hover:border-[#00c076]/40 shadow-xs"
        style={{
          boxShadow: `inset 3px 0 0 0 ${accent}`,
        }}
      >
        {/* Top Header Row: Full Symbol Name + Leverage + 24H % + Rank + Expand */}
        <div className="flex items-center justify-between gap-1 border-b border-border pb-1.5">
          <div className="flex items-center gap-1 min-w-0">
            <span className="num text-[11px] sm:text-xs font-bold text-foreground truncate" data-testid="top-box-symbol">
              {ticker.symbol}
            </span>
            <span className="num rounded-md border border-border bg-muted/60 px-1 py-0.5 text-[8px] text-muted-foreground font-semibold shrink-0">
              {ticker.max_leverage ? `${ticker.max_leverage}x` : "—"}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span
              data-testid="top-box-change"
              className={cn(
                "num inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold leading-none",
                up ? "bg-[#00c076]/15 text-[#00c076]" : "bg-[#ff455b]/15 text-[#ff455b]",
              )}
            >
              {up ? "↑" : "↓"}
              {fmtPct(ticker.change_pct)}
            </span>
            <span
              className="num rounded-md px-1.5 py-0.5 text-[9px] font-bold shrink-0"
              style={{ color: accent, backgroundColor: `${accent}1F` }}
              data-testid="top-box-rank"
            >
              #{rank}
            </span>
            <button
              type="button"
              title="Expand card"
              aria-label="Expand card"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(true);
              }}
              className="grid h-5 w-5 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 transition-colors"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Timeframe Selector Bar (No Scrollbar) */}
        <div
          className="rounded-xl border border-border bg-muted/40 p-0.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label={`Timeframe for ${ticker.symbol}`}
          data-testid="timeframe-selector"
        >
          <div className="flex items-center gap-0.5 min-w-0">
            {RESOLUTIONS.map((r) => (
              <button
                key={r}
                type="button"
                data-testid={`timeframe-${r}-button`}
                aria-pressed={resolution === r}
                onClick={(event) => {
                  event.stopPropagation();
                  onResolutionChange(r);
                }}
                className={cn(
                  "num min-w-0 flex-1 rounded-md px-1 py-0.5 text-[8px] sm:text-[9px] font-semibold transition-all duration-150 text-center",
                  resolution === r
                    ? "bg-background text-[#00c076] shadow-xs border border-border/80 font-bold"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <CandleChart
          candles={series.data?.candles ?? []}
          ticker={ticker}
          loading={series.isPending}
          height={isMobile ? 70 : 100}
        />

        {/* OHLC Metrics Grid */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 border-t border-border pt-1.5">
          <Metric label="Open" value={fmtCardPrice(ticker.open)} />
          <Metric label="High" value={fmtCardPrice(ticker.high)} tone="up" />
          <Metric label="Low" value={fmtCardPrice(ticker.low)} tone="down" />
          <Metric label="Close" value={fmtCardPrice(ticker.last)} />
        </div>

        <div className="num flex items-center justify-between gap-1 text-[8px] text-muted-foreground sm:text-[9px]">
          <span className="truncate">Vol {fmtCompact(ticker.volume)}</span>
          <span className="flex flex-col items-end gap-0.5">
            <span className={cn("font-semibold", frColor)}>FR {fmtFR(ticker.funding_rate)}</span>
            <span className="text-[7px] text-muted-foreground">in {fundingCountdown}</span>
          </span>
        </div>
      </div>

      {/* ─── Expanded Modal View ─── */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in-0 duration-150">
          <div
            className="relative w-full max-w-3xl max-h-[90vh] flex flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-2xl text-card-foreground"
            style={{ boxShadow: `inset 4px 0 0 0 ${accent}` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="num text-base sm:text-lg font-bold text-foreground">
                  {ticker.symbol}
                </span>
                <span className="num rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground font-semibold">
                  {ticker.max_leverage ? `${ticker.max_leverage}x Leverage` : "—"}
                </span>
                <span
                  className={cn(
                    "num inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-xs font-bold",
                    up ? "bg-[#00c076]/15 text-[#00c076]" : "bg-[#ff455b]/15 text-[#ff455b]",
                  )}
                >
                  {up ? "↑" : "↓"} {fmtPct(ticker.change_pct)}
                </span>
                <span
                  className="num rounded-md px-2 py-0.5 text-xs font-bold"
                  style={{ color: accent, backgroundColor: `${accent}1F` }}
                >
                  Rank #{rank}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Zoom Out"
                  onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Zoom In"
                  onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Close"
                  onClick={() => setExpanded(false)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Timeframe Selector Bar */}
            <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timeframe</span>
              <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 overflow-x-auto">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onResolutionChange(r)}
                    className={cn(
                      "num rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                      resolution === r
                        ? "bg-background text-[#00c076] shadow-xs border border-border/80 font-bold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Candle Chart */}
            <div className="w-full">
              <CandleChart
                candles={series.data?.candles ?? []}
                ticker={ticker}
                loading={series.isPending}
                height={Math.round((isMobile ? 200 : 280) * zoom)}
              />
            </div>

            {/* Detailed OHLC Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-border pt-3 text-xs">
              <div className="rounded-xl border border-border bg-muted/20 p-2.5">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Open Price</span>
                <span className="num font-bold text-foreground text-sm mt-0.5 block">{fmtPrice(ticker.open)}</span>
              </div>
              <div className="rounded-xl border border-[#00c076]/30 bg-[#00c076]/10 p-2.5">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">24H High</span>
                <span className="num font-bold text-[#00c076] text-sm mt-0.5 block">{fmtPrice(ticker.high)}</span>
              </div>
              <div className="rounded-xl border border-[#ff455b]/30 bg-[#ff455b]/10 p-2.5">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">24H Low</span>
                <span className="num font-bold text-[#ff455b] text-sm mt-0.5 block">{fmtPrice(ticker.low)}</span>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-2.5">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Last / Close</span>
                <span className="num font-bold text-foreground text-sm mt-0.5 block">{fmtPrice(ticker.last)}</span>
              </div>
            </div>

            {/* Additional Market Stats */}
            <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
              <span>24H Volume: <strong className="text-foreground">{fmtCompact(ticker.volume)}</strong></span>
              <span className="flex flex-col items-end gap-0.5">
                <span>Funding Rate: <strong className={cn(frColor)}>{fmtFR(ticker.funding_rate)}</strong></span>
                <span className="text-[10px]">Next in: <strong className="text-foreground">{fundingCountdown}</strong></span>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
