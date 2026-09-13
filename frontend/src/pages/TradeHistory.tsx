import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, ChevronDown, Filter, History, Search, TrendingDown, TrendingUp, X } from "lucide-react";
import PnlCalendar from "@/components/bot/PnlCalendar";
import TradePositionCard from "@/components/bot/TradePositionCard";
import TopBar from "@/components/layout/TopBar";
import { apiGet } from "@/lib/api";
import { fmtInr } from "@/lib/botTypes";
import type { BotState, DayPnl, TodaySummary, Trade } from "@/lib/botTypes";
import { cn } from "@/lib/utils";
import { formatDate, formatTime, useProfile } from "@/lib/profile";

export default function TradeHistory() {
  const { profile } = useProfile();
  const [clock, setClock] = useState(() => formatTime(new Date(), profile.timezone));
  const [selectedDate, setSelectedDate] = useState(() => formatDate(new Date(), profile.timezone));
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [selectedStrategyKeys, setSelectedStrategyKeys] = useState<string[]>(["all"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = setInterval(() => setClock(formatTime(new Date(), profile.timezone)), 1000);
    return () => clearInterval(id);
  }, [profile.timezone]);

  // Close filter menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setFilterMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const today = useQuery({
    queryKey: ["bot-history-today"],
    queryFn: () => apiGet<TodaySummary>("/bot/history/today"),
    refetchInterval: 10000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const daily = useQuery({
    queryKey: ["bot-history-daily"],
    queryFn: () => apiGet<DayPnl[]>("/bot/history/daily?days=200"),
    refetchInterval: 30000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const botState = useQuery({
    queryKey: ["bot-history-strategies"],
    queryFn: () => apiGet<BotState>("/bot/state"),
    refetchInterval: 15000,
    retry: false,
  });

  const selectedTrades = useQuery({
    queryKey: ["bot-history-trades", selectedDate],
    queryFn: () =>
      apiGet<Trade[]>(
        `/bot/trades?date=${encodeURIComponent(selectedDate)}&timezone=${encodeURIComponent(profile.timezone)}&limit=500`,
      ),
    refetchInterval: 10000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setSelectedTradeId(null);
  }, [selectedDate, selectedStrategyKeys, profile.timezone]);

  // Dynamically detect ALL strategies (configured or custom historical names)
  const availableStrategies = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of botState.data?.strategies ?? []) {
      if (s.id) map.set(s.id, s.name || s.id);
      if (s.name) map.set(s.name, s.name);
    }
    for (const t of selectedTrades.data ?? []) {
      if (t.strategy_id) map.set(t.strategy_id, t.strategy_name || t.strategy_id);
      if (t.strategy_name) map.set(t.strategy_name, t.strategy_name);
    }
    const unique: { id: string; name: string }[] = [];
    const seenNames = new Set<string>();
    map.forEach((name, id) => {
      if (!seenNames.has(name)) {
        seenNames.add(name);
        unique.push({ id, name });
      }
    });
    return unique;
  }, [botState.data?.strategies, selectedTrades.data]);

  const isAllSelected = selectedStrategyKeys.includes("all") || selectedStrategyKeys.length === 0;

  const toggleStrategyFilter = (key: string) => {
    if (key === "all") {
      setSelectedStrategyKeys(["all"]);
      return;
    }
    setSelectedStrategyKeys((prev) => {
      const filtered = prev.filter((k) => k !== "all");
      if (filtered.includes(key)) {
        const next = filtered.filter((k) => k !== key);
        return next.length === 0 ? ["all"] : next;
      } else {
        return [...filtered, key];
      }
    });
  };

  // Filter raw trades by selected strategies and search query
  const filteredTrades = useMemo(() => {
    const raw = selectedTrades.data ?? [];
    let list = raw;

    if (!isAllSelected) {
      const selectedSet = new Set(selectedStrategyKeys);
      list = list.filter(
        (t) => selectedSet.has(t.strategy_id) || selectedSet.has(t.strategy_name)
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (t) =>
          (t.strategy_name ?? "").toLowerCase().includes(q) ||
          (t.pair ?? "").toLowerCase().includes(q) ||
          (t.rule_set ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [selectedTrades.data, isAllSelected, selectedStrategyKeys, searchQuery]);

  const historyCards = useMemo(() => {
    const groups = new Map<string, Trade[]>();
    const cycleStrategyIds = new Set(
      (botState.data?.strategies ?? [])
        .filter((s) => s.rule_set === "Strategy4" || s.rule_set === "Strategy5")
        .map((s) => s.id),
    );
    for (const trade of filteredTrades) {
      if (!trade) continue;
      const isCycle =
        trade.rule_set === "Strategy4" ||
        trade.rule_set === "Strategy5" ||
        cycleStrategyIds.has(trade.strategy_id);
      const openedAtStr = typeof trade.opened_at === "string" ? trade.opened_at : (trade.opened_at ? new Date(trade.opened_at).toISOString() : "");
      const legacyKey = isCycle
        ? `legacy-cycle-${trade.strategy_id || "s"}-${trade.pair || "p"}-${openedAtStr.slice(0, 10)}`
        : (trade.id || Math.random().toString());
      const key = trade.cycle_group_id ?? legacyKey;
      groups.set(key, [...(groups.get(key) ?? []), trade]);
    }
    const cards = [...groups.values()].flatMap((group): { trade: Trade; cycleTrades?: Trade[] }[] => {
      const valid = group.filter((t): t is Trade => Boolean(t && t.opened_at));
      if (valid.length === 0) return [];
      const first = valid[0];
      const isCycle =
        first.rule_set === "Strategy4" ||
        first.rule_set === "Strategy5" ||
        cycleStrategyIds.has(first.strategy_id ?? "");
      if (!isCycle) return valid.map((trade) => ({ trade, cycleTrades: undefined }));
      const cycles = valid
        .sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime())
        .map((trade, i) => ({
          ...trade,
          rule_set: (trade.rule_set || "Strategy4") as "Strategy4" | "Strategy5",
          cycle_number: trade.cycle_number && trade.cycle_number > 1 ? trade.cycle_number : i + 1,
        }));
      const lastCycle = cycles[cycles.length - 1];
      if (!lastCycle) return [];
      return [{ trade: lastCycle, cycleTrades: cycles }];
    });
    return cards
      .filter((card) => Boolean(card && card.trade && card.trade.opened_at))
      .sort((a, b) => new Date(b.trade.opened_at).getTime() - new Date(a.trade.opened_at).getTime());
  }, [botState.data?.strategies, filteredTrades]);

  const summary = today.data ?? null;
  const selectedDaySummary = useMemo(() => {
    const trades = filteredTrades;
    const pnl = trades.reduce(
      (sum, trade) => sum + (trade.partial_booked_pnl_inr ?? 0) + (trade.pnl_inr ?? 0),
      0,
    );
    const targetInr = summary?.target_inr ?? 25000;
    return {
      date: selectedDate,
      pnl_inr: pnl,
      target_inr: targetInr,
      target_achieved: targetInr > 0 && pnl >= targetInr,
      trades_done: historyCards.length,
      max_trades: summary?.max_trades ?? 50,
    };
  }, [selectedDate, filteredTrades, historyCards.length, summary?.target_inr, summary?.max_trades]);

  const pnl = selectedDaySummary.pnl_inr;

  const cardStats = useMemo(() => {
    let w = 0;
    let l = 0;
    let closed = 0;
    for (const { trade, cycleTrades } of historyCards) {
      const tradesInCard = cycleTrades && cycleTrades.length > 0 ? cycleTrades : [trade];
      const cardNetPnl = tradesInCard.reduce(
        (sum, t) => sum + (t.partial_booked_pnl_inr ?? 0) + (t.pnl_inr ?? 0),
        0,
      );
      const isRunning = tradesInCard.some(
        (t) => t.status === "open" || t.status === "pending",
      );
      if (!isRunning) {
        closed += 1;
        if (cardNetPnl > 0) w += 1;
        else if (cardNetPnl < 0) l += 1;
      }
    }
    const rate = closed > 0 ? Math.round((w / closed) * 100) : 0;
    return { wins: w, losses: l, closedCount: closed, winRate: rate };
  }, [historyCards]);

  const wins = cardStats.wins;
  const losses = cardStats.losses;
  const winRate = cardStats.winRate;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground transition-colors duration-150">

      {/* ══ MOBILE LAYOUT (< md) ════════════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0 flex-col md:hidden">

        {/* Sticky TopBar */}
        <TopBar
          title="Trade History"
          right={
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground active:bg-accent"
            >
              <CalendarDays className="h-3.5 w-3.5 text-[#00c076]" />
              {selectedDate}
            </button>
          }
        />

        {/* Summary stat chips */}
        <div className="shrink-0 grid grid-cols-4 gap-2 bg-muted/30 px-3 py-3 border-b border-border">
          <div className="rounded-xl border border-border bg-card p-2.5 text-center shadow-xs">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">P&L</p>
            <p className={cn("num mt-1 text-[13px] font-bold leading-none", pnl > 0 ? "text-[#00c076]" : pnl < 0 ? "text-[#ff455b]" : "text-muted-foreground")} data-testid="today-pnl-box">
              {fmtInr(pnl)}
            </p>
          </div>
          <div className="rounded-xl border border-[#00c076]/30 bg-[#00c076]/8 p-2.5 text-center shadow-xs">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Wins</p>
            <p className="num mt-1 text-[13px] font-bold leading-none text-[#00c076]">{wins}</p>
          </div>
          <div className="rounded-xl border border-[#ff455b]/30 bg-[#ff455b]/8 p-2.5 text-center shadow-xs">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Loss</p>
            <p className="num mt-1 text-[13px] font-bold leading-none text-[#ff455b]">{losses}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-2.5 text-center shadow-xs">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Win%</p>
            <p className={cn("num mt-1 text-[13px] font-bold leading-none", winRate >= 60 ? "text-[#00c076]" : winRate >= 40 ? "text-amber-500 dark:text-amber-400" : "text-[#ff455b]")}>{winRate}%</p>
          </div>
        </div>

        {/* Search & Strategy Multi-Select Filter Bar */}
        <div className="shrink-0 flex flex-col gap-2 border-b border-border bg-card/60 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search strategy or pair..."
                className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-7 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#00c076]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
                >
                  ×
                </button>
              ) : null}
            </div>
            <span className="num text-[10px] text-muted-foreground shrink-0 font-medium" data-testid="today-trade-count">
              {filteredTrades.length} trades
            </span>
          </div>

          {/* Dynamic Strategy Badges Strip */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => toggleStrategyFilter("all")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[10px] font-semibold shrink-0 transition-all",
                isAllSelected
                  ? "bg-[#00c076]/15 text-[#00c076] border border-[#00c076]/30 font-bold"
                  : "border border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              All Strategies
            </button>
            {availableStrategies.map((s) => {
              const selected = !isAllSelected && (selectedStrategyKeys.includes(s.id) || selectedStrategyKeys.includes(s.name));
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleStrategyFilter(s.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold shrink-0 transition-all",
                    selected
                      ? "bg-[#00c076]/15 text-[#00c076] border border-[#00c076]/30 font-bold"
                      : "border border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {selected && <Check className="h-3 w-3 text-[#00c076]" />}
                  <span>{s.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Trade list — scrollable inside bounded container */}
        <div className="flex-1 overflow-y-auto overscroll-contain flex flex-col gap-2 p-3 pb-24" data-testid="trade-history-list">
          {historyCards.length > 0 ? (
            historyCards.map(({ trade, cycleTrades }) => (
              <TradePositionCard
                key={trade.id}
                record={trade}
                cycleTrades={cycleTrades}
                expanded={selectedTradeId === trade.id}
                showChevron={true}
                onToggle={() => setSelectedTradeId(selectedTradeId === trade.id ? null : trade.id)}
              />
            ))
          ) : (
            <div className="mt-10 flex flex-col items-center gap-2 text-center">
              <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-muted/40 text-muted-foreground mb-1">
                <History className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground">No trades found on {selectedDate}</p>
              <p className="text-xs text-muted-foreground/70">Try adjusting your strategy filter or date.</p>
            </div>
          )}
        </div>

        {/* Calendar bottom sheet */}
        {calendarOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setCalendarOpen(false)} />
            <div className="relative z-10 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-heading text-base font-bold text-foreground">Select Date</h2>
                <button
                  type="button"
                  onClick={() => setCalendarOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <PnlCalendar
                days={daily.data ?? []}
                selectedDate={selectedDate}
                onSelectDate={(d) => { setSelectedDate(d); setCalendarOpen(false); }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ══ DESKTOP LAYOUT (md+) ════════════════════════════════════════════ */}
      <div className="hidden md:flex md:h-screen md:flex-col md:overflow-hidden">

        {/* Desktop header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/70 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-[#00c076] shadow-sm">
              <History className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-heading text-base font-bold text-foreground">Trade History</h1>
              <p className="num text-[11px] text-muted-foreground">Realised P&L · {selectedDate} · {clock}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {/* Search Input */}
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search strategy or pair..."
                className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-7 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#00c076]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
                >
                  ×
                </button>
              ) : null}
            </div>

            {/* Multi-Select Strategy Filter Dropdown */}
            <div className="relative" ref={filterMenuRef}>
              <button
                type="button"
                onClick={() => setFilterMenuOpen((prev) => !prev)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-foreground transition-all hover:bg-muted/40",
                  !isAllSelected && "border-[#00c076]/40 bg-[#00c076]/10 text-[#00c076]"
                )}
              >
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {isAllSelected
                    ? "All Strategies"
                    : `${selectedStrategyKeys.length} Strateg${selectedStrategyKeys.length > 1 ? "ies" : "y"} Selected`}
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", filterMenuOpen && "rotate-180")} />
              </button>

              {/* Multi-Select Popover Menu */}
              {filterMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-border bg-card p-2 shadow-2xl space-y-1">
                  <div className="flex items-center justify-between border-b border-border pb-1.5 px-2 text-[11px] font-bold text-foreground">
                    <span>Filter Strategies</span>
                    {!isAllSelected ? (
                      <button
                        type="button"
                        onClick={() => setSelectedStrategyKeys(["all"])}
                        className="text-[10px] text-[#00c076] hover:underline font-normal"
                      >
                        Reset All
                      </button>
                    ) : null}
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-0.5 py-1">
                    <button
                      type="button"
                      onClick={() => toggleStrategyFilter("all")}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors text-left",
                        isAllSelected ? "bg-[#00c076]/15 text-[#00c076] font-bold" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <span>All Strategies</span>
                      {isAllSelected && <Check className="h-3.5 w-3.5 text-[#00c076]" />}
                    </button>

                    {availableStrategies.map((s) => {
                      const selected = !isAllSelected && (selectedStrategyKeys.includes(s.id) || selectedStrategyKeys.includes(s.name));
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleStrategyFilter(s.id)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors text-left",
                            selected ? "bg-[#00c076]/15 text-[#00c076] font-bold" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          )}
                        >
                          <span className="truncate">{s.name}</span>
                          {selected && <Check className="h-3.5 w-3.5 text-[#00c076]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <span className="h-1.5 w-1.5 rounded-full bg-[#00c076] animate-[beacon_1.6s_ease-in-out_infinite]" />
          </div>
        </header>

        {/* Summary stats row (compact & space-efficient) */}
        <div className="grid grid-cols-4 gap-3 shrink-0 border-b border-border bg-card/40 px-6 py-2">
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-2 shadow-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">P&L Today</span>
            <span data-testid="today-pnl-box" className={cn("num text-sm font-bold", pnl > 0 ? "text-[#00c076]" : pnl < 0 ? "text-[#ff455b]" : "text-muted-foreground")}>
              {fmtInr(pnl)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-[#00c076]/30 bg-[#00c076]/8 px-3.5 py-2 shadow-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Wins</span>
            <div className="flex items-center gap-1">
              <span className="num text-sm font-bold text-[#00c076]">{wins}</span>
              <TrendingUp className="h-3.5 w-3.5 text-[#00c076]" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-[#ff455b]/30 bg-[#ff455b]/8 px-3.5 py-2 shadow-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Losses</span>
            <div className="flex items-center gap-1">
              <span className="num text-sm font-bold text-[#ff455b]">{losses}</span>
              <TrendingDown className="h-3.5 w-3.5 text-[#ff455b]" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-2 shadow-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Win Rate</span>
            <span className="num text-sm font-bold text-foreground">
              {wins + losses > 0 ? `${((wins / (wins + losses)) * 100).toFixed(0)}%` : "0%"}
            </span>
          </div>
        </div>

        {/* Desktop strategy pills bar */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-card/20 px-6 py-2.5 shrink-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedStrategyKeys(["all"])}
            className={cn(
              "flex items-center gap-1 rounded-lg px-3 py-1 text-[11px] font-semibold shrink-0 transition-all",
              isAllSelected
                ? "bg-[#00c076]/15 text-[#00c076] border border-[#00c076]/30 font-bold"
                : "border border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            All Strategies
          </button>
          {availableStrategies.map((s) => {
            const selected = !isAllSelected && (selectedStrategyKeys.includes(s.id) || selectedStrategyKeys.includes(s.name));
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStrategyFilter(s.id)}
                className={cn(
                  "flex items-center gap-1 rounded-lg px-3 py-1 text-[11px] font-semibold shrink-0 transition-all",
                  selected
                    ? "bg-[#00c076]/15 text-[#00c076] border border-[#00c076]/30 font-bold"
                    : "border border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {selected && <Check className="h-3 w-3 text-[#00c076]" />}
                <span>{s.name}</span>
              </button>
            );
          })}
        </div>

        {/* Desktop main body: split view (Trade list + Calendar sidebar) */}
        <div className="flex flex-1 overflow-hidden">
          {/* Trade list column */}
          <div className="flex-1 overflow-y-auto overscroll-contain flex flex-col gap-2.5 p-6" data-testid="desktop-trade-history-list">
            {historyCards.length > 0 ? (
              historyCards.map(({ trade, cycleTrades }) => (
                <TradePositionCard
                  key={trade.id}
                  record={trade}
                  cycleTrades={cycleTrades}
                  expanded={selectedTradeId === trade.id}
                  showChevron={true}
                  onToggle={() => setSelectedTradeId(selectedTradeId === trade.id ? null : trade.id)}
                />
              ))
            ) : (
              <div className="mt-20 flex flex-col items-center gap-2 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-muted/40 text-muted-foreground mb-1">
                  <History className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-muted-foreground">No trades found on {selectedDate}</p>
                <p className="text-xs text-muted-foreground/70">Try adjusting your strategy filter or date.</p>
              </div>
            )}
          </div>

          {/* Calendar sidebar */}
          <div className="w-80 shrink-0 border-l border-border bg-card/30 p-5 overflow-y-auto flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-sm font-bold text-foreground">Select Date</h2>
            </div>
            <PnlCalendar
              days={daily.data ?? []}
              selectedDate={selectedDate}
              onSelectDate={(d) => setSelectedDate(d)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
