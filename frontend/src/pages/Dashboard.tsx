import { useState } from "react";
import { Flame } from "lucide-react";
import LogoSVG from "@/components/common/LogoSVG";
import InstrumentTable from "@/components/dashboard/InstrumentTable";
import TopGainerBox from "@/components/dashboard/TopGainerBox";
import TopBar from "@/components/layout/TopBar";
import { useMarketStream } from "@/hooks/useMarketStream";
import { fmtPct } from "@/lib/types";
import type { Resolution, Ticker } from "@/lib/types";
import { cn } from "@/lib/utils";

const DEFAULT_RESOLUTION: Resolution = "5m";
const TIMEFRAME_STORAGE_KEY = "scalping-timeframes";

function loadTimeframes(): Record<string, Resolution> {
  try {
    const saved = JSON.parse(localStorage.getItem(TIMEFRAME_STORAGE_KEY) ?? "{}");
    return typeof saved === "object" && saved !== null ? saved : {};
  } catch {
    return {};
  }
}

const STATE_LABEL = {
  connecting: "Connecting…",
  live: "Live · CoinDCX",
  offline: "Offline",
} as const;

export default function Dashboard() {
  const { snapshot, state, ticks } = useMarketStream();
  const [timeframes, setTimeframes] = useState<Record<string, Resolution>>(loadTimeframes);

  const instruments: Ticker[] = snapshot?.instruments ?? [];
  const top: Ticker[] = snapshot?.top ?? [];
  const best = instruments[0];
  const worst = instruments[instruments.length - 1];

  const StatusBadge = (
    <span
      data-testid="ws-status-badge"
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors shrink-0",
        state === "live"
          ? "border-[#00c076]/40 bg-[#00c076]/10 text-[#00c076]"
          : state === "connecting"
            ? "border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-400"
            : "border-[#ff455b]/40 bg-[#ff455b]/10 text-[#ff455b]",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          state === "live"
            ? "bg-[#00c076] animate-[beacon_1.6s_ease-in-out_infinite]"
            : state === "connecting"
              ? "bg-amber-400 animate-pulse"
              : "bg-[#ff455b]",
        )}
      />
      {STATE_LABEL[state]}
    </span>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground transition-colors duration-150">
      {/* ─── Mobile Header (hidden on desktop) ─── */}
      <div className="md:hidden">
        <TopBar
          title="Market Dashboard"
          right={StatusBadge}
        />
      </div>

      {/* ─── Desktop Header (hidden on mobile) ─── */}
      <header className="hidden md:flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/70 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0c141d] p-1 border border-[#00c076]/30 shadow-xs">
            <LogoSVG className="w-full h-full" />
          </div>
          <div>
            <h1 className="font-heading text-base font-bold tracking-tight text-foreground">
              Market Dashboard
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Live CoinDCX perpetual contracts & real-time movers
            </p>
          </div>
        </div>

        {/* Desktop Quick Stats Strip */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-2 text-xs shadow-sm">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Pairs</span>
              <p className="num font-bold text-foreground">{snapshot?.count ?? 0}</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Top Gainer</span>
              <p className="num font-bold text-[#00c076]">
                {best ? `${best.symbol} ${fmtPct(best.change_pct)}` : "—"}
              </p>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Top Loser</span>
              <p className="num font-bold text-[#ff455b]">
                {worst ? `${worst.symbol} ${fmtPct(worst.change_pct)}` : "—"}
              </p>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Ticks</span>
              <p className="num font-bold text-muted-foreground">{ticks}</p>
            </div>
          </div>

          {StatusBadge}
        </div>
      </header>

      {/* ─── Mobile Quick Stats Strip (1 single horizontal row) ─── */}
      <div className="shrink-0 grid grid-cols-4 gap-1.5 border-b border-border bg-muted/40 px-2 py-2 md:hidden">
        <div className="rounded-lg border border-border bg-card p-1.5 text-center shadow-xs flex flex-col justify-center items-center">
          <span className="text-[8px] uppercase tracking-wider text-muted-foreground font-semibold">Pairs</span>
          <p className="num text-xs font-bold text-foreground mt-0.5">{snapshot?.count ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-1.5 text-center shadow-xs flex flex-col justify-center items-center min-w-0">
          <span className="text-[8px] uppercase tracking-wider text-[#00c076] font-semibold">Gainer</span>
          <p className="num text-[10px] font-bold text-[#00c076] truncate w-full mt-0.5" title={best?.symbol}>
            {best ? `${best.symbol.replace("USDT", "")} ${fmtPct(best.change_pct)}` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-1.5 text-center shadow-xs flex flex-col justify-center items-center min-w-0">
          <span className="text-[8px] uppercase tracking-wider text-[#ff455b] font-semibold">Loser</span>
          <p className="num text-[10px] font-bold text-[#ff455b] truncate w-full mt-0.5" title={worst?.symbol}>
            {worst ? `${worst.symbol.replace("USDT", "")} ${fmtPct(worst.change_pct)}` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-1.5 text-center shadow-xs flex flex-col justify-center items-center">
          <span className="text-[8px] uppercase tracking-wider text-muted-foreground font-semibold">Ticks</span>
          <p className="num text-xs font-bold text-muted-foreground mt-0.5">{ticks}</p>
        </div>
      </div>

      {/* ─── Main Content Grid ─── */}
      <main className="flex-1 min-h-0 p-3 md:p-4 lg:p-5 overflow-y-auto lg:overflow-hidden">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:h-full lg:items-stretch">
          {/* Left / Main Column: All Instruments Table */}
          <section className="lg:col-span-7 xl:col-span-8 flex flex-col min-h-0 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
            <InstrumentTable instruments={instruments} />
          </section>

          {/* Right Column: Top 4 Movers */}
          <section className="flex flex-col gap-3 lg:col-span-5 xl:col-span-4 min-h-0 lg:overflow-y-auto pr-0.5">
            <div className="flex items-center justify-between px-1 shrink-0">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-[#00c076]" />
                <h2 className="font-heading text-sm font-bold tracking-tight text-foreground">
                  Top 4 Movers
                </h2>
              </div>
              <span className="num text-[10px] text-muted-foreground font-medium">Live 1s re-rank</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {top.length > 0
                ? top.map((t, i) => (
                    <TopGainerBox
                      key={t.pair}
                      ticker={t}
                      rank={i + 1}
                      resolution={timeframes[t.pair] ?? DEFAULT_RESOLUTION}
                      onResolutionChange={(value) => {
                        setTimeframes((prev) => {
                          const next = { ...prev, [t.pair]: value };
                          localStorage.setItem(TIMEFRAME_STORAGE_KEY, JSON.stringify(next));
                          return next;
                        });
                      }}
                    />
                  ))
                : [0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-4 text-center"
                    >
                      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                      <div className="mt-3 h-12 w-full animate-pulse rounded bg-muted/60" />
                    </div>
                  ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
