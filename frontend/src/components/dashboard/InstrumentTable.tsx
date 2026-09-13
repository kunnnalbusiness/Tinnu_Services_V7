import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fmtCompact, fmtPct, fmtPrice } from "@/lib/types";
import type { Ticker } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey = "change_pct" | "last" | "funding_rate" | "volume" | "symbol";
type FilterKey = "all" | "gainers" | "losers";

function fmtFundingRate(rate: number | null | undefined): string {
  if (rate == null || isNaN(rate)) return "—";
  // CoinDCX `fr` is a decimal fraction: 0.00005 = 0.005%
  const pct = rate * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(4)}%`;
}

/** Shared live countdown to next 4-hour funding (00:00 / 04:00 / 08:00 / 12:00 / 16:00 / 20:00 UTC) */
function useNextFundingCountdown(): string {
  const getCountdown = () => {
    const now = Date.now();
    const h4ms = 4 * 3600 * 1000;
    const nextMs = Math.ceil(now / h4ms) * h4ms;
    const diff = nextMs - now;
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

function SortHead({
  label,
  sortKey,
  active,
  desc,
  align,
  testid,
  className,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  desc: boolean;
  align?: "right";
  testid: string;
  className?: string;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 select-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider bg-muted/60 text-muted-foreground backdrop-blur-xs",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      <button
        type="button"
        data-testid={testid}
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors duration-150",
          active ? "text-[#00c076] font-bold" : "hover:text-foreground",
        )}
      >
        {label}
        {active ? (
          desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
        ) : null}
      </button>
    </th>
  );
}

function getHourlyCandleTimeRanges(now = new Date()) {
  const mins = now.getMinutes();
  const currentHour = now.getHours();

  const c2StartHour = mins < 30 ? (currentHour - 1 + 24) % 24 : currentHour % 24;
  const c2EndHour = mins < 30 ? currentHour % 24 : (currentHour + 1) % 24;
  const c1StartHour = (c2StartHour - 1 + 24) % 24;
  const c1EndHour = c2StartHour;

  const pad = (n: number) => n.toString().padStart(2, "0");

  const c1Range = `${pad(c1StartHour)}:30-${pad(c1EndHour)}:30`;
  const c2Range = `${pad(c2StartHour)}:30-${pad(c2EndHour)}:30`;

  return { c1Range, c2Range };
}

function TwoCandleVisual({
  c1IsGreen,
  c2IsGreen,
  c1Range,
  c2Range,
}: {
  c1IsGreen: boolean;
  c2IsGreen: boolean;
  c1Range: string;
  c2Range: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-1 border border-border/40"
      title={`1H Candles: C1 (${c1Range}): ${c1IsGreen ? "Green" : "Red"} → C2 (${c2Range}): ${c2IsGreen ? "Green" : "Red"}`}
      aria-label={`1H Candles: C1 ${c1Range} ${c1IsGreen ? "Green" : "Red"} then C2 ${c2Range} ${c2IsGreen ? "Green" : "Red"}`}
    >
      <div className="flex flex-col items-center justify-center h-4 w-2" title={`C1 (${c1Range}): ${c1IsGreen ? "Green" : "Red"}`}>
        <div className={cn("w-[1.5px] h-1 shrink-0 rounded-t-full", c1IsGreen ? "bg-[#00c076]" : "bg-[#ff455b]")} />
        <div className={cn("w-2 h-2.5 rounded-[1px] shrink-0", c1IsGreen ? "bg-[#00c076]" : "bg-[#ff455b]")} />
        <div className={cn("w-[1.5px] h-1 shrink-0 rounded-b-full", c1IsGreen ? "bg-[#00c076]" : "bg-[#ff455b]")} />
      </div>
      <div className="flex flex-col items-center justify-center h-4 w-2" title={`C2 (${c2Range}): ${c2IsGreen ? "Green" : "Red"}`}>
        <div className={cn("w-[1.5px] h-1 shrink-0 rounded-t-full", c2IsGreen ? "bg-[#00c076]" : "bg-[#ff455b]")} />
        <div className={cn("w-2 h-2.5 rounded-[1px] shrink-0", c2IsGreen ? "bg-[#00c076]" : "bg-[#ff455b]")} />
        <div className={cn("w-[1.5px] h-1 shrink-0 rounded-b-full", c2IsGreen ? "bg-[#00c076]" : "bg-[#ff455b]")} />
      </div>
    </div>
  );
}

export default function InstrumentTable({ instruments }: { instruments: Ticker[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("change_pct");
  const [desc, setDesc] = useState(true);
  const prev = useRef<Map<string, number>>(new Map());
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const fundingCountdown = useNextFundingCountdown();

  const gainersCount = useMemo(() => instruments.filter((t) => t.change_pct > 0).length, [instruments]);
  const losersCount = useMemo(() => instruments.filter((t) => t.change_pct < 0).length, [instruments]);

  const filterTabs = useMemo(() => [
    { key: "all" as const, label: `All (${instruments.length})`, testid: "filter-all-button" },
    { key: "gainers" as const, label: `Gainers (${gainersCount})`, testid: "filter-gainers-button" },
    { key: "losers" as const, label: `Losers (${losersCount})`, testid: "filter-losers-button" },
  ], [instruments.length, gainersCount, losersCount]);

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    let list = instruments.filter((t) => (q ? t.symbol.includes(q) || t.pair.includes(q) : true));
    if (filter === "gainers") list = list.filter((t) => t.change_pct > 0);
    if (filter === "losers") list = list.filter((t) => t.change_pct < 0);

    const dir = desc ? -1 : 1;
    return [...list]
      .sort((a, b) => {
        if (sortKey === "symbol") return dir * a.symbol.localeCompare(b.symbol);
        const av = sortKey === "funding_rate" ? (a.funding_rate ?? 0) : a[sortKey];
        const bv = sortKey === "funding_rate" ? (b.funding_rate ?? 0) : b[sortKey];
        return dir * (av - bv);
      });
  }, [instruments, query, filter, sortKey, desc]);

  const visibleRows = useMemo(() => {
    return rows.slice(0, isMobile ? 7 : 16);
  }, [rows, isMobile]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setDesc((d) => !d);
    else {
      setSortKey(key);
      setDesc(true);
    }
  };

  const { c1Range, c2Range } = getHourlyCandleTimeRanges();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Table Header & Search */}
      <div className="flex items-center gap-3 border-b border-border px-3 py-2.5 md:px-4 md:py-3">
        <div className="mr-auto flex items-center gap-2 min-w-0 shrink-0">
          <h2 className="font-heading text-xs font-bold tracking-tight text-foreground md:text-sm">
            Active USDT Futures
          </h2>
          <span
            className="num rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground font-semibold"
            title={`Total active contracts: ${instruments.length} | Currently shown: ${rows.length}`}
          >
            {query.trim() || filter !== "all" ? `${rows.length} / ${instruments.length}` : instruments.length}
          </span>
        </div>
        <div className="relative w-[160px] flex-none sm:w-[220px] md:flex-1 md:max-w-[300px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="instrument-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol..."
            className="h-7 w-full rounded-lg border border-border bg-background pl-8 pr-7 text-[11px] text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-[#00c076] md:h-8"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      {/* Professional Segmented Filter Tabs */}
      <div className="flex items-center border-b border-border bg-card/50 px-3 py-2">
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {filterTabs.map((f) => (
            <button
              key={f.key}
              type="button"
              data-testid={f.testid}
              onClick={() => setFilter(f.key)}
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all duration-150 md:px-3 md:text-[11px]",
                filter === f.key
                  ? "bg-background text-foreground shadow-xs border border-border/80 font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain" data-testid="instrument-table-scroll">
        <table className="w-full min-w-[480px] table-fixed border-collapse text-[11px] leading-none md:min-w-[840px] md:text-xs" role="table" aria-label="Active USDT Futures Instruments">
          <thead>
            <tr>
              <SortHead label="Instrument" sortKey="symbol" active={sortKey === "symbol"} desc={desc} testid="sort-symbol-button" onSort={onSort} />
              <SortHead label="Last" sortKey="last" active={sortKey === "last"} desc={desc} align="right" testid="sort-price-button" onSort={onSort} />
              <SortHead label="24H %" sortKey="change_pct" active={sortKey === "change_pct"} desc={desc} align="right" testid="sort-change-button" onSort={onSort} />
              <th
                className="sticky top-0 z-10 select-none px-2 py-1 text-[10px] font-semibold uppercase tracking-wider bg-muted/60 text-muted-foreground backdrop-blur-xs text-center md:text-[11px]"
                title={`1H Candles: C1 (${c1Range}) & C2 (${c2Range})`}
              >
                <div className="flex flex-col items-center justify-center leading-tight">
                  <span>1H Candles</span>
                  <span className="text-[9px] font-semibold text-[#00c076] lowercase tracking-tight">
                    {c1Range.split("-")[0]}-{c2Range.split("-")[1]}
                  </span>
                </div>
              </th>
              <SortHead
                label="Next Funding"
                sortKey="funding_rate"
                active={sortKey === "funding_rate"}
                desc={desc}
                align="right"
                testid="sort-funding-button"
                onSort={onSort}
              />
              <SortHead label="Volume" sortKey="volume" active={sortKey === "volume"} desc={desc} align="right" testid="sort-volume-button" onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((t) => {
              const before = prev.current.get(t.pair);
              const tickUp = before !== undefined && t.last > before;
              const tickDown = before !== undefined && t.last < before;
              prev.current.set(t.pair, t.last);
              const up = t.change_pct >= 0;
              const c1IsGreen = t.c1_green ?? true;
              const c2IsGreen = t.c2_green ?? (t.change_pct >= 0);
              return (
                <tr
                  key={t.pair}
                  data-testid="instrument-row"
                  data-pair={t.pair}
                  className="cursor-pointer border-b border-border/60 transition-colors duration-150 hover:bg-muted/40"
                >
                  <td className="px-2 py-2 md:px-3 md:py-2.5">
                    <span className="num block font-bold text-foreground md:text-[13px]">{t.symbol}</span>
                  </td>
                  <td className="px-2 py-2 text-right md:px-3 md:py-2.5">
                    <span
                      key={`${t.pair}-${tickUp ? "u" : tickDown ? "d" : "f"}-${t.last}`}
                      className={cn(
                        "num inline-block rounded px-1 font-semibold text-foreground md:text-[13px]",
                        tickUp && "animate-[flash-up_0.6s_ease-out] text-[#00c076]",
                        tickDown && "animate-[flash-down_0.6s_ease-out] text-[#ff455b]",
                      )}
                    >
                      {fmtPrice(t.last)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right md:px-3 md:py-2.5">
                    <span
                      data-testid="row-change"
                      className={cn(
                        "num inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold md:text-[11px]",
                        up ? "bg-[#00c076]/12 text-[#00c076]" : "bg-[#ff455b]/12 text-[#ff455b]",
                      )}
                    >
                      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {fmtPct(t.change_pct)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center md:px-3 md:py-2.5">
                    <TwoCandleVisual c1IsGreen={c1IsGreen} c2IsGreen={c2IsGreen} c1Range={c1Range} c2Range={c2Range} />
                  </td>
                  <td className="px-2 py-2 text-right md:px-3 md:py-2.5">
                    <div className="flex flex-col items-end gap-0">
                      <span
                        className={cn(
                          "num font-semibold text-[10px] md:text-[11px]",
                          (t.funding_rate ?? 0) > 0
                            ? "text-[#00c076]"
                            : (t.funding_rate ?? 0) < 0
                              ? "text-[#ff455b]"
                              : "text-muted-foreground",
                        )}
                      >
                        {fmtFundingRate(t.funding_rate)}
                      </span>
                      <span className="num text-[8px] text-muted-foreground">{fundingCountdown}</span>
                    </div>
                  </td>
                  <td className="num px-2 py-2 text-right text-muted-foreground md:px-3 md:py-2.5 md:text-[12px]">{fmtCompact(t.volume)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground" data-testid="instrument-empty-state">
            {instruments.length === 0 ? "Waiting for the CoinDCX stream…" : "No instrument matches this filter."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
