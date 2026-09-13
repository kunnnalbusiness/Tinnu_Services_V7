import { Fragment, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { LEVEL_STYLE } from "@/lib/botTypes";
import type { LogEntry, Strategy } from "@/lib/botTypes";
import { formatTime, useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";

export default function LogConsole({ logs, strategies, onClear }: { logs: LogEntry[]; strategies: Strategy[]; onClear: () => void }) {
  const { profile } = useProfile();
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowLive = useRef(true);
  const [selectedStrategy, setSelectedStrategy] = useState("all");

  // Newest logs now render at the top, so "following live" means staying
  // scrolled to the top of the list instead of the bottom.
  useEffect(() => {
    if (shouldFollowLive.current) {
      const container = logContainerRef.current;
      if (container) {
        container.scrollTop = 0;
      }
    }
  }, [logs]);

  useEffect(() => {
    if (selectedStrategy !== "all" && !strategies.some((strategy) => strategy.id === selectedStrategy)) {
      setSelectedStrategy("all");
    }
  }, [selectedStrategy, strategies]);

  const isCycleStart = (msg: string) => {
    return msg.includes("Pre-trade scan") || (msg.includes("Strategy") && msg.includes("armed"));
  };

  const displayMessage = (message: string): string => {
    const formatTime = (value: string, suffix = false): string => {
      const [hoursText, minutes] = value.split(":");
      const hours = Number(hoursText);
      if (!Number.isInteger(hours) || hours < 0 || hours > 23) return value;
      const period = hours >= 12 ? "pm" : "am";
      const hour12 = hours % 12 || 12;
      return `${String(hour12).padStart(2, "0")}:${minutes}${suffix ? period : ""}`;
    };

    // Keep persisted candle intervals readable, including old calculation artifacts.
    return message.replace(
      /(close time \(|Green \(|Red \()([0-9]{1,2}:[0-9]{2})(?: ?([AP]M|am|pm))?\s*-\s*([0-9]{1,2}:[0-9]{2})(?: ?([AP]M|am|pm))?(?:\s*=\s*([0-9]{1,2}:[0-9]{2})(?: ?([AP]M|am|pm))?)?/gi,
      (_match, prefix: string, start: string, startPeriod: string | undefined, end: string, endPeriod: string | undefined, calculated: string | undefined, calculatedPeriod: string | undefined) => {
        const startValue = startPeriod ? `${start}${startPeriod}` : formatTime(start);
        const endValue = endPeriod ? `${end}${endPeriod}` : formatTime(end);
        if (!calculated) return `${prefix}${startValue} - ${endValue}`;
        const calculatedValue = calculatedPeriod
          ? `${calculated}${calculatedPeriod}`
          : formatTime(calculated, true);
        return `${prefix}${startValue} - ${endValue} = ${calculatedValue}`;
      },
    );
  };

  const reasonFor = (log: LogEntry): string | null => {
    const message = log.message.toLowerCase();
    if (message.includes("not tradable") || message.includes("no usable inr-margin")) {
      return "Skipped: no active INR-margin contract is available for this pair.";
    }
    if (message.includes("candle closed flat") || message.includes("doji")) {
      return "Skipped: candle was flat, so no buy or sell direction was confirmed.";
    }
    if (message.includes("no candidate") || message.includes("no positive")) {
      return "Skipped: no eligible candle or positive mover matched this cycle.";
    }
    if (message.includes("timeout")) {
      return "Skipped: the allowed trigger or fill time expired.";
    }
    if (message.includes("cancelled") || message.includes("canceled")) {
      return "Skipped: order was not filled within its allowed window.";
    }
    if (message.includes("eliminated")) {
      return "Skipped: the candle sequence didn't match Green to Red, so this pair was eliminated for the cycle.";
    }
    if (message.includes("condition match")) {
      return "Signal detail: the required Green to Red candle sequence was confirmed.";
    }
    if (message.includes("pre-trade scan")) {
      return "Scan detail: candidates were ranked from the live CoinDCX market feed.";
    }
    if (log.level === "error") {
      return "Action detail: this step failed; the message above contains the exchange or API response.";
    }
    return null;
  };

  const presentationFor = (log: LogEntry) => {
    const message = displayMessage(log.message);
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes("pre-trade scan")) {
      return { label: "SCAN", body: message.replace(/^Pre-trade scan \([^)]*\):\s*/i, "Ranked feed: ") };
    }
    if (lowerMessage.includes("candle 1 (cn1)")) {
      return { label: "EVAL", body: message };
    }
    if (lowerMessage.includes("eliminated")) {
      return { label: "STATUS", body: message, status: "eliminated" as const };
    }
    if (lowerMessage.includes("condition match")) {
      const selectedPair = message.match(/Selected for (?:BUY|SELL) trade:\s*(.+?);\s*starting (?:1m|5m) trigger scan\.?$/i)?.[1];
      return {
        label: "MATCH",
        body: selectedPair
          ? `Selected for trade: ${selectedPair} | Starting 1m trigger scan.`
          : message.replace(/^Condition Match\s*-\s*/i, ""),
        status: "confirmed" as const,
      };
    }
    if (lowerMessage.includes("fetching ") && lowerMessage.includes("ohlc")) {
      return { label: "TRIGGER", body: message };
    }
    if (lowerMessage.includes("waiting for the") && lowerMessage.includes("candle to close")) {
      return { label: "WAIT", body: message };
    }
    return { label: log.level.toUpperCase(), body: message };
  };

  const visibleLogs = selectedStrategy === "all"
    ? logs
    : logs.filter((log) => log.strategy_id === selectedStrategy);

  // Render newest-first. A "cycle start" message is chronologically the
  // earliest entry of its cycle, so in this newest-on-top ordering it ends
  // up last within its group — the divider goes *after* it to separate that
  // cycle from the older one below.
  const orderedLogs = [...visibleLogs].reverse();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Event Log
          </span>
          <span className="num rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground" data-testid="log-count">
            {visibleLogs.length} events
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear all events"
          title="Clear all events"
          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold text-rose-500 hover:bg-rose-500/20 dark:text-rose-400 transition-colors"
        >
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </div>

      {/* Professional Segmented Strategy Tabs */}
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-card/50 p-2" role="tablist" aria-label="Strategy logs">
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
          <button
            type="button"
            role="tab"
            aria-selected={selectedStrategy === "all"}
            onClick={() => setSelectedStrategy("all")}
            className={cn(
              "shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all sm:text-[11px]",
              selectedStrategy === "all"
                ? "bg-background text-[#00c076] shadow-xs border border-border/80 font-bold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            All logs
          </button>
          {strategies.map((strategy) => {
            const active = selectedStrategy === strategy.id;
            const count = logs.filter((log) => log.strategy_id === strategy.id).length;
            return (
              <button
                key={strategy.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedStrategy(strategy.id)}
                className={cn(
                  "flex max-w-[200px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all sm:text-[11px]",
                  active
                    ? "bg-background text-[#00c076] shadow-xs border border-border/80 font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <span className="truncate">{strategy.name}</span>
                <span className={cn(
                  "num rounded-md px-1.5 py-0.5 text-[9px] font-bold",
                  active ? "bg-[#00c076]/15 text-[#00c076]" : "bg-muted text-muted-foreground"
                )}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-[42px_45px_minmax(0,1fr)] gap-1.5 border-b border-border bg-muted/50 px-2.5 py-1.5 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid-cols-[70px_65px_125px_minmax(0,1fr)] sm:gap-2.5 sm:px-3 sm:text-[10px]">
        <span className="truncate">Time</span>
        <span className="truncate">Level</span>
        <span className="hidden truncate sm:block">Strategy</span>
        <span className="min-w-0 truncate">Message & Reason</span>
      </div>

      <div
        ref={logContainerRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          const nearTop = element.scrollTop < 8;
          shouldFollowLive.current = nearTop;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 font-mono"
        data-testid="log-console"
        aria-live="polite"
      >
        {orderedLogs.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground" data-testid="log-empty-state">
            No events yet. Switch the bot on, or force-run a strategy to see signals here.
          </p>
        ) : (
          <div className="min-w-0">
            {orderedLogs.map((log, index) => {
              const showDividerAfter = isCycleStart(log.message) && index < orderedLogs.length - 1;
              const lowerMessage = log.message.toLowerCase();
              const presentation = presentationFor(log);
              const isLossTrade = log.level === "trade" && (
                lowerMessage.includes("stop loss hit") ||
                lowerMessage.includes("sl hit") ||
                lowerMessage.includes("loss")
              );
              const messageClass = isLossTrade ? "text-[#ff455b]" : LEVEL_STYLE[log.level];
              return (
                <Fragment key={log.id || index}>
                  <div
                    data-testid="log-line"
                    data-level={log.level}
                    className="grid min-w-0 grid-cols-[42px_45px_minmax(0,1fr)] items-start gap-1.5 border-b border-border/50 py-1.5 text-[8px] leading-relaxed hover:bg-muted/30 sm:grid-cols-[70px_65px_125px_minmax(0,1fr)] sm:gap-2.5 sm:text-[11px]"
                  >
                    <span className="shrink-0 text-muted-foreground">{formatTime(log.ts, profile.timezone)}</span>
                    <span className="shrink-0 font-semibold uppercase text-muted-foreground">[{log.level}]</span>
                    <span className="hidden min-w-0 truncate text-muted-foreground sm:block" title={log.strategy_name || ""}>
                      {log.strategy_name || "—"}
                    </span>
                    <div className="min-w-0 overflow-hidden">
                      <div className="flex min-w-0 items-start gap-1.5">
                        <span
                          className={cn(
                            "mt-0.5 inline-flex min-w-[46px] shrink-0 items-center border-l-2 px-1 text-[7px] font-bold tracking-[0.14em] sm:min-w-[52px] sm:px-1.5 sm:text-[9px]",
                            presentation.status === "eliminated"
                              ? "border-l-rose-500 text-rose-500 dark:text-rose-400"
                              : presentation.status === "confirmed"
                                ? "border-l-emerald-500 text-emerald-500 dark:text-emerald-400"
                                : "border-l-slate-400 text-slate-400 dark:border-l-slate-600 dark:text-slate-500",
                          )}
                        >
                          {presentation.label}
                        </span>
                        <span className={cn("min-w-0 flex-1 break-words whitespace-normal text-[8px] sm:text-[10px]", messageClass)}>
                          {log.strategy_name ? <span className="mr-1 text-muted-foreground sm:hidden">{log.strategy_name}:</span> : null}
                          {presentation.body}
                        </span>
                      </div>
                      {presentation.status === "eliminated" ? (
                        <div className="mt-1 border-l border-rose-500/40 pl-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-rose-500 dark:text-rose-400 sm:text-[10px]">
                          Status: sequence eliminated; only Green to Red qualifies.
                        </div>
                      ) : presentation.status === "confirmed" ? (
                        <div className="mt-1 border-l border-emerald-500/40 pl-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-emerald-500 dark:text-emerald-400 sm:text-[10px]">
                          Status: Green to Red confirmed; candidate match.
                        </div>
                      ) : reasonFor(log) ? (
                        <span className={cn(
                          "mt-1 block break-words whitespace-normal text-[8px] leading-relaxed sm:text-[10px]",
                          log.level === "error" ? "text-rose-500 dark:text-rose-400" : "text-amber-500 dark:text-amber-400",
                        )}>
                          {reasonFor(log)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {showDividerAfter && (
                    <div className="my-2.5 h-px w-full bg-border" role="separator" />
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
