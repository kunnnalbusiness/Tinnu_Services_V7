import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandlestickSeries, ColorType, LineStyle, createChart } from "lightweight-charts";
import type { UTCTimestamp } from "lightweight-charts";
import { Radar, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import { apiGet } from "@/lib/api";
import { fmtInr } from "@/lib/botTypes";
import type { LivePosition } from "@/lib/botTypes";
import type { CandleSeries } from "@/lib/types";
import { fmtPrice } from "@/lib/types";
import { useBotStream } from "@/hooks/useBotStream";
import { cn } from "@/lib/utils";
import { formatChartTime, useProfile } from "@/lib/profile";
import { useIsDarkTheme } from "@/lib/useThemeMode";

const EMPTY_POSITIONS: LivePosition[] = [];
const CHART_RESOLUTIONS = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"] as const;
type Forecast = { side: "long" | "short"; entry: number; tp: number; sl: number };

function chartTime(value: number): UTCTimestamp {
  const seconds = Math.abs(value) >= 1_000_000_000_000 ? value / 1000 : value;
  return Math.floor(seconds) as UTCTimestamp;
}

/** Candles with entry / TP / SL levels drawn across them. */
function PositionChart({ position }: { position: LivePosition }) {
  const { profile } = useProfile();
  const isDark = useIsDarkTheme();
  const [resolution, setResolution] = useState<string>("1m");
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const visibleRangeRef = useRef<ReturnType<ReturnType<typeof createChart>["timeScale"]>["getVisibleLogicalRange"] extends () => infer T ? T : never>(null);

  useEffect(() => {
    const saved = localStorage.getItem(`position-chart-resolution:${position.pair}`);
    if (saved && CHART_RESOLUTIONS.includes(saved as (typeof CHART_RESOLUTIONS)[number])) setResolution(saved);
  }, [position.pair]);

  const series = useQuery({
    queryKey: ["position-candles", position.pair, resolution],
    queryFn: () =>
      apiGet<CandleSeries>(`/market/candles/${position.pair}?resolution=${resolution}&limit=60`),
    refetchInterval: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const candles = series.data?.candles ?? [];
  const levels = [position.entry_price, position.tp_price, position.sl_price ?? undefined, position.last_price ?? undefined].filter(
    (v): v is number => typeof v === "number" && v > 0,
  );

  useEffect(() => {
    const container = chartRef.current;
    if (!container || candles.length < 2 || levels.length === 0) return;

    let rafId = 0;
    let chart: ReturnType<typeof createChart> | null = null;
    let resizeObserver: ResizeObserver | null = null;

    rafId = requestAnimationFrame(() => {
    const initWidth = container.clientWidth || container.parentElement?.clientWidth || 600;
    const initHeight = container.clientHeight || 340;
    chart = createChart(container, {
      width: initWidth,
      height: initHeight,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? "#0b0e14" : "#ffffff" },
        textColor: isDark ? "#64748b" : "#475569",
        fontFamily: "JetBrains Mono Variable, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? "rgba(30, 41, 59, 0.4)" : "rgba(226, 232, 240, 0.8)" },
        horzLines: { color: isDark ? "rgba(30, 41, 59, 0.4)" : "rgba(226, 232, 240, 0.8)" },
      },
      timeScale: {
        borderColor: isDark ? "#1e293b" : "#e2e8f0",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: UTCTimestamp) => formatChartTime(time, profile.timezone),
      },
      localization: {
        timeFormatter: (time: number) => formatChartTime(time, profile.timezone),
      },
      rightPriceScale: {
        borderColor: isDark ? "#1e293b" : "#e2e8f0",
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      crosshair: {
        vertLine: { color: isDark ? "#334155" : "#94a3b8", width: 1, style: LineStyle.Dotted },
        horzLine: { color: isDark ? "#334155" : "#94a3b8", width: 1, style: LineStyle.Dotted },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00c076",
      downColor: "#ff455b",
      borderUpColor: "#00c076",
      borderDownColor: "#ff455b",
      wickUpColor: "#00c076",
      wickDownColor: "#ff455b",
    });

    candleSeries.setData(
      candles.map((c) => ({
        time: chartTime(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    [
      { value: position.entry_price, color: "#38bdf8", title: "ENTRY" },
      ...(position.tp_price ? [{ value: position.tp_price, color: "#00c076", title: "TP" }] : []),
      ...(position.original_sl_price && position.partial_taken
        ? [{ value: position.original_sl_price, color: "#64748b", title: `SL Cy${position.cycle_number ?? 1}` }]
        : []),
      ...(position.sl_price
        ? [{ value: position.sl_price, color: position.partial_taken ? "#f5c451" : "#ff455b", title: position.partial_taken ? "SL (BE)" : "SL" }]
        : []),
      ...(position.last_price ? [{ value: position.last_price, color: "#f5c451", title: "LIVE" }] : []),
      ...(forecast ? [
        { value: forecast.entry, color: "#7f9bff", title: `${forecast.side.toUpperCase()} ENTRY` },
        { value: forecast.tp, color: "#00c076", title: `${forecast.side.toUpperCase()} TP` },
        { value: forecast.sl, color: "#ff455b", title: `${forecast.side.toUpperCase()} SL` },
      ] : []),
    ].forEach(({ value, color, title }) => candleSeries.createPriceLine({
      price: value,
      color,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title,
    }));

    const previousRange = visibleRangeRef.current;
    if (previousRange) chart.timeScale().setVisibleLogicalRange(previousRange);
    else chart.timeScale().fitContent();

    resizeObserver = new ResizeObserver(() => {
      const h = container.clientHeight || 340;
      chart!.applyOptions({ width: container.clientWidth, height: h });
    });
    resizeObserver.observe(container);
    }); // end requestAnimationFrame

    return () => {
      cancelAnimationFrame(rafId);
      if (chart) {
        visibleRangeRef.current = chart.timeScale().getVisibleLogicalRange();
        chart.remove();
        chart = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
    };
  }, [candles, forecast, profile.timezone, position.entry_price, position.tp_price, position.sl_price, position.original_sl_price, position.partial_taken, position.cycle_number, position.opened_at, isDark]);

  const addForecast = (side: "long" | "short") => {
    const entry = position.entry_price;
    const risk = Math.abs(entry - (position.sl_price ?? entry)) || entry * 0.01;
    setForecast(side === "long"
      ? { side, entry, tp: entry + risk * 2, sl: entry - risk }
      : { side, entry, tp: entry - risk * 2, sl: entry + risk });
  };

  const chartControls = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Live Chart · IST</span>
        <div className="flex items-center gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => addForecast("long")}
            className="inline-flex items-center gap-1 rounded bg-[#00c076]/10 px-2 py-0.5 text-[#00c076] hover:bg-[#00c076]/20 transition"
          >
            <TrendingUp className="h-3 w-3" />Long
          </button>
          <button
            type="button"
            onClick={() => addForecast("short")}
            className="inline-flex items-center gap-1 rounded bg-[#ff455b]/10 px-2 py-0.5 text-[#ff455b] hover:bg-[#ff455b]/20 transition"
          >
            <TrendingDown className="h-3 w-3" />Short
          </button>
          {forecast && (
            <button
              type="button"
              onClick={() => setForecast(null)}
              className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-muted-foreground hover:text-foreground transition"
            >
              <Trash2 className="h-3 w-3" />Clear
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {CHART_RESOLUTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setResolution(option);
              localStorage.setItem(`position-chart-resolution:${position.pair}`, option);
            }}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium transition",
              resolution === option
                ? "bg-[#00c076]/20 text-[#00c076] border border-[#00c076]/30"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );

  if (candles.length < 2) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {chartControls}
        <div className="grid h-[320px] place-items-center text-xs text-muted-foreground">
          Loading candles for {position.symbol}…
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {chartControls}
      <div ref={chartRef} className="h-[340px] w-full" style={{ touchAction: "none" }} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl border border-border bg-background p-2.5 shadow-xs">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "num mt-0.5 text-xs sm:text-sm font-bold",
          tone === "up" ? "text-[#00c076]" : tone === "down" ? "text-[#ff455b]" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PositionCard({ position }: { position: LivePosition }) {
  const long = position.side === "buy";
  const pnl = position.pnl_inr ?? 0;
  const pending = position.state === "pending_order";

  return (
    <article
      data-testid="position-card"
      data-pair={position.pair}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-lg"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="num text-base sm:text-lg font-bold text-foreground" data-testid="position-symbol">
            {position.symbol}
          </span>
          <span
            data-testid="position-side"
            className={cn(
              "num rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              long ? "bg-[#00c076]/15 text-[#00c076] border border-[#00c076]/30" : "bg-[#ff455b]/15 text-[#ff455b] border border-[#ff455b]/30",
            )}
          >
            {long ? "LONG" : "SHORT"}
          </span>
          <span className="num rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] text-foreground">
            {position.timeframe} · {position.leverage}x
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            data-testid="position-state"
            className={cn(
              "num rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
              pending ? "bg-[#2e5cff]/15 text-[#7f9bff] border border-[#2e5cff]/30" : "bg-[#00c076]/15 text-[#00c076] border border-[#00c076]/30",
            )}
          >
            {pending ? "ORDER PENDING" : "LIVE POSITION"}
          </span>
          <span className="text-[11px] text-muted-foreground font-medium">
            {position.strategy_name}
          </span>
        </div>
      </header>

      {/* Chart */}
      <PositionChart position={position} />

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Entry Price" value={fmtPrice(position.entry_price)} />
        <Stat label="Current Price" value={position.last_price ? fmtPrice(position.last_price) : "—"} />
        <Stat label="Take Profit" value={position.tp_price ? fmtPrice(position.tp_price) : "—"} tone="up" />
        <Stat label="Stop Loss" value={position.sl_price ? fmtPrice(position.sl_price) : "—"} tone="down" />
        <Stat
          label="P&L (%)"
          value={position.pnl_pct !== null ? `${position.pnl_pct >= 0 ? "+" : ""}${position.pnl_pct.toFixed(2)}%` : "—"}
          tone={(position.pnl_pct ?? 0) >= 0 ? "up" : "down"}
        />
        <Stat label="P&L (INR)" value={fmtInr(pnl)} tone={pnl >= 0 ? "up" : "down"} />
        <Stat
          label="Distance to TP"
          value={position.distance_to_tp_pct !== null ? `${position.distance_to_tp_pct.toFixed(2)}%` : "—"}
        />
        <Stat label="Margin Used" value={`₹${position.capital_inr.toLocaleString("en-IN")}`} />
      </div>

      {/* Order IDs for Verification */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl border border-border bg-background p-3 text-[10px]">
        <div>
          <span className="uppercase tracking-wider text-muted-foreground text-[9px]">Exchange Order ID</span>
          <p className="mt-0.5 truncate font-mono text-foreground">{position.order_id || "Pending confirmation"}</p>
        </div>
        <div>
          <span className="uppercase tracking-wider text-muted-foreground text-[9px]">Client ID</span>
          <p className="mt-0.5 truncate font-mono text-foreground">{position.client_order_id || "—"}</p>
        </div>
        <div>
          <span className="uppercase tracking-wider text-muted-foreground text-[9px]">Position ID</span>
          <p className="mt-0.5 truncate font-mono text-foreground">{position.position_id || "—"}</p>
        </div>
      </div>
    </article>
  );
}

export default function PositionMonitor() {
  const [tick, setTick] = useState(0);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const { positions: streamedPositions } = useBotStream();

  const positions = useQuery({
    queryKey: ["bot-positions"],
    queryFn: () => apiGet<LivePosition[]>("/bot/positions"),
    refetchInterval: false,
    retry: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const list = streamedPositions ?? positions.data ?? EMPTY_POSITIONS;

  useEffect(() => {
    if (list.length === 0) {
      setSelectedPositionId(null);
      return;
    }
    if (!selectedPositionId || !list.some((position) => position.trade_id === selectedPositionId)) {
      setSelectedPositionId(list[0].trade_id || list[0].pair);
    }
  }, [list, selectedPositionId]);

  const selectedPosition = list.find(
    (position) => (position.trade_id || position.pair) === selectedPositionId,
  ) ?? list[0];

  const PositionBadge = list.length > 0 ? (
    <span className="num inline-flex items-center gap-1.5 rounded-full border border-[#00c076]/30 bg-[#00c076]/10 px-2.5 py-1 text-xs font-semibold text-[#00c076]">
      <span className="h-1.5 w-1.5 animate-[beacon_1.6s_ease-in-out_infinite] rounded-full bg-[#00c076]" />
      {list.length} {list.length === 1 ? "Active" : "Active"}
    </span>
  ) : (
    <span className="text-[11px] text-muted-foreground">0 Active</span>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground transition-colors duration-150">
      {/* ─── Mobile Header ─── */}
      <div className="md:hidden shrink-0">
        <TopBar
          title="Live Positions"
          right={PositionBadge}
        />
      </div>

      {/* ─── Desktop Header ─── */}
      <header className="hidden md:flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/70 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-[#00c076] shadow-sm">
            <Radar className="h-4 w-4" />
          </div>
          <div>
            <h1 className="font-heading text-base font-bold tracking-tight text-foreground">
              Live Position Monitor
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Real-time Entry, Take Profit, Stop Loss & Candlestick Tracker
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="num text-[11px] text-muted-foreground">
            Tick {tick}
          </span>
          {PositionBadge}
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="flex-1 min-h-0 p-3 md:p-5 lg:p-6 overflow-y-auto overscroll-contain">
        {list.length === 0 ? (
          <div
            data-testid="no-positions-state"
            className="flex min-h-[50vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground shadow-xs">
              <Radar className="h-7 w-7 animate-pulse text-muted-foreground" />
            </div>
            <h3 className="mt-4 font-heading text-base font-bold text-foreground">
              No Live Position Right Now
            </h3>
            <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
              When an armed strategy triggers an order, the live candlestick chart, entry, TP, and SL lines will automatically appear here with real-time P&amp;L updates.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Position Tab Bar */}
            <div
              className="flex min-w-0 gap-2 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-sm"
              role="tablist"
              aria-label="Live positions"
            >
              {list.map((position) => {
                const positionId = position.trade_id || position.pair;
                const active = positionId === selectedPositionId;
                const isLong = position.side === "buy";
                return (
                  <button
                    key={positionId}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedPositionId(positionId)}
                    className={cn(
                      "flex min-w-[170px] shrink-0 items-center justify-between rounded-xl border px-3.5 py-2 text-left transition-all",
                      active
                        ? "border-[#00c076]/50 bg-[#00c076]/10 shadow-xs ring-1 ring-[#00c076]/30"
                        : "border-border/60 bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <div>
                      <span className="num block text-xs font-bold text-foreground">
                        {position.symbol}
                      </span>
                      <span className={cn(
                        "num text-[10px] font-bold uppercase",
                        isLong ? "text-[#00c076]" : "text-[#ff455b]",
                      )}>
                        {isLong ? "LONG" : "SHORT"} · {position.timeframe}
                      </span>
                    </div>
                    <span className={cn(
                      "num text-xs font-bold",
                      (position.pnl_pct ?? 0) >= 0 ? "text-[#00c076]" : "text-[#ff455b]",
                    )}>
                      {position.pnl_pct !== null ? `${position.pnl_pct >= 0 ? "+" : ""}${position.pnl_pct.toFixed(1)}%` : "—"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Selected Position Card */}
            {selectedPosition && (
              <PositionCard
                key={selectedPosition.trade_id || selectedPosition.pair}
                position={selectedPosition}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
