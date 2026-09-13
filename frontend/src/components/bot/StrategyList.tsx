import { Maximize2, Minimize2, Pencil, Power, Trash2 } from "lucide-react";
import { useState } from "react";
import { STATUS_STYLE } from "@/lib/botTypes";
import type { Strategy } from "@/lib/botTypes";
import { cn } from "@/lib/utils";

export default function StrategyList({
  strategies,
  selectedId,
  onSelect,
  onToggleEnabled,
  onEdit,
}: {
  strategies: Strategy[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleEnabled: (strategy: Strategy) => void;
  onEdit: (strategy: Strategy) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm",
      expanded && "h-[clamp(360px,62vh,680px)] lg:h-full",
    )}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5 sm:px-4 sm:py-3">
        <h2 className="font-heading text-xs font-bold text-foreground sm:text-sm">Strategies</h2>
        <div className="flex items-center gap-1.5">
          <span className="num text-[10px] text-muted-foreground sm:text-xs" data-testid="strategy-count">
            {strategies.length} configured
          </span>
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse strategies" : "Expand strategies"}
            title={expanded ? "Collapse strategies" : "Expand strategies"}
            onClick={() => setExpanded((value) => !value)}
            className="grid h-6 w-6 place-items-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-2.5">
        {strategies.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground" data-testid="strategy-empty-state">
            No strategies yet — use “Add Strategy” to create one.
          </p>
        ) : (
          <ul className="grid w-full content-start self-start grid-cols-2 gap-1.5 sm:gap-2 sm:grid-cols-1">
            {strategies.map((s, index) => {
              const style = STATUS_STYLE[s.status];
              const selected = s.id === selectedId;
              return (
                <li key={s.id} className="min-w-0">
                  <div
                    data-testid="strategy-card"
                    data-strategy-id={s.id}
                    data-selected={selected}
                    onClick={() => onSelect(s.id)}
                    className={cn(
                      "flex h-full min-h-[150px] w-full cursor-pointer flex-col rounded-xl border p-2 text-left transition-all duration-150 sm:min-h-[160px] sm:p-2.5 shadow-xs",
                      selected
                        ? "border-[#00c076]/50 bg-[#00c076]/[0.08] shadow-xs ring-1 ring-[#00c076]/30"
                        : "border-border bg-card/60 hover:bg-muted/40 hover:border-border/80",
                    )}
                  >
                      <div className="flex items-start gap-1.5">
                        <span className="mt-0.5 text-[10px] font-bold text-primary">#{index + 1}</span>
                        <span className="min-w-0 flex-1 font-heading text-xs font-bold text-foreground truncate" data-testid="strategy-name">
                          {s.name}
                        </span>
                        <span
                          role="switch"
                          aria-checked={s.enabled}
                          tabIndex={0}
                          data-testid="strategy-enable-toggle"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleEnabled(s);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              onToggleEnabled(s);
                            }
                          }}
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold transition-colors duration-150",
                            s.enabled
                              ? "bg-[#00c076]/15 text-[#00c076] border border-[#00c076]/30"
                              : "bg-muted text-muted-foreground hover:text-foreground border border-border",
                          )}
                        >
                          <Power className="h-2.5 w-2.5" />
                          {s.enabled ? "ARMED" : "OFF"}
                        </span>
                      </div>

                      {/* Status & Strategy Type Badges */}
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <span data-testid="strategy-status" className={cn("rounded-md px-1.5 py-0.5 text-[8px] font-bold", style.className)}>
                          {style.label}
                        </span>
                        <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[8px] font-semibold text-foreground" data-testid="strategy-timeframe">
                          {s.timeframe}
                        </span>
                        {s.custom_coins && s.custom_coins.length > 0 ? (
                          <span className="rounded-md border border-[#00c076]/40 bg-[#00c076]/10 px-1.5 py-0.5 text-[8px] font-bold text-[#00c076]">
                            Coins: {s.custom_coins.slice(0, 3).join(", ")}{s.custom_coins.length > 3 ? ` +${s.custom_coins.length - 3}` : ""}
                          </span>
                        ) : (
                          <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[8px] font-semibold text-foreground">
                            {s.coin_pick.replace("top4_", "Top4 ").replace("top_", "Top ").replaceAll("_", " ").toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Structured Parameters 2x2 Grid */}
                      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[9px]">
                        <div className="rounded-lg border border-border/80 bg-background/80 p-1.5">
                          <span className="block text-[8px] uppercase tracking-wider text-muted-foreground">Capital</span>
                          <span className="num font-bold text-foreground">₹{s.capital_cap_inr.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="rounded-lg border border-border/80 bg-background/80 p-1.5">
                          <span className="block text-[8px] uppercase tracking-wider text-muted-foreground">Leverage</span>
                          <span className="num font-bold text-foreground">
                            {s.cycle_leverages && s.cycle_leverages.length > 0
                              ? s.cycle_leverages.map(l => `${l}x`).join("-")
                              : `${s.leverage}x`}
                          </span>
                        </div>
                        <div className="rounded-lg border border-border/80 bg-background/80 p-1.5">
                          <span className="block text-[8px] uppercase tracking-wider text-muted-foreground">TP / SL</span>
                          <span className="num font-bold text-foreground">
                            <span className="text-[#00c076]">{s.tp_pct}%</span> / <span className="text-[#ff455b]">{s.sl_pct && Number(s.sl_pct) > 0 ? `${s.sl_pct}%` : "Candle SL"}</span>
                          </span>
                        </div>
                        <div className="rounded-lg border border-border/80 bg-background/80 p-1.5">
                          <span className="block text-[8px] uppercase tracking-wider text-muted-foreground">Daily limit</span>
                          <span className="num font-bold text-foreground" data-testid="strategy-trades-today">
                            {s.trades_today}/{s.max_trades_per_day} trades
                          </span>
                        </div>
                      </div>

                      {/* Next slot or details */}
                      {s.next_slot_ist ? (
                        <div className="mt-1.5 flex items-center justify-between text-[8px] text-muted-foreground">
                          <span>Next check:</span>
                          <span className="num font-medium text-foreground">{s.next_slot_ist}</span>
                        </div>
                      ) : null}

                      {s.open_pair ? (
                        <div className="mt-1.5 rounded-lg border border-border bg-muted/50 px-2 py-1 text-[8px] text-foreground">
                          <span className={s.open_side === "buy" ? "text-[#00c076] font-bold" : "text-[#ff455b] font-bold"}>
                            {s.open_side === "buy" ? "LONG" : "SHORT"} {s.open_pair}
                          </span>{" "}
                          <span className="num text-muted-foreground">@ {s.entry_price?.toFixed(4)} → TP {s.tp_price?.toFixed(4)}</span>
                          {s.sl_price ? <span className="num text-muted-foreground"> / SL {s.sl_price.toFixed(4)}</span> : null}
                        </div>
                      ) : null}

                      <div className="mt-auto flex items-center gap-1.5 pt-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(s);
                          }}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[9px] font-semibold text-foreground shadow-2xs hover:bg-muted transition-colors"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(s.id);
                            if (typeof window !== "undefined") {
                              const deleteButton = document.querySelector(
                                `[data-testid="delete-strategy-button"]`,
                              ) as HTMLButtonElement | null;
                              deleteButton?.click();
                            }
                          }}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[9px] font-semibold text-rose-500 shadow-2xs hover:bg-rose-500/20 dark:text-rose-400 transition-colors"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                          Delete
                        </button>
                      </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
