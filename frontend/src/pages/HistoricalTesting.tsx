import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, FlaskConical, History, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import { useBotStream } from "@/hooks/useBotStream";
import type { Strategy } from "@/lib/botTypes";
import { fmtPrice, fmtPct } from "@/lib/types";

type TestResult = {
  status: string;
  message?: string;
  target_time?: string;
  strategy?: string;
  pair?: string;
  side?: string;
  change_pct?: number;
  entry_price?: number;
  tp_price?: number;
  sl_price?: number | null;
  exit_price?: number | null;
  pnl_pct?: number;
  movers?: { pair: string; price: number; change_pct: number }[];
};

function strategyLabel(strategy: Strategy): string {
  return `${strategy.name} · ${strategy.timeframe}`;
}

export default function HistoricalTesting() {
  const { state } = useBotStream();
  const strategies = state?.strategies ?? [];
  const [strategyId, setStrategyId] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const test = useMutation({
    mutationFn: () => {
      if (!strategyId || !targetTime) throw new Error("Select a strategy, date, and time");
      return apiPost<TestResult>("/bot/historical-test", {
        strategy_id: strategyId,
        target_time: `${targetTime}:00+05:30`,
      });
    },
    onSuccess: setResult,
  });

  return (
    <div className="min-h-screen bg-background text-foreground md:min-h-screen">
      <header className="hidden md:flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card/70 px-6 backdrop-blur-md">
        <Link to="/position" className="text-muted-foreground hover:text-foreground" aria-label="Back to live positions">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500/15 text-amber-500"><FlaskConical className="h-4 w-4" /></span>
        <div>
          <h1 className="font-heading text-xs font-bold text-foreground">Testing Old Data</h1>
          <p className="text-[9px] text-muted-foreground">Paper simulation only · never saved to Trade History</p>
        </div>
        <Link to="/history" aria-label="Trade history" title="Trade history" className="ml-auto inline-flex h-7 w-7 items-center justify-center text-xs text-muted-foreground hover:text-foreground"><History className="h-3.5 w-3.5" /></Link>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-3 p-4 lg:grid-cols-[340px_1fr]">
        <section className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs">
          <h2 className="font-heading text-sm font-semibold">Run historical test</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Select the exact IST date and time. The scanner checks historical 24h movers, then applies the saved strategy rules.</p>
          <label className="mt-5 block text-[10px] uppercase tracking-wider text-muted-foreground" htmlFor="historical-time">Date &amp; time · IST</label>
          <input id="historical-time" type="datetime-local" value={targetTime} onChange={(event) => setTargetTime(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          <label className="mt-4 block text-[10px] uppercase tracking-wider text-muted-foreground" htmlFor="historical-strategy">Strategy</label>
          <select id="historical-strategy" value={strategyId} onChange={(event) => setStrategyId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
            <option value="">Select strategy</option>
            {strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategyLabel(strategy)}</option>)}
          </select>
          <Button className="mt-5 w-full" disabled={test.isPending || !strategyId || !targetTime} onClick={() => test.mutate()}>
            <Play className="mr-1.5 h-3.5 w-3.5" /> {test.isPending ? "Fetching historical data..." : "Execute test"}
          </Button>
          {test.error ? <p className="mt-3 text-xs text-[#ff455b]">{(test.error as Error).message}</p> : null}
        </section>

        <section className="min-w-0 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs">
          {!result ? <div className="grid min-h-[360px] place-items-center text-center text-xs text-muted-foreground">Choose a date, time, and strategy to see the simulated result here.</div> : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Result</p><h2 className="font-heading mt-1 text-lg font-bold text-foreground">{result.status.replaceAll("_", " ")}</h2><p className="text-xs text-muted-foreground">{result.strategy} · {result.target_time}</p></div>
                {result.pnl_pct !== undefined ? <div className={result.pnl_pct >= 0 ? "num text-right text-xl font-bold text-[#00c076]" : "num text-right text-xl font-bold text-[#ff455b]"}>{fmtPct(result.pnl_pct)}<p className="text-[10px] font-normal text-muted-foreground">simulated P&amp;L</p></div> : null}
              </div>
              {result.pair ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div><p className="text-[10px] text-muted-foreground">Pair / side</p><p className="num text-sm text-foreground">{result.pair} · {result.side?.toUpperCase()}</p></div><div><p className="text-[10px] text-muted-foreground">Entry</p><p className="num text-sm text-foreground">{fmtPrice(result.entry_price ?? 0)}</p></div><div><p className="text-[10px] text-muted-foreground">TP / SL</p><p className="num text-sm text-foreground">{fmtPrice(result.tp_price ?? 0)} / {result.sl_price ? fmtPrice(result.sl_price) : "—"}</p></div><div><p className="text-[10px] text-muted-foreground">Exit</p><p className="num text-sm text-foreground">{result.exit_price ? fmtPrice(result.exit_price) : "Open"}</p></div></div> : <p className="mt-5 text-sm text-amber-500">{result.message}</p>}
              {result.movers?.length ? <div className="mt-6"><h3 className="font-heading text-xs font-semibold text-foreground">Historical 24h movers checked</h3><div className="mt-2 divide-y divide-border rounded-lg border border-border">{result.movers.map((mover, index) => <div key={mover.pair} className="flex items-center gap-3 px-3 py-2 text-xs"><span className="num w-5 text-muted-foreground">{index + 1}</span><span className="num flex-1 text-foreground">{mover.pair}</span><span className="num text-muted-foreground">{fmtPrice(mover.price)}</span><span className={mover.change_pct >= 0 ? "num text-[#00c076]" : "num text-[#ff455b]"}>{fmtPct(mover.change_pct)}</span></div>)}</div></div> : null}
            </>
          )}
        </section>
      </main>
    </div>
  );
}