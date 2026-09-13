import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { CandlestickSeries, ColorType, HistogramSeries, LineStyle, createChart, createSeriesMarkers } from "lightweight-charts";
import type { SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";
import { apiGet } from "@/lib/api";
import { fmtInr, TRADE_STATUS_LABEL } from "@/lib/botTypes";
import type { LivePosition, Trade } from "@/lib/botTypes";
import type { CandleSeries } from "@/lib/types";
import { fmtPrice } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatChartTime, formatDate, formatDateTime, formatTime, useProfile } from "@/lib/profile";
import { useIsDarkTheme } from "@/lib/useThemeMode";

type PositionRecord = Trade | LivePosition;
const CHART_RESOLUTIONS = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w", "1M"] as const;
const RESOLUTION_SECONDS: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "2h": 7200, "4h": 14400, "1d": 86400, "1w": 604800, "1M": 2592000 };
type Forecast = { side: "long" | "short"; entry: number; tp: number; sl: number };

// Both Strategy4 and Strategy5 chain SL-hit cycles on the same pair/side,
// so both should show "Cycle X/3" labels and cycle-chain UI — even when
// only a single cycle exists so far (the chain hasn't hit SL yet).
const CYCLE_RULE_SETS = new Set(["Strategy4", "Strategy5"]);

function isLivePosition(record: PositionRecord): record is LivePosition {
  return "last_price" in record;
}

