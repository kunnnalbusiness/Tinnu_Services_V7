import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BookOpen, Check, Coins, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isLoserCoinPick, STRATEGY_TEMPLATES, TIMEFRAMES } from "@/lib/botTypes";
import { apiGet } from "@/lib/api";
import type { CoinPick, OrderType, RuleSet, Strategy, StrategyCreate, StrategyTemplate, Timeframe, TriggerTimeframe } from "@/lib/botTypes";
import { cn } from "@/lib/utils";

const PICK_LABEL: Record<CoinPick, string> = {
  top_loser: "Top loser (biggest 24h fall)",
  top_gainer: "Top gainer (biggest 24h rise)",
  top4_gainer_buy: "Top 1 gainer - Buy",
  top4_gainer_sell: "Top 1 gainer - Sell",
  top4_loser_buy: "Top 1 loser - Buy",
  top4_loser_sell: "Top 1 loser - Sell",
};

const TF_HINT: Record<Timeframe, string> = {
  "5m": "scans at :04, trades at :05 — every 5 minutes",
  "15m": "scans at :14, trades at :15 — every 15 minutes",
  "30m": "scans at :29, trades at :30 — every 30 minutes",
  "1h": "scans at :59, trades on the hour",
  "4h": "scans 1 min before 00:00, 04:00, 08:00 …",
  "1d": "scans 1 min before 05:30 IST daily",
  "1m": "scans and trades every minute",
};

