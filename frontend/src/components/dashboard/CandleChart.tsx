import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, createChart } from "lightweight-charts";
import type { UTCTimestamp } from "lightweight-charts";
import type { Candle, Ticker } from "@/lib/types";
import { formatChartTime, useProfile } from "@/lib/profile";
import { useIsDarkTheme } from "@/lib/useThemeMode";

function chartTime(candle: Candle): UTCTimestamp {
  const value = Number(candle.time);
  const seconds = Math.abs(value) > 1_000_000_000_000 ? value / 1000 : value;
  return seconds as UTCTimestamp;
}

type CandlePoint = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

type CandleSeriesHandle = {
  setData: (data: CandlePoint[]) => void;
  update: (data: CandlePoint) => void;
};

/** TradingView-style responsive candlesticks with a compact volume histogram. */
export default function CandleChart({
  candles,
  ticker,
  height = 96,
  loading,
}: {
  candles: Candle[];
  ticker?: Ticker;
  height?: number;
  loading?: boolean;
}) {
  const { profile } = useProfile();
  const isDark = useIsDarkTheme();
  const chartRef = useRef<HTMLDivElement | null>(null);
  const candleSeriesRef = useRef<CandleSeriesHandle | null>(null);

  useEffect(() => {
    const container = chartRef.current;
    if (!container || candles.length < 2) return;

    // Use fixed width to prevent zoom from affecting layout
    const fixedWidth = container.parentElement?.clientWidth ?? container.clientWidth;
    const chart = createChart(container, {
      width: fixedWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? "#0b0e14" : "#ffffff" },
        textColor: isDark ? "#64748b" : "#475569",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: isDark ? "#172033" : "#f1f5f9" },
        horzLines: { color: isDark ? "#172033" : "#f1f5f9" },
      },
      crosshair: {
        vertLine: { color: isDark ? "#64748b" : "#94a3b8", width: 1, style: 3, labelBackgroundColor: isDark ? "#334155" : "#e2e8f0" },
        horzLine: { color: isDark ? "#64748b" : "#94a3b8", width: 1, style: 3, labelBackgroundColor: isDark ? "#334155" : "#e2e8f0" },
      },
      rightPriceScale: {
        borderColor: isDark ? "#263247" : "#e2e8f0",
        scaleMargins: { top: 0.08, bottom: 0.25},
      },
      timeScale: {
        borderColor: isDark ? "#263247" : "#e2e8f0",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 7,
        minBarSpacing: 3,
        tickMarkFormatter: (time: UTCTimestamp) => formatChartTime(time, profile.timezone),
      },
      localization: {
        timeFormatter: (time: number) => formatChartTime(time, profile.timezone),
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: false, pinch: true },
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
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    candleSeries.setData(
      candles
        .map((candle) => ({
          time: chartTime(candle),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        }))
        .sort((left, right) => left.time - right.time),
    );

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
      visible: false,
    });
    volumeSeries.setData(
      candles
        .map((candle) => ({
          time: chartTime(candle),
          value: candle.volume,
          color: candle.close >= candle.open ? "#00c07655" : "#ff455b55",
        }))
        .sort((left, right) => left.time - right.time),
    );

    chart.timeScale().fitContent();
    candleSeriesRef.current = candleSeries;
    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    resizeObserver.observe(container);

    // Prevent chart zoom from affecting page layout and position display
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      candleSeriesRef.current = null;
      resizeObserver.disconnect();
      container.removeEventListener("wheel", handleWheel);
      chart.remove();
    };
  }, [candles, height, profile.timezone, isDark]);

  useEffect(() => {
    const latest = candles[candles.length - 1];
    if (!ticker || !latest || !candleSeriesRef.current || !Number.isFinite(ticker.last)) return;
    candleSeriesRef.current.update({
      time: chartTime(latest),
      open: latest.open,
      high: Math.max(latest.high, ticker.last),
      low: Math.min(latest.low, ticker.last),
      close: ticker.last,
    });
  }, [candles, ticker]);

  if (candles.length < 2) {
    return (
      <div
        data-testid="candle-chart-empty"
        className="flex items-center justify-center rounded border border-dashed border-border bg-card text-[10px] text-muted-foreground"
        style={{ height: `${height}px` }}
      >
        {loading ? "Loading candles..." : "No candle data for this timeframe"}
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <div
        ref={chartRef}
        data-testid="candle-chart"
        aria-label="Interactive candlestick chart"
        className="h-full w-full overflow-hidden rounded bg-card"
        style={{ touchAction: "none", pointerEvents: "auto" }}
      />
    </div>
  );
}