function duration(record: PositionRecord): string {
  const closedAt = isLivePosition(record) ? null : record.closed_at;
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((end - new Date(record.opened_at).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds % 60}s`;
}

function chartTime(value: number): UTCTimestamp {
  const seconds = Math.abs(value) >= 1_000_000_000_000 ? value / 1000 : value;
  return Math.floor(seconds) as UTCTimestamp;
}

function percentFromPrice(entry: number, target: number | null): string {
  if (!target || entry <= 0) return "—";
  return `${(((target - entry) / entry) * 100).toFixed(2)}%`;
}

function priceMovePercent(record: PositionRecord, currentPrice: number | null): string {
  if (!currentPrice || record.entry_price <= 0) return "—";
  const move = ((currentPrice - record.entry_price) / record.entry_price) * 100;
  return `${move >= 0 ? "+" : ""}${move.toFixed(2)}% price move`;
}

// ---- Cycle chain table helpers ----------------------------------------

type CycleOutcome = {
  label: string;
  badgeClass: string;
  tp1Hit: boolean;
  tp2Hit: boolean;
  sl1Hit: boolean;
  sl2Hit: boolean;
};

function cycleOutcome(cycle: Trade): CycleOutcome {
  const running = cycle.status === "open" || cycle.status === "pending";
  const isTp = cycle.status === "tp";
  const isSl = cycle.status === "sl";
  const partial = Boolean(cycle.partial_taken);

  if (running) {
    return { label: "Running", badgeClass: "bg-blue-500/15 text-blue-500 border border-blue-500/30", tp1Hit: partial, tp2Hit: false, sl1Hit: false, sl2Hit: false };
  }
  if (isTp) {
    return { label: "Full TP", badgeClass: "bg-[#00c076]/15 text-[#00c076] border border-[#00c076]/30", tp1Hit: partial, tp2Hit: true, sl1Hit: false, sl2Hit: partial };
  }
  if (isSl && partial) {
    return { label: "Partial + SL2", badgeClass: "bg-amber-500/15 text-amber-500 border border-amber-500/30", tp1Hit: true, tp2Hit: false, sl1Hit: false, sl2Hit: true };
  }
  if (isSl) {
    return { label: "SL1 Hit", badgeClass: "bg-[#ff455b]/15 text-[#ff455b] border border-[#ff455b]/30", tp1Hit: false, tp2Hit: false, sl1Hit: true, sl2Hit: false };
  }
  return { label: cycle.status.toUpperCase(), badgeClass: "bg-muted text-muted-foreground border border-border", tp1Hit: false, tp2Hit: false, sl1Hit: false, sl2Hit: false };
}

function cycleNextLabel(cycle: Trade, index: number, cycles: Trade[]): string {
  const outcome = cycleOutcome(cycle);
  if (outcome.label === "Full TP") return "Done";
  const next = cycles[index + 1];
  if (next) return `→ C${next.cycle_number ?? index + 2}`;
  if (cycle.status === "open" || cycle.status === "pending") return `${cycle.leverage}x lev`;
  if (cycle.status === "sl") return "Max reached";
  return "—";
}

function cycleTp1Price(cycle: Trade): number | null {
  if (cycle.partial_booked_price) return cycle.partial_booked_price;
  if (cycle.sl_price == null || cycle.tp_price == null) return null;
  return (cycle.entry_price + cycle.tp_price) / 2;
}

function cycleNetPnl(cycle: Trade): number {
  return (cycle.partial_booked_pnl_inr ?? 0) + (cycle.pnl_inr ?? 0);
}

export function PositionChart({ record, cycleTrades }: { record: PositionRecord; cycleTrades?: Trade[] }) {
  const { profile } = useProfile();
  const isDark = useIsDarkTheme();
  const [resolution, setResolution] = useState<string>("1m");
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [drawMode, setDrawMode] = useState<"arrows" | "position">("arrows");
  const chartRef = useRef<HTMLDivElement | null>(null);
  const isFirstRenderRef = useRef(true);
  const visibleRangeRef = useRef<ReturnType<ReturnType<typeof createChart>["timeScale"]>["getVisibleLogicalRange"] extends () => infer T ? T : never>(null);
  useEffect(() => {
    const saved = localStorage.getItem(`position-chart-resolution:${record.pair}`);
    if (saved && CHART_RESOLUTIONS.includes(saved as (typeof CHART_RESOLUTIONS)[number])) setResolution(saved);
  }, [record.pair]);
  const candles = useQuery({
    queryKey: ["trade-position-candles", record.pair, resolution],
    queryFn: () => {
      const live = isLivePosition(record);
      const candleSeconds = RESOLUTION_SECONDS[resolution] ?? 60;
      const entry = Math.floor(new Date(record.opened_at).getTime() / 1000);
      const closedAt = live ? null : record.closed_at;
      const exit = closedAt ? Math.floor(new Date(closedAt).getTime() / 1000) : entry;
      const range = !live && closedAt
        ? `&start=${entry - candleSeconds * 5}&end=${exit + candleSeconds * 5}`
        : "";
      return apiGet<CandleSeries>(`/market/candles/${record.pair}?resolution=${resolution}&limit=200${range}`);
    },
    refetchInterval: isLivePosition(record) ? 10_000 : false,
    retry: false,
    placeholderData: (previous) => previous,
  });
  const rows = candles.data?.candles ?? [];
  const livePrice = isLivePosition(record) ? record.last_price : record.exit_price;
  const levels = [record.entry_price, record.tp_price, record.sl_price, livePrice].filter(
    (value): value is number => typeof value === "number" && value > 0,
  );

  useEffect(() => {
    const container = chartRef.current;
    if (!container || rows.length < 2 || levels.length === 0) return;

    // Defer to next frame so container dimensions are correct even when
    // the chart mounts inside a newly-expanded collapsible panel.
    let rafId = 0;
    let chart: ReturnType<typeof createChart> | null = null;
    let resizeObserver: ResizeObserver | null = null;

    rafId = requestAnimationFrame(() => {
    const initWidth = container.clientWidth || container.parentElement?.clientWidth || 600;
    const initHeight = container.clientHeight || 320;
    chart = createChart(container, {
      width: initWidth,
      height: initHeight,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? "#0b0e14" : "#ffffff" },
        textColor: isDark ? "#94a3b8" : "#475569",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: isDark ? "#172033" : "#f1f5f9", style: LineStyle.Solid },
        horzLines: { color: isDark ? "#172033" : "#f1f5f9", style: LineStyle.Solid },
      },
      crosshair: {
        vertLine: { color: isDark ? "#64748b" : "#94a3b8", width: 1, style: LineStyle.Dashed, labelBackgroundColor: isDark ? "#0f172a" : "#e2e8f0" },
        horzLine: { color: isDark ? "#64748b" : "#94a3b8", width: 1, style: LineStyle.Dashed, labelBackgroundColor: isDark ? "#0f172a" : "#e2e8f0" },
      },
      rightPriceScale: {
        borderColor: isDark ? "#263247" : "#e2e8f0",
        scaleMargins: { top: 0.08, bottom: 0.18 },
      },
      timeScale: {
        borderColor: isDark ? "#263247" : "#e2e8f0",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
        minBarSpacing: 5,
        tickMarkFormatter: (time: Time) => formatChartTime(Number(time), profile.timezone),
      },
      localization: {
        timeFormatter: (time: Time) => formatChartTime(Number(time), profile.timezone),
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00c076",
      downColor: "#ff455b",
      borderUpColor: "#00c076",
      borderDownColor: "#ff455b",
      wickUpColor: "#00c076",
      wickDownColor: "#ff455b",
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: "price", precision: 7, minMove: 0.0000001 },
    });

    candleSeries.setData(
      rows
        .map((row) => ({
          time: chartTime(row.time),
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
        }))
        .sort((left, right) => left.time - right.time),
    );

    const entryTime = chartTime(new Date(record.opened_at).getTime() / 1000);

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
      color: "#1f6feb",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
      visible: false,
    });
    volumeSeries.setData(
      rows
        .map((row) => ({
          time: chartTime(row.time),
          value: row.volume,
          color: row.close >= row.open ? "#00c07655" : "#ff455b55",
        }))
        .sort((left, right) => left.time - right.time),
    );

    const candleSeconds = RESOLUTION_SECONDS[resolution] ?? 60;
    const candleForTime = (timestamp: number): UTCTimestamp => {
      const containing = rows.find((row) => {
        const start = chartTime(row.time);
        return timestamp >= start && timestamp < start + candleSeconds;
      });
      if (containing) return chartTime(containing.time);
      return rows.reduce((closest, row) =>
        Math.abs(chartTime(row.time) - timestamp) < Math.abs(closest - timestamp) ? chartTime(row.time) : closest,
        chartTime(rows[0]?.time ?? timestamp),
      );
    };
    const previousRange = visibleRangeRef.current;
    if (previousRange) {
      chart.timeScale().setVisibleLogicalRange(previousRange);
    } else {
      const closedAt = isLivePosition(record) ? null : record.closed_at;
      if (!isLivePosition(record) && closedAt) {
        // Closed trade: zoom to trade period only
        const candleSeconds = RESOLUTION_SECONDS[resolution] ?? 60;
        const entryTs = chartTime(new Date(record.opened_at).getTime() / 1000) - candleSeconds * 3;
        const exitTs  = chartTime(new Date(closedAt).getTime() / 1000) + candleSeconds * 3;
        try {
          chart.timeScale().setVisibleRange({ from: entryTs as UTCTimestamp, to: exitTs as UTCTimestamp });
        } catch {
          chart.timeScale().fitContent();
        }
      } else {
        chart.timeScale().fitContent();
      }
    }

    const markerRecords = cycleTrades?.length ? cycleTrades : [record];
    const markers: SeriesMarker<UTCTimestamp>[] = markerRecords.flatMap((cycle) => {
      const cycleMarkers: SeriesMarker<UTCTimestamp>[] = [{
        time: candleForTime(chartTime(new Date(cycle.opened_at).getTime() / 1000)),
        position: cycle.side === "buy" ? "belowBar" : "aboveBar",
        color: "#ffffff",
        shape: cycle.side === "buy" ? "arrowUp" : "arrowDown",
        text: `E${cycle.cycle_number ?? 1}`,
        size: 0.7,
      }];
      if (!isLivePosition(cycle) && cycle.closed_at) {
        cycleMarkers.push({
          time: candleForTime(chartTime(new Date(cycle.closed_at).getTime() / 1000)),
          position: cycle.side === "buy" ? "aboveBar" : "belowBar",
          color: "#ffb020",
          shape: cycle.side === "buy" ? "arrowDown" : "arrowUp",
          text: `X${cycle.cycle_number ?? 1}`,
          size: 0.7,
        });
      }
      return cycleMarkers;
    });
    if (drawMode === "arrows") createSeriesMarkers(candleSeries, markers);

    const existingOverlay = container.querySelector("svg");
    if (existingOverlay) existingOverlay.remove();

    if (drawMode === "position") {
      const entryX = chart.timeScale().timeToCoordinate(entryTime);
      const endX = container.clientWidth - 12;
      const entryY = candleSeries.priceToCoordinate(record.entry_price);
      const tpY = record.tp_price == null ? null : candleSeries.priceToCoordinate(record.tp_price);
      const slY = record.sl_price == null ? null : candleSeries.priceToCoordinate(record.sl_price);
      if (entryX !== null && entryY !== null && tpY !== null && slY !== null) {
        const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        overlay.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2");
        overlay.setAttribute("viewBox", `0 0 ${container.clientWidth} ${container.clientHeight || 320}`);
        const addRect = (top: number, bottom: number, fill: string) => {
          const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rect.setAttribute("x", String(entryX));
          rect.setAttribute("y", String(Math.min(top, bottom)));
          rect.setAttribute("width", String(Math.max(0, endX - entryX)));
          rect.setAttribute("height", String(Math.abs(bottom - top)));
          rect.setAttribute("fill", fill);
          overlay.appendChild(rect);
        };
        addRect(entryY, tpY, "#00c07622");
        addRect(entryY, slY, "#ff455b22");
        container.style.position = "relative";
        container.appendChild(overlay);
      }
    }

    [
      ...(record.tp_price ? [{ value: record.tp_price, color: "#00c076", title: "TP" }] : []),
      ...(record.original_sl_price && record.partial_taken
        ? [{ value: record.original_sl_price, color: "#64748b", title: `SL Cy${record.cycle_number ?? 1}` }]
        : []),
      ...(record.sl_price
        ? [{ value: record.sl_price, color: record.partial_taken ? "#f5c451" : "#ff455b", title: record.partial_taken ? "SL (BE)" : "SL" }]
        : []),
      ...(livePrice ? [{ value: livePrice, color: "#f5c451", title: isLivePosition(record) ? "LIVE" : "EXIT" }] : []),
      ...(forecast ? [
        { value: forecast.entry, color: "#7f9bff", title: `${forecast.side.toUpperCase()} ENTRY` },
        { value: forecast.tp, color: "#00c076", title: `${forecast.side.toUpperCase()} TP` },
        { value: forecast.sl, color: "#ff455b", title: `${forecast.side.toUpperCase()} SL` },
      ] : []),
    ].forEach(({ value, color, title }) => {
      if (typeof value === "number" && !isNaN(value) && value > 0) {
        candleSeries.createPriceLine({
          price: value,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title,
        });
      }
    });

    // Track first render to avoid auto-fit on subsequent updates for live positions
    isFirstRenderRef.current = false;

    resizeObserver = new ResizeObserver(() => {
      const h = container.clientHeight || 320;
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
  }, [
    rows,
    resolution,
    profile.timezone,
    cycleTrades,
    forecast,
    drawMode,
    record.entry_price,
    record.tp_price,
    record.sl_price,
    record.opened_at,
    isLivePosition(record) ? null : record.closed_at,
    record.side,
    record.original_sl_price,
    record.partial_taken,
    record.cycle_number,
    livePrice,
    isDark,
  ]);

  const addForecast = (side: "long" | "short") => {
    const entry = record.entry_price;
    const risk = Math.abs(entry - (record.sl_price ?? entry)) || entry * 0.01;
    setForecast(side === "long"
      ? { side, entry, tp: entry + risk * 2, sl: entry - risk }
      : { side, entry, tp: entry - risk * 2, sl: entry + risk });
  };

  if (rows.length < 2 || levels.length === 0) {
    return <div className="grid h-[210px] place-items-center rounded-xl border border-dashed border-border bg-card text-xs text-muted-foreground sm:h-[320px]">Loading price chart…</div>;
  }

  return (
    <div className="relative z-10 w-full max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Price chart · {profile.timezone.split("/").pop()?.replace("_", " ")}</span>
          <span className="num ml-3 text-[10px] text-muted-foreground">TradingView-style candles</span>
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-muted/40 p-0.5">
          {CHART_RESOLUTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => { setResolution(option); localStorage.setItem(`position-chart-resolution:${record.pair}`, option); }}
              className={cn("rounded-lg px-2 py-0.5 text-[10px] font-semibold transition-all", resolution === option ? "bg-background text-[#00c076] border border-border/80 shadow-xs font-bold" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <div className="flex w-full items-center gap-1.5 border-b border-border bg-card/60 px-3 py-1.5 text-[10px]">
        <span className="mr-1 text-[10px] uppercase tracking-wider text-muted-foreground">Draw:</span>
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
          <button type="button" onClick={() => setDrawMode("arrows")} className={cn("rounded-md px-2 py-0.5 font-semibold transition-all", drawMode === "arrows" ? "bg-background text-[#7f9bff] border border-border/80 shadow-xs font-bold" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>Markers</button>
          <button type="button" onClick={() => setDrawMode("position")} className={cn("rounded-md px-2 py-0.5 font-semibold transition-all", drawMode === "position" ? "bg-background text-[#7f9bff] border border-border/80 shadow-xs font-bold" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>{record.side === "buy" ? "Long Position" : "Short Position"}</button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => addForecast("long")} className="inline-flex items-center gap-1 rounded-lg border border-[#00c076]/30 bg-[#00c076]/10 px-2 py-1 text-[10px] font-semibold text-[#00c076] hover:bg-[#00c076]/20 transition-all"><TrendingUp className="h-3 w-3" />Long</button>
          <button type="button" onClick={() => addForecast("short")} className="inline-flex items-center gap-1 rounded-lg border border-[#ff455b]/30 bg-[#ff455b]/10 px-2 py-1 text-[10px] font-semibold text-[#ff455b] hover:bg-[#ff455b]/20 transition-all"><TrendingDown className="h-3 w-3" />Short</button>
          {forecast ? <button type="button" onClick={() => setForecast(null)} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-muted-foreground hover:text-foreground transition"><Trash2 className="h-3 w-3" />Delete</button> : null}
        </div>
      </div>
      <div ref={chartRef} className="relative z-10 h-[240px] w-full overflow-hidden sm:h-[340px]" style={{ touchAction: "none" }} />
    </div>
  );
}

export default function TradePositionCard({
  record,
  cycleTrades,
  expanded,
  onToggle,
  showChevron = true,
}: {
  record: PositionRecord;
  cycleTrades?: Trade[];
  expanded: boolean;
  onToggle: () => void;
  showChevron?: boolean;
}) {
  const { profile } = useProfile();
  const live = isLivePosition(record);
  const isRuleSetCycle = CYCLE_RULE_SETS.has(record.rule_set ?? "");
  const isCycleGroup = Boolean(cycleTrades && cycleTrades.length > 0 && (cycleTrades.length > 1 || isRuleSetCycle));
  const sortedCycles = isCycleGroup
    ? [...(cycleTrades ?? [])].sort((left, right) => (left.cycle_number ?? 1) - (right.cycle_number ?? 1))
    : [];
  const lastCycle = isCycleGroup ? sortedCycles[sortedCycles.length - 1] : null;
  const cycleRunning = isCycleGroup && (lastCycle?.status === "open" || lastCycle?.status === "pending");
  const cycleNetPnlTotal = isCycleGroup
    ? sortedCycles.reduce((sum, trade) => sum + cycleNetPnl(trade), 0)
    : null;
  const showDetails = expanded;
  const status = isCycleGroup && cycleRunning
    ? { label: `Cycle ${lastCycle?.cycle_number ?? 1}/3 running`, className: "text-[#00c076] border-[#00c076]/30 bg-[#00c076]/10" }
    : isCycleGroup
      ? { label: `${sortedCycles.length} cycle${sortedCycles.length > 1 ? "s" : ""} · ${lastCycle?.status?.toUpperCase() ?? "CLOSED"}`, className: lastCycle?.status === "tp" ? "text-[#00c076] border-[#00c076]/30 bg-[#00c076]/10" : "text-[#ff455b] border-[#ff455b]/30 bg-[#ff455b]/10" }
      : TRADE_STATUS_LABEL[live ? (record.state === "pending_order" ? "pending" : "open") : record.status] ?? {
          label: live ? "Running" : record.status?.toUpperCase() || "CLOSED",
          className: "text-muted-foreground border-border bg-muted/30",
        };
  const currentPrice = live ? record.last_price : record.exit_price;
  const pnl = isCycleGroup ? (cycleNetPnlTotal ?? 0) : ((record.partial_booked_pnl_inr ?? 0) + (record.pnl_inr ?? 0));
  const closedAt = live ? null : record.closed_at;
  const tpPercent = percentFromPrice(record.entry_price, record.tp_price);
  const slPercent = percentFromPrice(record.entry_price, record.sl_price);
  const priceMove = priceMovePercent(record, currentPrice);
  const metadata = [
    { label: "Date", value: formatDate(record.opened_at, profile.timezone) },
    { label: "Opened", value: formatTime(record.opened_at, profile.timezone) },
    { label: live ? "Updated" : "Closed", value: live ? formatTime(new Date(), profile.timezone) : closedAt ? formatTime(closedAt, profile.timezone) : "—" },
    { label: "Duration", value: duration(record) },
  ];

  const firstCycle = isCycleGroup && sortedCycles.length > 0 ? sortedCycles[0] : record;
  const entryPriceToDisplay = firstCycle.entry_price;

  return (
    <article className="shrink-0 w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs transition-all duration-200 hover:border-primary/40">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        aria-expanded={expanded}
        className="block w-full cursor-pointer select-none text-left transition-colors hover:bg-muted/40"
      >
        <div className="p-3 sm:p-3.5">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            {/* Pair & Strategy Info */}
            <div className="flex items-start justify-between gap-2 min-w-0 flex-1">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="num text-sm font-bold text-foreground truncate">{record.pair.replace("B-", "")}</span>
                  <span
                    className={cn(
                      "num text-[9px] font-bold uppercase tracking-wider inline-flex items-center gap-1 rounded px-1.5 py-0.5 shrink-0",
                      record.side === "buy"
                        ? "bg-[#00c076]/15 text-[#00c076] border border-[#00c076]/30"
                        : "bg-[#ff455b]/15 text-[#ff455b] border border-[#ff455b]/30"
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", record.side === "buy" ? "bg-[#00c076]" : "bg-[#ff455b]")} />
                    {record.side === "buy" ? "LONG" : "SHORT"}
                  </span>

                  {/* On mobile: Status badge placed next to side tag */}
                  <span className={cn("num text-[9.5px] font-semibold rounded px-1.5 py-0.5 border whitespace-nowrap shrink-0 sm:hidden", status.className)}>
                    {status.label}
                  </span>
                </div>
                <p className="truncate text-[10px] text-muted-foreground mt-0.5">
                  {record.strategy_name} · {record.timeframe}
                  {isCycleGroup ? ` · ${sortedCycles.length}/3 Cycles` : ""}
                </p>
              </div>

              {/* On mobile: Chevron toggle */}
              {showChevron && (
                <div className="sm:hidden shrink-0 pt-0.5">
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")} />
                </div>
              )}
            </div>

            {/* Metrics & Status badge */}
            <div className="grid grid-cols-3 gap-2 border-t border-border/40 pt-2.5 pb-0.5 sm:border-t-0 sm:pt-0 sm:pb-0 sm:flex sm:items-center sm:justify-end sm:gap-6 min-w-0 shrink-0">
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{isCycleGroup ? "C1 Entry" : "Entry"}</p>
                <p className="num text-xs font-semibold text-foreground truncate leading-tight mt-0.5">{fmtPrice(entryPriceToDisplay)}</p>
              </div>

              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  {live ? "Live" : isCycleGroup ? `C${lastCycle?.cycle_number ?? sortedCycles.length} Exit` : "Exit"}
                </p>
                <p className="num text-xs font-semibold text-foreground truncate leading-tight mt-0.5">{currentPrice ? fmtPrice(currentPrice) : "—"}</p>
              </div>

              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Net P&L</p>
                <p className={cn("num text-xs font-bold truncate leading-tight mt-0.5", pnl > 0 ? "text-[#00c076]" : pnl < 0 ? "text-[#ff455b]" : "text-muted-foreground")}>
                  {live && record.pnl_inr === null ? "P&L —" : fmtInr(pnl)}
                </p>
              </div>

              {/* On desktop: Status badge & Chevron */}
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <span className={cn("num text-[10px] font-semibold rounded px-2 py-0.5 border whitespace-nowrap", status.className)}>
                  {status.label}
                </span>
                {showChevron && (
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0", expanded && "rotate-180")} />
                )}
              </div>
            </div>
          </div>
        </div>

        {isCycleGroup && sortedCycles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 bg-muted/15 px-3 py-1.5 text-[10px]">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mr-0.5 shrink-0">Cycle History:</span>
            {sortedCycles.map((c, i) => {
              const outcome = cycleOutcome(c);
              const cPnl = cycleNetPnl(c);
              return (
                <div key={c.id || i} className="flex items-center gap-1 shrink-0">
                  {i > 0 && <span className="text-muted-foreground/40 text-[9px]">➔</span>}
                  <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold border", outcome.badgeClass)}>
                    <span>C{c.cycle_number ?? i + 1}</span>
                    <span>· {outcome.label}</span>
                    <span className="num font-bold">({fmtInr(cPnl)})</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 border-t border-border bg-muted/20 px-3 py-1.5 text-[10px] sm:grid-cols-4">
          {metadata.map((item) => (
            <div key={item.label} className="min-w-0">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{item.label}</span>
              <span className="num block font-medium text-foreground truncate">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {showDetails ? (
        <div className="relative z-10 flex min-w-0 flex-col gap-3 overflow-visible border-t border-border bg-muted/15 p-3">
          {isCycleGroup && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-foreground flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold text-amber-400">Multi-Cycle Chain ({sortedCycles.length} Cycles Executed)</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Combined results of all chained cycles for {record.strategy_name || record.rule_set} on {record.pair.replace("B-", "")}.
                </p>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase text-muted-foreground block font-semibold">Total Card Net P&L</span>
                <span className={cn("num text-sm font-bold", pnl >= 0 ? "text-[#00c076]" : "text-[#ff455b]")}>{fmtInr(pnl)}</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] sm:grid-cols-4">
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">Quantity</span><span className="num text-foreground">{record.quantity}</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">Capital / Leverage</span><span className="num text-foreground">{record.capital_inr ? `₹${record.capital_inr.toLocaleString("en-IN")}` : "—"} / {record.leverage ?? 1}x</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">TP price / target</span><span className="num text-foreground">{record.tp_price ? `${fmtPrice(record.tp_price)} · ${tpPercent}` : "—"}</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">SL price / risk</span><span className="num text-foreground">{record.sl_price ? `${fmtPrice(record.sl_price)} · ${slPercent}` : "No stop loss"}</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">Current / move</span><span className="num text-foreground">{currentPrice ? `${fmtPrice(currentPrice)} · ${priceMove}` : "—"}</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">P&L / leveraged</span><span className={cn("num font-semibold", pnl >= 0 ? "text-[#00c076]" : "text-[#ff455b]")}>{record.pnl_pct == null ? "—" : `${Number(record.pnl_pct).toFixed(2)}%`} · {live && record.pnl_inr === null ? "—" : fmtInr(pnl)}</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">Opened</span><span className="num text-foreground">{formatDateTime(record.opened_at, profile.timezone)}</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">Closed</span><span className="num text-foreground">{closedAt ? formatDateTime(closedAt, profile.timezone) : "Running"}</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">Duration</span><span className="num text-foreground">{duration(record)}</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">Mode</span><span className="num text-foreground">{record.mode}</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">State</span><span className="num text-foreground">{live ? record.state : record.status}</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">Fill deadline</span><span className="num text-foreground">{live ? record.order_deadline_ist || "Filled / none" : "—"}</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">Order ID</span><span className="num break-all text-foreground">{record.order_id || "—"}</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">Position ID</span><span className="num break-all text-foreground">{record.position_id || "pending"}</span></div>
            <div className="min-w-0"><span className="block uppercase text-muted-foreground font-medium">Client ref</span><span className="num break-all text-foreground">{record.client_order_id || "—"}</span></div>
          </div>
          {isCycleGroup ? (
            <div className="max-w-full overflow-x-auto overscroll-contain rounded-xl border border-border bg-card shadow-xs touch-pan-x">
              <div className="border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cycle Chain Details</div>
              <table className="w-full min-w-[1040px] text-[10px]">
                <thead>
                  {(() => {
                    const partialPct = Math.round(sortedCycles.find((c) => c.partial_booked_pct != null)?.partial_booked_pct ?? 75);
                    const finalPct = 100 - partialPct;
                    return (
                      <tr className="border-b border-border bg-muted/20 text-muted-foreground font-medium">
                        <th className="px-2.5 py-2 text-left">Cycle</th>
                        <th className="px-2.5 py-2 text-left">Opened</th>
                        <th className="px-2.5 py-2 text-left">Closed</th>
                        <th className="px-2.5 py-2 text-right">Entry</th>
                        <th className="px-2.5 py-2 text-right">TP1<br /><span className="text-[9px] text-muted-foreground/70 font-normal">Partial · {partialPct}%</span></th>
                        <th className="px-2.5 py-2 text-right">TP2<br /><span className="text-[9px] text-muted-foreground/70 font-normal">Final · {finalPct}%</span></th>
                        <th className="px-2.5 py-2 text-right">SL1<br /><span className="text-[9px] text-muted-foreground/70 font-normal">Original</span></th>
                        <th className="px-2.5 py-2 text-right">SL2<br /><span className="text-[9px] text-muted-foreground/70 font-normal">Breakeven</span></th>
                        <th className="px-2.5 py-2 text-center">Outcome</th>
                        <th className="px-2.5 py-2 text-right">Net P&amp;L</th>
                        <th className="px-2.5 py-2 text-left">Next</th>
                      </tr>
                    );
                  })()}
                </thead>
                <tbody>
                  {sortedCycles.map((cycle, index) => {
                    const outcome = cycleOutcome(cycle);
                    const tp1 = cycleTp1Price(cycle);
                    const netPnl = cycleNetPnl(cycle);
                    return (
                      <tr key={cycle.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-2.5 py-2 font-semibold text-foreground">C{cycle.cycle_number ?? index + 1}</td>
                        <td className="px-2.5 py-2 text-muted-foreground whitespace-nowrap">{formatTime(cycle.opened_at, profile.timezone)}</td>
                        <td className="px-2.5 py-2 text-muted-foreground whitespace-nowrap">{cycle.closed_at ? formatTime(cycle.closed_at, profile.timezone) : <span className="text-blue-400">Running</span>}</td>
                        <td className="num px-2.5 py-2 text-right text-foreground">{fmtPrice(cycle.entry_price)}</td>
                        <td className={cn("num px-2.5 py-2 text-right", outcome.tp1Hit ? "text-[#00c076] font-semibold" : "text-muted-foreground/60")}>
                          {tp1 ? fmtPrice(tp1) : "—"}{outcome.tp1Hit ? " ✓" : ""}
                        </td>
                        <td className={cn("num px-2.5 py-2 text-right", outcome.tp2Hit ? "text-[#00c076] font-semibold" : "text-muted-foreground/60")}>
                          {cycle.tp_price ? fmtPrice(cycle.tp_price) : "—"}{outcome.tp2Hit ? " ✓" : ""}
                        </td>
                        <td className={cn("num px-2.5 py-2 text-right", outcome.sl1Hit ? "text-[#ff455b] font-semibold" : "text-muted-foreground/60")}>
                          {cycle.original_sl_price ? fmtPrice(cycle.original_sl_price) : cycle.sl_price ? fmtPrice(cycle.sl_price) : "—"}{outcome.sl1Hit ? " ✗" : ""}
                        </td>
                        <td className={cn("num px-2.5 py-2 text-right", outcome.sl2Hit ? "text-[#ff455b] font-semibold" : cycle.partial_taken ? "text-[#00c076] font-semibold" : "text-muted-foreground/60")}>
                          {cycle.partial_taken && cycle.sl_price ? fmtPrice(cycle.sl_price) : "—"}
                          {outcome.sl2Hit ? " ✗" : cycle.partial_taken && outcome.tp2Hit ? " ✓" : ""}
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <span className={cn("inline-block rounded px-2 py-0.5 text-[9px] font-semibold", outcome.badgeClass)}>
                            {outcome.label}
                          </span>
                        </td>
                        <td className={cn("num px-2.5 py-2 text-right font-semibold", netPnl > 0 ? "text-[#00c076]" : netPnl < 0 ? "text-[#ff455b]" : "text-muted-foreground")}>
                          {netPnl === 0 && (cycle.status === "open" || cycle.status === "pending") ? "—" : fmtInr(netPnl)}
                        </td>
                        <td className="px-2.5 py-2 text-[9px] text-amber-500 dark:text-amber-400 font-medium">{cycleNextLabel(cycle, index, sortedCycles)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {isCycleGroup ? (
            <div className="flex flex-col gap-4">
              {sortedCycles.map((cycle) => (
                <div key={cycle.id} className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Cycle {cycle.cycle_number ?? 1} · {formatTime(cycle.opened_at, profile.timezone)} → {cycle.closed_at ? formatTime(cycle.closed_at, profile.timezone) : "Running"}
                  </p>
                  <PositionChart record={cycle} />
                </div>
              ))}
            </div>
          ) : (
            <PositionChart record={record} cycleTrades={cycleTrades} />
          )}
        </div>
      ) : null}
    </article>
  );
}