export default function AddStrategyDialog({
  onCreate,
  editingStrategy,
  onUpdate,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
  pending,
  compact = false,
}: {
  onCreate: (body: StrategyCreate) => void;
  editingStrategy?: Strategy | null;
  onUpdate?: (id: string, body: StrategyCreate) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  pending: boolean;
  compact?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [showStrategyGuide, setShowStrategyGuide] = useState(false);
  const [ruleSet, setRuleSet] = useState<RuleSet>("Strategy1");
  const [name, setName] = useState(STRATEGY_TEMPLATES[0]?.name ?? "1. 1PERIOD CYCLE V1");
  const [coinPick, setCoinPick] = useState<CoinPick>("top4_gainer_sell");
  const [coinSelectionMode, setCoinSelectionMode] = useState<"auto" | "custom">("auto");
  const [customCoins, setCustomCoins] = useState<string[]>([]);
  const [coinSearch, setCoinSearch] = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [triggerTimeframe, setTriggerTimeframe] = useState<TriggerTimeframe>("1m");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [capital, setCapital] = useState("");
  const [leverage, setLeverage] = useState("10");
  const [tp, setTp] = useState("0.5");
  const [sl, setSl] = useState("2.5");
  const [slMode, setSlMode] = useState<"manual" | "candle">("manual");
  const [maxTrades, setMaxTrades] = useState("10");
  const [target, setTarget] = useState("25000");
  const [cycleLeverages, setCycleLeverages] = useState(["2", "5", "10"]);
  const [partialRatio, setPartialRatio] = useState("0.75");
  const templatesQuery = useQuery({
    queryKey: ["strategy-templates"],
    queryFn: () => apiGet<StrategyTemplate[]>("/bot/strategies/templates"),
    staleTime: 0,
    retry: false,
  });

  const marketQuery = useQuery({
    queryKey: ["market-snapshot-coins"],
    queryFn: () => apiGet<{ instruments?: Array<{ symbol?: string; pair: string; change_pct?: number }> }>("/market/snapshot"),
    staleTime: 30 * 1000,
  });

  const availableMarketCoins = useMemo(() => {
    const set = new Set<string>();
    for (const inst of marketQuery.data?.instruments ?? []) {
      const sym = (inst.symbol || inst.pair.replace(/^B-/, "").replace(/_USDT$/, "")).toUpperCase().trim();
      if (sym) set.add(sym);
    }
    return Array.from(set).sort();
  }, [marketQuery.data]);

  const filteredCoins = useMemo(() => {
    const q = coinSearch.trim().toUpperCase();
    if (!q) return availableMarketCoins.slice(0, 16);
    return availableMarketCoins.filter((c) => c.includes(q)).slice(0, 24);
  }, [coinSearch, availableMarketCoins]);

  const toggleCustomCoin = (coin: string) => {
    const clean = coin.trim().toUpperCase();
    if (!clean) return;
    setCustomCoins((prev) =>
      prev.includes(clean) ? prev.filter((c) => c !== clean) : [...prev, clean]
    );
  };

  const removeCustomCoin = (coin: string) => {
    setCustomCoins((prev) => prev.filter((c) => c !== coin));
  };

  const addTypedCoin = () => {
    const clean = coinSearch.trim().toUpperCase().replace(/^B-/, "").replace(/_USDT$/, "");
    if (clean && !customCoins.includes(clean)) {
      setCustomCoins((prev) => [...prev, clean]);
      setCoinSearch("");
    }
  };

  const templates = templatesQuery.data?.length ? templatesQuery.data : STRATEGY_TEMPLATES;
  const templateMap = Object.fromEntries(templates.map((template) => [template.rule_set, template])) as Record<RuleSet, StrategyTemplate>;
  const isStrategy2 = ruleSet === "top4_5m_reversal_short" || ruleSet === "Strategy1";
  const isStrategy4 = ruleSet === "Strategy4" || ruleSet === "Strategy5";
  const isStrategy6 = ruleSet === "Strategy6";
  const isBuySignal = coinPick.includes("buy");
  const visibleTimeframes: Timeframe[] = isStrategy6
    ? ["4h"]
    : isStrategy2
      ? ["5m", "1h"]
      : isStrategy4
        ? ["1m", "1h"]
        : TIMEFRAMES;
  const strategy2FieldClass = "grid gap-1.5";
  const isEditing = Boolean(editingStrategy);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  const defaultRuleSet: RuleSet = templates[0]?.rule_set ?? "Strategy1";

  useEffect(() => {
    if (!editingStrategy) return;
    setStep(2);
    setRuleSet(editingStrategy.rule_set);
    setName(editingStrategy.name);
    if (editingStrategy.custom_coins && editingStrategy.custom_coins.length > 0) {
      setCustomCoins(editingStrategy.custom_coins);
      setCoinSelectionMode("custom");
    } else {
      setCustomCoins([]);
      setCoinSelectionMode("auto");
    }
    setCoinPick(
      (editingStrategy.rule_set === "top4_5m_reversal_short" || editingStrategy.rule_set === "Strategy1")
        ? editingStrategy.coin_pick.startsWith("top4_")
          ? editingStrategy.coin_pick
          : "top4_gainer_sell"
        : editingStrategy.coin_pick,
    );
    setTimeframe(
      (editingStrategy.rule_set === "top4_5m_reversal_short" || editingStrategy.rule_set === "Strategy1") && !["5m", "1h"].includes(editingStrategy.timeframe)
        ? "1h"
        : editingStrategy.timeframe,
    );
    setTriggerTimeframe(editingStrategy.trigger_timeframe ?? "5m");
    setOrderType(editingStrategy.order_type);
    setCapital(editingStrategy.capital_cap_inr == null ? "" : String(editingStrategy.capital_cap_inr));
    setLeverage(String(editingStrategy.leverage));
    setTp(String(editingStrategy.tp_pct));
    if (editingStrategy.rule_set === "top4_5m_reversal_short") {
      if (editingStrategy.sl_pct != null && Number(editingStrategy.sl_pct) > 0) {
        setSlMode("manual");
        setSl(String(editingStrategy.sl_pct));
      } else {
        setSlMode("candle");
        setSl("");
      }
    } else {
      setSl(editingStrategy.sl_pct == null ? "" : String(editingStrategy.sl_pct));
    }
    setMaxTrades(String(editingStrategy.max_trades_per_day));
    setTarget(String(editingStrategy.daily_target_inr));
    setCycleLeverages((editingStrategy.cycle_leverages ?? [2, 5, 10]).map(String));
    setPartialRatio(editingStrategy.partial_ratio != null ? String(editingStrategy.partial_ratio) : "0.75");
  }, [editingStrategy]);

  const selectTemplate = (selectedRuleSet: RuleSet) => {
    const template = templateMap[selectedRuleSet] ?? templateMap[defaultRuleSet];
    setRuleSet(selectedRuleSet);
    setName(template.name);
    setCoinPick(template.coin_pick);
    setTimeframe(template.timeframe);
    setTriggerTimeframe(template.trigger_timeframe ?? "1m");
    setOrderType(template.order_type);
    setCapital(template.capital_cap_inr == null ? "" : String(template.capital_cap_inr));
    setLeverage(String(template.leverage));
    setTp(String(template.tp_pct));
    if (selectedRuleSet === "top4_5m_reversal_short") {
      setSlMode("candle");
      setSl(template.sl_pct != null && Number(template.sl_pct) > 0 ? String(template.sl_pct) : "2.5");
    } else {
      setSl(template.sl_pct == null ? "" : String(template.sl_pct));
    }
    setMaxTrades(String(template.max_trades_per_day));
    setTarget(String(template.daily_target_inr));
    setCycleLeverages((template.cycle_leverages ?? [2, 5, 10]).map(String));
    setPartialRatio(template.partial_ratio != null ? String(template.partial_ratio) : "0.75");
  };

  const submit = () => {
    const parsedCapital = Number(capital);
    const parsedLeverage = Number(leverage);
    const parsedCycleLeverages = cycleLeverages.map(Number);
    const normalizedCoinPick = isStrategy2 && !coinPick.startsWith("top4_")
      ? "top4_gainer_sell"
      : coinPick;
    const normalizedOrderType = isStrategy2 || isStrategy4 ? "limit" : orderType;
    const parsedSl = isStrategy6
      ? null
      : (ruleSet === "top4_5m_reversal_short" && slMode === "candle")
        ? null
        : (Number(sl) > 0 ? Number(sl) : (isStrategy4 ? 1 : null));
    const body: StrategyCreate = {
      name: name.trim() || "Strategy",
      rule_set: ruleSet,
      coin_pick: normalizedCoinPick,
      custom_coins: coinSelectionMode === "custom" && customCoins.length > 0 ? customCoins : [],
      timeframe,
      trigger_timeframe: triggerTimeframe,
      order_type: normalizedOrderType,
      capital_cap_inr: Number.isFinite(parsedCapital) && parsedCapital > 0 ? parsedCapital : 40000,
      tp_pct: isStrategy6 ? null : Math.max(0.01, Number(tp) || (isStrategy4 ? 2 : 0.5)),
      sl_pct: parsedSl,
      leverage: isStrategy4 ? (Number.isFinite(parsedCycleLeverages[0]) ? parsedCycleLeverages[0] : 2) : (Number.isFinite(parsedLeverage) && parsedLeverage > 0 ? parsedLeverage : 10),
      cycle_leverages: isStrategy4 && parsedCycleLeverages.every((value) => Number.isFinite(value) && value >= 1 && value <= 10)
        ? parsedCycleLeverages
        : [2, 5, 10],
      partial_ratio: Number(partialRatio) > 0 ? Number(partialRatio) : 0.75,
      max_trades_per_day: Math.min(20, Math.max(1, Number(maxTrades) || 5)),
      daily_target_inr: isStrategy4 ? 25000 : Math.max(0, Number(target) || 25000),
    };
    if (isEditing && editingStrategy && onUpdate) onUpdate(editingStrategy.id, body);
    else onCreate(body);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) { setStep(1); setShowStrategyGuide(false); selectTemplate(defaultRuleSet); } }}>
      {showTrigger ? <DialogTrigger
        render={
          <Button
            size="sm"
            data-testid="add-strategy-trigger"
            disabled={pending}
            className={cn(
              "flex items-center justify-center gap-1 bg-[#00c076] font-bold text-[#04140d] shadow-xs hover:bg-[#00c076]/90 active:scale-95 transition-all shrink-0",
              compact ? "h-7 rounded-full px-2.5 text-[11px]" : "h-8 rounded-xl px-3 text-xs"
            )}
          >
            <Plus className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={2.5} />
            <span className={compact ? "inline" : "hidden sm:inline"}>Add Strategy</span>
          </Button>
        }
      /> : null}
      <DialogContent className="border-border bg-card text-card-foreground shadow-2xl sm:max-w-2xl md:max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{isEditing ? "Edit strategy" : "New strategy"}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {step === 1
              ? "Select a strategy template to continue."
              : "Review and edit the risk settings before creating the strategy."}
          </DialogDescription>
          {isStrategy2 && step === 2 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 w-full justify-start border-border bg-muted/50 text-xs text-foreground hover:bg-muted"
              onClick={() => setShowStrategyGuide((value) => !value)}
              data-testid="strategy2-guide-button"
            >
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              {showStrategyGuide ? "Hide strategy guide" : "View strategy guide & live log"}
            </Button>
          ) : null}
        </DialogHeader>

        {showStrategyGuide && isStrategy2 && step === 2 ? (
          <div className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3" data-testid="strategy2-guide">
            <div>
              <p className="text-xs font-semibold text-foreground">1PERIOD CYCLE</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Top 4 selected coins ke decision candles check hote hain. Green ke baad Red close confirm hone par short entry signal banta hai.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-lg border border-border bg-background/60 p-2">
                <p className="font-semibold text-[#00c076]">Signal flow</p>
                <p className="mt-1 text-muted-foreground">Scan → Green → Red confirm → Entry</p>
              </div>
              <div className="rounded-lg border border-border bg-background/60 p-2">
                <p className="font-semibold text-primary">Live log</p>
                <p className="mt-1 text-muted-foreground">SCAN → EVAL → MATCH → TRIGGER → TRADE</p>
              </div>
            </div>
            <div className="grid gap-2 rounded-lg border border-border bg-background/60 p-2 font-mono text-[9px]">
              <p className="font-sans text-[10px] font-semibold text-foreground">Realtime examples</p>
              <div className="grid gap-1 rounded border border-[#00c076]/20 bg-[#00c076]/5 p-2 text-muted-foreground">
                <p className="font-sans text-[10px] font-semibold text-[#00c076]">Placed and filled</p>
                <p><span className="text-muted-foreground/70">09:35:00</span> <span className="font-semibold text-primary">[SCAN]</span> Top 4 gainer candidates ranked</p>
                <p><span className="text-muted-foreground/70">09:35:04</span> <span className="font-semibold text-primary">[MATCH]</span> Green → Red confirmed, SELL signal ready</p>
                <p><span className="text-muted-foreground/70">09:35:05</span> <span className="font-semibold text-[#00c076]">[PLACED]</span> SELL order placed at candle close</p>
                <p><span className="text-muted-foreground/70">09:35:07</span> <span className="font-semibold text-[#00c076]">[FILLED]</span> Position opened, TP/SL monitoring started</p>
              </div>
              <div className="grid gap-1 rounded border border-[#ffb020]/20 bg-[#ffb020]/5 p-2 text-muted-foreground">
                <p className="font-sans text-[10px] font-semibold text-[#ffb020]">Placed then cancelled</p>
                <p><span className="text-muted-foreground/70">10:15:05</span> <span className="font-semibold text-[#00c076]">[PLACED]</span> SELL limit order submitted</p>
                <p><span className="text-muted-foreground/70">10:17:05</span> <span className="font-semibold text-[#ffb020]">[CANCELLED]</span> No fill before the order window expired</p>
                <p><span className="text-muted-foreground/70">10:17:06</span> <span className="text-muted-foreground">[WAIT]</span> Waiting for the next timeframe slot</p>
              </div>
            </div>
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Activity className="h-3 w-3 text-primary" />
              Detailed events bot screen ke Live Log Console mein appear honge.
            </p>
          </div>
        ) : null}

        {step === 1 && !isEditing ? (
          <div className="grid gap-2">
            {templates.map((template) => (
              <button
                key={template.rule_set}
                type="button"
                onClick={() => selectTemplate(template.rule_set)}
                className={`rounded-xl border p-3 text-left transition-all ${
                  ruleSet === template.rule_set
                    ? "border-primary bg-primary/10 shadow-xs"
                    : "border-border bg-muted/40 hover:bg-muted/70"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{template.name}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {template.rule_set === "Strategy6"
                    ? "CoinDCX 4h Funding Cycle · Entry at 00:00:04 · Exit at 03:59:58"
                    : `${isLoserCoinPick(template.coin_pick) ? "Loser scan" : "Gainer scan"} · ${template.timeframe} · TP ${template.tp_pct}% / SL ${template.sl_pct ?? 0}%`}
                </p>
              </button>
            ))}
            <p className="num text-[10px] text-muted-foreground">Pick a strategy template, then review and save the defaults.</p>
          </div>
        ) : (
        <div className="grid gap-4">
          {/* Strategy 6 Funding Cycle Card */}
          {isStrategy6 && (
            <div className="rounded-xl border border-[#00c076]/40 bg-[#00c076]/5 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-[#00c076] animate-pulse" />
                  <span className="text-xs font-bold text-[#00c076]">Strategy 6: 4-Hour Funding Loss Arbitrage</span>
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                  CoinDCX 4h Cycle
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-background/80 p-2.5 border border-border">
                  <span className="block text-[10px] uppercase font-bold text-[#00c076]">Entry Trigger</span>
                  <span className="text-foreground font-bold text-xs">00:00:04</span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">4 seconds before 4h settlement</span>
                </div>
                <div className="rounded-lg bg-background/80 p-2.5 border border-border">
                  <span className="block text-[10px] uppercase font-bold text-[#ff9900]">Auto Close / Exit</span>
                  <span className="text-foreground font-bold text-xs">03:59:58</span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">2 seconds into new cycle</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Captures the 4-hour funding rate fee snapshot with minimal market exposure (~6 seconds total position holding). Evaluates Next Funding Rate on Top Loser / Top Buyer or your selected Custom Coins.
              </p>
            </div>
          )}

          {/* Strategy Name */}
          <div className={strategy2FieldClass}>
            <Label htmlFor="strategy-name" className="text-xs text-muted-foreground">Strategy Name</Label>
            <Input
              id="strategy-name"
              data-testid="strategy-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-border bg-background text-foreground text-sm font-medium"
            />
          </div>

          {/* ─── Coin Selection Section (Dual Fields: Auto Scanner vs Custom Coins) ─── */}
          <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2.5">
              <div className="flex items-center gap-1.5">
                <Coins className="h-4 w-4 text-[#00c076]" />
                <Label className="text-xs font-bold text-foreground">Coin Selection Mode</Label>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="flex items-center gap-1 rounded-lg border border-border bg-background/80 p-0.5">
                <button
                  type="button"
                  onClick={() => setCoinSelectionMode("auto")}
                  className={cn(
                    "px-3 py-1 text-xs font-bold rounded-md transition-all",
                    coinSelectionMode === "auto"
                      ? "bg-[#00c076]/15 text-[#00c076] shadow-xs border border-[#00c076]/40"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Field 1: Auto Scanner
                </button>
                <button
                  type="button"
                  onClick={() => setCoinSelectionMode("custom")}
                  className={cn(
                    "px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5",
                    coinSelectionMode === "custom"
                      ? "bg-[#00c076]/15 text-[#00c076] shadow-xs border border-[#00c076]/40"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span>Field 2: Custom Coins</span>
                  {customCoins.length > 0 && (
                    <span className="rounded-full bg-[#00c076] px-1.5 py-0.2 text-[10px] font-extrabold text-[#04140d]">
                      {customCoins.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Field 1: Auto Scanner Dropdown */}
            {coinSelectionMode === "auto" ? (
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground font-medium">Market Rank Scanner Preset</Label>
                  <span className="text-[10px] text-muted-foreground">Scans entire market automatically</span>
                </div>
                <Select value={coinPick} onValueChange={(value: string) => setCoinPick(value as CoinPick)}>
                  <SelectTrigger data-testid="coin-pick-select" className="border-border bg-background text-foreground text-sm font-medium">
                    <SelectValue>{(v) => PICK_LABEL[v as CoinPick]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {isStrategy2 || isStrategy4 || isStrategy6 ? (
                      <>
                        <SelectItem value="top4_gainer_buy">{PICK_LABEL.top4_gainer_buy}</SelectItem>
                        <SelectItem value="top4_gainer_sell">{PICK_LABEL.top4_gainer_sell}</SelectItem>
                        <SelectItem value="top4_loser_buy">{PICK_LABEL.top4_loser_buy}</SelectItem>
                        <SelectItem value="top4_loser_sell">{PICK_LABEL.top4_loser_sell}</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="top_loser">{PICK_LABEL.top_loser}</SelectItem>
                        <SelectItem value="top_gainer">{PICK_LABEL.top_gainer}</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Bot will monitor and rank live CoinDCX futures pairs based on 24h market movement.
                </p>
              </div>
            ) : (
              /* Field 2: Custom Coin Search & Multi-Select */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground font-medium">Search & Select Custom Coins (Single or Multiple)</Label>
                  {customCoins.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCustomCoins([])}
                      className="text-[11px] text-rose-500 hover:underline font-semibold"
                    >
                      Clear all ({customCoins.length})
                    </button>
                  )}
                </div>

                {/* Search Bar */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={coinSearch}
                      onChange={(e) => setCoinSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTypedCoin();
                        }
                      }}
                      placeholder="Type coin symbol (e.g. BTC, ETH, SOL, DOGE) & press Enter..."
                      className="border-border bg-background pl-8 text-sm"
                    />
                  </div>
                  {coinSearch.trim() && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={addTypedCoin}
                      className="bg-[#00c076] text-[#04140d] font-bold hover:bg-[#00c076]/90"
                    >
                      Add +
                    </Button>
                  )}
                </div>

                {/* Selected Coins Chips */}
                <div className="rounded-lg border border-border/70 bg-background/60 p-2 min-h-[42px] flex flex-wrap items-center gap-1.5">
                  {customCoins.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic px-1">
                      No custom coins selected. Choose from below or search above.
                    </span>
                  ) : (
                    customCoins.map((coin) => (
                      <span
                        key={coin}
                        className="inline-flex items-center gap-1 rounded-md border border-[#00c076]/40 bg-[#00c076]/15 px-2 py-0.5 text-xs font-bold text-[#00c076]"
                      >
                        <span>{coin}</span>
                        <button
                          type="button"
                          onClick={() => removeCustomCoin(coin)}
                          className="rounded-full p-0.5 hover:bg-[#00c076]/30 text-[#00c076]"
                          title={`Remove ${coin}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>


                {/* Filtered Search Results list if user is typing */}
                {coinSearch.trim() && filteredCoins.length > 0 && (
                  <div className="rounded-lg border border-border bg-background p-2 max-h-32 overflow-y-auto">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                      Matching Instruments ({filteredCoins.length}):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {filteredCoins.map((coin) => {
                        const isSelected = customCoins.includes(coin);
                        return (
                          <button
                            key={coin}
                            type="button"
                            onClick={() => toggleCustomCoin(coin)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold border transition-colors",
                              isSelected
                                ? "bg-[#00c076] text-[#04140d] border-[#00c076]"
                                : "bg-muted/50 border-border text-foreground hover:bg-muted"
                            )}
                          >
                            {isSelected ? <Check className="h-3 w-3 stroke-[3]" /> : <Plus className="h-3 w-3" />}
                            <span>{coin}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Strategy Side Selection for Custom Coins */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60">
                  <div className={strategy2FieldClass}>
                    <Label className="text-[11px] text-muted-foreground">Trade Side Pattern</Label>
                    <Select value={coinPick} onValueChange={(value: string) => setCoinPick(value as CoinPick)}>
                      <SelectTrigger className="border-border bg-background text-foreground text-xs font-semibold h-8">
                        <SelectValue>{(v) => (v as string).includes("buy") ? "BUY (Long on trigger)" : "SELL (Short on trigger)"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="top4_gainer_buy">BUY (Long on trigger)</SelectItem>
                        <SelectItem value="top4_gainer_sell">SELL (Short on trigger)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center text-[10px] text-muted-foreground pt-3">
                    Bot will evaluate triggers exclusively on your selected coins list.
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={isStrategy2 || isStrategy4 ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-3"}>
            <div className={strategy2FieldClass}>
              <Label className="text-xs text-muted-foreground">Timeframe</Label>
              {isStrategy2 || isStrategy4 ? (
                <Select value={timeframe} onValueChange={(value: string) => setTimeframe(value as Timeframe)}>
                  <SelectTrigger data-testid="strategy-timeframe-select" className="border-border bg-background text-foreground text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleTimeframes.map((tf) => (
                      <SelectItem key={tf} value={tf}>{isStrategy4 && tf === "1m" ? "1 (fast/testing)" : tf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5" data-testid="timeframe-group">
                    {visibleTimeframes.map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        data-testid={`strategy-timeframe-${tf}`}
                        aria-pressed={timeframe === tf}
                        onClick={() => setTimeframe(tf)}
                        className={
                          timeframe === tf
                            ? "num rounded-lg border border-[#00c076]/50 bg-[#00c076]/12 px-2.5 py-1 text-[11px] font-semibold text-[#00c076]"
                            : "num rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                        }
                      >
                        {tf === "1d" ? "Daily" : tf}
                      </button>
                    ))}
                  </div>
                  <p className="num text-[10px] text-muted-foreground" data-testid="timeframe-hint">
                    {TF_HINT[timeframe]} · GREEN candle → BUY, RED → SELL · limit order at the candle close
                  </p>
                </>
              )}
            </div>

            {(isStrategy2 || isStrategy4) && (
              <div className={strategy2FieldClass}>
                <Label className="text-xs text-muted-foreground">Trigger check every</Label>
                <Select value={triggerTimeframe} onValueChange={(value: string) => setTriggerTimeframe(value as TriggerTimeframe)}>
                  <SelectTrigger className="border-border bg-background text-foreground text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1m">1 min</SelectItem>
                    <SelectItem value="5m">5 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className={strategy2FieldClass}>
              <Label className="text-xs text-muted-foreground">Entry order type</Label>
              <Select value={orderType} onValueChange={(value: string) => setOrderType(value as OrderType)}>
                <SelectTrigger className="border-border bg-background text-foreground text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="market">Market</SelectItem>
                  <SelectItem value="limit">Limit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isStrategy4 && !isStrategy2 && !isStrategy6 && (
            <div className="grid grid-cols-2 gap-3">
              <div className={strategy2FieldClass}>
                  <Label className="text-xs text-muted-foreground">Trigger check every</Label>
                <Select value={triggerTimeframe} onValueChange={(value: string) => setTriggerTimeframe(value as TriggerTimeframe)}>
                  <SelectTrigger className="border-border bg-background text-foreground text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1m">1 min</SelectItem>
                    <SelectItem value="5m">5 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {isStrategy4 ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-2">
                {cycleLeverages.map((value, index) => (
                  <div key={`cycle-${index + 1}`} className="grid gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1.5 text-center">
                    <Label htmlFor={`cycle-leverage-${index + 1}`} className="text-[9px] uppercase text-muted-foreground">Cycle {index + 1}</Label>
                    <div className="flex items-center justify-center gap-1">
                      <Input
                        id={`cycle-leverage-${index + 1}`}
                        data-testid={`cycle-leverage-${index + 1}-input`}
                        type="number"
                        min="1"
                        max="10"
                        step="0.1"
                        value={value}
                        onChange={(event) => setCycleLeverages((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                        className="num h-8 border-border bg-background text-center text-xs text-foreground"
                      />
                      <span className="num text-xs text-muted-foreground">x</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={strategy2FieldClass}>
                  <Label htmlFor="capital" className="text-xs text-muted-foreground">Capital cap (₹)</Label>
                  <Input id="capital" data-testid="capital-input" value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="Enter capital" className="num border-border bg-background text-foreground text-sm" />
                </div>
                <div className={strategy2FieldClass}>
                  <Label htmlFor="tp" className="text-xs text-muted-foreground">TP ratio</Label>
                  <Input id="tp" data-testid="tp-input" value={tp} onChange={(e) => setTp(e.target.value)} className="num border-border bg-background text-foreground text-sm" />
                </div>
                <div className={strategy2FieldClass}>
                  <Label htmlFor="sl" className="text-xs text-muted-foreground">SL ratio</Label>
                  <Input id="sl" data-testid="sl-input" value={sl} onChange={(e) => setSl(e.target.value)} className="num border-border bg-background text-foreground text-sm" />
                </div>
                <div className={strategy2FieldClass}>
                  <Label htmlFor="partial-ratio" className="text-xs text-muted-foreground">Partial TP ratio</Label>
                  <Input
                    id="partial-ratio"
                    data-testid="partial-ratio-input"
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="0.95"
                    value={partialRatio}
                    onChange={(e) => setPartialRatio(e.target.value)}
                    placeholder="0.75"
                    className="num border-border bg-background text-foreground text-sm"
                  />
                </div>
                <div className={strategy2FieldClass}>
                  <Label htmlFor="max-trades" className="text-xs text-muted-foreground">Max trades / day</Label>
                  <Input id="max-trades" data-testid="max-trades-input" value={maxTrades} onChange={(e) => setMaxTrades(e.target.value)} className="num border-border bg-background text-foreground text-sm" />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className={strategy2FieldClass}>
                <Label htmlFor="capital" className="text-xs text-muted-foreground">Capital cap (₹)</Label>
                <Input
                  id="capital"
                  data-testid="capital-input"
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                  placeholder="Enter capital"
                  className="num border-border bg-background text-foreground text-sm"
                />
              </div>
              <div className={strategy2FieldClass}>
                <Label htmlFor="leverage" className="text-xs text-muted-foreground">Leverage (max 10x)</Label>
                <Input
                  id="leverage"
                  data-testid="leverage-input"
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                  type="number"
                  min="1"
                  max="10"
                  className="num border-border bg-background text-foreground text-sm"
                />
              </div>
              {!isStrategy6 && (
                <div className={strategy2FieldClass}>
                  <Label htmlFor="tp" className="text-xs text-muted-foreground">Take profit (%)</Label>
                  <Input
                    id="tp"
                    data-testid="tp-input"
                    value={tp}
                    onChange={(e) => setTp(e.target.value)}
                    className="num border-border bg-background text-foreground text-sm"
                  />
                </div>
              )}
              {ruleSet === "top4_5m_reversal_short" ? (
                <div className="col-span-2 rounded-xl border border-border/80 bg-muted/20 p-3.5 grid gap-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-border/60 pb-2">
                    <Label className="text-xs font-bold text-foreground">Stop Loss (SL) Method</Label>
                    <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSlMode("candle");
                          setSl("");
                        }}
                        className={cn(
                          "px-2.5 py-1 text-xs font-bold rounded-md transition-all",
                          slMode === "candle"
                            ? "bg-[#00c076] text-[#04140d] shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Candle High/Low SL
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSlMode("manual");
                          if (!sl || sl === "0") setSl("2.5");
                        }}
                        className={cn(
                          "px-2.5 py-1 text-xs font-bold rounded-md transition-all",
                          slMode === "manual"
                            ? "bg-[#00c076] text-[#04140d] shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Manual % SL
                      </button>
                    </div>
                  </div>
                  {slMode === "manual" ? (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className={strategy2FieldClass}>
                        <Label htmlFor="sl" className="text-xs text-muted-foreground">Stop loss (%)</Label>
                        <Input
                          id="sl"
                          data-testid="sl-input"
                          placeholder="2.5"
                          value={sl}
                          onChange={(e) => setSl(e.target.value)}
                          className="num border-border bg-background text-foreground text-sm font-semibold"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground self-center">
                        Fixed percentage: Entry Price ± {sl || "2.5"}%
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-[#00c076]/40 bg-[#00c076]/5 p-3 text-xs space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#00c076]">
                          Candle High/Low SL (Automatic Trigger Method)
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border">
                          Current Mode: {isBuySignal ? "▲ BUY / LONG" : "▼ SELL / SHORT"}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-foreground/90 text-[11px] leading-relaxed">
                        <div className={cn(
                          "rounded-lg border p-2.5 transition-all",
                          !isBuySignal
                            ? "border-[#ff455b]/60 bg-[#ff455b]/10 shadow-xs ring-1 ring-[#ff455b]/30"
                            : "border-border/60 bg-background/70 opacity-75"
                        )}>
                          <div className="font-bold text-[#ff455b] flex items-center justify-between">
                            <span>▼ SELL / SHORT Signals:</span>
                            {!isBuySignal && <span className="text-[9px] font-bold bg-[#ff455b]/20 px-1.5 py-0.5 rounded text-[#ff455b]">Selected</span>}
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            SL trigger candles ke <strong>Highest High</strong> par set hoga:
                          </p>
                          <code className="mt-1 block rounded bg-background/90 px-2 py-1 text-[11px] font-mono text-[#ff455b] font-bold border border-[#ff455b]/20">
                            max(Candle A High, Candle B High)
                          </code>
                        </div>
                        <div className={cn(
                          "rounded-lg border p-2.5 transition-all",
                          isBuySignal
                            ? "border-[#00c076]/60 bg-[#00c076]/10 shadow-xs ring-1 ring-[#00c076]/30"
                            : "border-border/60 bg-background/70 opacity-75"
                        )}>
                          <div className="font-bold text-[#00c076] flex items-center justify-between">
                            <span>▲ BUY / LONG Signals:</span>
                            {isBuySignal && <span className="text-[9px] font-bold bg-[#00c076]/20 px-1.5 py-0.5 rounded text-[#00c076]">Selected</span>}
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            SL trigger candles ke <strong>Highest High</strong> par set hoga:
                          </p>
                          <code className="mt-1 block rounded bg-background/90 px-2 py-1 text-[11px] font-mono text-[#00c076] font-bold border border-[#00c076]/20">
                            max(Candle A High, Candle B High)
                          </code>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground italic">
                        * BUY aur SELL dono me SL always trigger candles ke Highest High: max(Candle A High, Candle B High) par set hoga (min nahi hoga).
                      </p>
                    </div>
                  )}
                </div>
              ) : !isStrategy6 ? (
                <div className={strategy2FieldClass}>
                  <Label htmlFor="sl" className="text-xs text-muted-foreground">Stop loss (%)</Label>
                  <Input
                    id="sl"
                    data-testid="sl-input"
                    value={sl}
                    onChange={(e) => setSl(e.target.value)}
                    className="num border-border bg-background text-foreground text-sm"
                  />
                </div>
              ) : null}
              <div className={strategy2FieldClass}>
                <Label htmlFor="max-trades" className="text-xs text-muted-foreground">Max trades / day</Label>
                <Input
                  id="max-trades"
                  data-testid="max-trades-input"
                  value={maxTrades}
                  onChange={(e) => setMaxTrades(e.target.value)}
                  className="num border-border bg-background text-foreground text-sm"
                />
              </div>
              <div className={strategy2FieldClass}>
                <Label htmlFor="target" className="text-xs text-muted-foreground">Daily target (₹)</Label>
                <Input
                  id="target"
                  data-testid="daily-target-input"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="num border-border bg-background text-foreground text-sm"
                />
              </div>
            </div>
          )}
        </div>
        )}

        <DialogFooter className={isStrategy2 && step === 2 ? "grid grid-cols-3 gap-2" : undefined}>
          {step === 1 ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} data-testid="cancel-strategy-button">
                Cancel
              </Button>
              <Button size="sm" onClick={() => setStep(2)} data-testid="strategy-next-button">
                Review and edit
              </Button>
            </>
          ) : isStrategy2 ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setStep(1)} data-testid="strategy-back-button">
                Back
              </Button>
              <Button size="sm" onClick={submit} data-testid="save-strategy-button">
                {isEditing ? "Save changes" : "Create strategy"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} data-testid="cancel-strategy-button">
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} data-testid="cancel-strategy-button">
                Cancel
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setStep(1)} data-testid="strategy-back-button">
                Back
              </Button>
              <Button size="sm" onClick={submit} data-testid="save-strategy-button">
                {isEditing ? "Save changes" : "Create strategy"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}