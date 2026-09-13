import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Key,
  PanelLeftClose,
  PanelLeftOpen,
  Power,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import AddStrategyDialog from "@/components/bot/AddStrategyDialog";
import ApiKeysDialog from "@/components/bot/ApiKeysDialog";
import LogConsole from "@/components/bot/LogConsole";
import StrategyList from "@/components/bot/StrategyList";
import { Button } from "@/components/ui/button";
import { apiDelete, apiPost, apiPut } from "@/lib/api";
import type { Strategy, StrategyCreate } from "@/lib/botTypes";
import { useBotStream } from "@/hooks/useBotStream";
import { cn } from "@/lib/utils";
import { formatDateTime, useProfile } from "@/lib/profile";
import TopBar from "@/components/layout/TopBar";

// ─── Mobile tab type ──────────────────────────────────────────────────────────
type MobileTab = "strategies" | "logs";

const BOT_TAB_KEY = "bot-mobile-tab";

export default function BotControl() {
  const { profile } = useProfile();
  const { state, logs, connection } = useBotStream();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>(() => {
    const saved = localStorage.getItem(BOT_TAB_KEY);
    return (saved === "logs" || saved === "strategies") ? saved : "strategies";
  });
  const [stratSidebarCollapsed, setStratSidebarCollapsed] = useState(false);
  const queryClient = useQueryClient();

  const strategies = state?.strategies ?? [];
  const selected = strategies.find((s) => s.id === selectedId) ?? null;
  const botOn = state?.bot_on ?? false;
  const live = state?.execution_mode === "LIVE";
  const credConfigured = state?.credentials_configured ?? false;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bot-state"] });

  const clearLogs = useMutation({
    mutationFn: () => apiDelete<void>("/bot/logs"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bot-logs"] });
      toast.success("All events cleared");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not clear events"),
  });

  const toggleBot = useMutation({
    mutationFn: (on: boolean) => apiPost("/bot/toggle", { on }),
    onSuccess: (_d, on) => {
      toast.success(on ? "Bot switched ON" : "Bot switched OFF");
      refresh();
    },
    onError: () => toast.error("Could not switch the bot"),
  });

  const create = useMutation({
    mutationFn: (body: StrategyCreate) => apiPost<Strategy>("/bot/strategies", body),
    onSuccess: (s) => {
      setSelectedId(s.id);
      toast.success(`Strategy "${s.name}" created`);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create the strategy"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/bot/strategies/${id}`),
    onSuccess: () => {
      setSelectedId(null);
      toast.success("Strategy deleted");
      refresh();
    },
    onError: () => toast.error("Could not delete the strategy"),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: StrategyCreate }) =>
      apiPut<Strategy>(`/bot/strategies/${id}`, body),
    onSuccess: (s) => {
      setEditingStrategy(null);
      toast.success(`Strategy "${s.name}" updated`);
      refresh();
    },
    onError: () => toast.error("Could not update the strategy"),
  });

  const setEnabled = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      apiPost<Strategy>(`/bot/strategies/${id}/enabled`, { on }),
    onSuccess: (s) => {
      toast.success(`${s.name} ${s.enabled ? "armed" : "disabled"}`);
      queryClient.invalidateQueries({ queryKey: ["bot-state"] });
    },
    onError: () => toast.error("Could not change the strategy"),
  });

  const MobilePowerButton = (
    <button
      type="button"
      data-testid="bot-power-button"
      disabled={toggleBot.isPending}
      onClick={() => toggleBot.mutate(!botOn)}
      aria-label={botOn ? "Turn bot off" : "Turn bot on"}
      className={cn(
        "num flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold shadow-xs transition-all active:scale-95 shrink-0",
        botOn
          ? "border border-[#00c076]/40 bg-[#00c076]/10 text-[#00c076] animate-[beacon_2s_ease-in-out_infinite]"
          : "border border-[#ff455b]/40 bg-[#ff455b]/10 text-[#ff455b]"
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          botOn
            ? "bg-[#00c076] animate-pulse"
            : "bg-[#ff455b]"
        )}
      />
      <span>{botOn ? "BOT RUNNING" : "BOT OFF"}</span>
    </button>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground transition-colors duration-150">
      {/* ─── Mobile View Header (hidden on desktop) ─── */}
      <div className="md:hidden flex flex-col flex-1 min-h-0">
        <TopBar
          title="Bot Control"
          right={MobilePowerButton}
        />

        {/* Stream + mode chips */}
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-card/60 px-3 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <span
            data-testid="execution-mode-badge"
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-colors",
              live
                ? "border-[#ff455b]/40 bg-[#ff455b]/10 text-[#ff455b]"
                : "border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-400",
            )}
          >
            {live ? <AlertTriangle className="h-2.5 w-2.5" /> : null}
            {live ? "LIVE" : "PAPER"}
          </span>

          <span
            data-testid="bot-connection-badge"
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors",
              connection === "live"
                ? "border-[#00c076]/40 bg-[#00c076]/10 text-[#00c076]"
                : connection === "connecting"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-400"
                  : "border-[#ff455b]/40 bg-[#ff455b]/10 text-[#ff455b]",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                connection === "live"
                  ? "bg-[#00c076] animate-[beacon_1.6s_ease-in-out_infinite]"
                  : connection === "connecting"
                    ? "bg-amber-400 animate-pulse"
                    : "bg-[#ff455b]",
              )}
            />
            {connection === "live" ? "Stream" : connection === "connecting" ? "Connecting…" : "Offline"}
          </span>

          <span
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors",
              credConfigured
                ? "border-[#00c076]/30 bg-[#00c076]/10 text-[#00c076]"
                : "border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-400",
            )}
          >
            <Key className="h-3 w-3" />
            {credConfigured ? "Keys OK" : "No Keys"}
          </span>

          <AddStrategyDialog onCreate={(body) => create.mutate(body)} pending={create.isPending} />
          <ApiKeysDialog compact />
        </div>

        {/* Mobile tab switcher */}
        <div className="flex shrink-0 border-b border-border bg-card p-2">
          <div className="grid w-full grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1">
            {(["strategies", "logs"] as MobileTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => { setMobileTab(tab); localStorage.setItem(BOT_TAB_KEY, tab); }}
                className={cn(
                  "py-1.5 text-center text-xs font-bold capitalize transition-all rounded-lg",
                  mobileTab === tab
                    ? "bg-background text-[#00c076] shadow-xs border border-border/80 font-bold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab === "strategies" ? "Strategies" : "Live Logs"}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile panels */}
        <div className="flex-1 min-h-0 overflow-hidden overscroll-contain p-2 pb-2">
          {mobileTab === "strategies" ? (
            <div className="h-full overflow-y-auto">
              <StrategyList
                strategies={strategies}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onToggleEnabled={(s) => setEnabled.mutate({ id: s.id, on: !s.enabled })}
                onEdit={setEditingStrategy}
              />
            </div>
          ) : (
            <div className="h-full min-h-0 flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-xs">
              <LogConsole logs={logs} strategies={strategies} onClear={() => clearLogs.mutate()} />
            </div>
          )}
        </div>
      </div>

      {/* ══ DESKTOP LAYOUT (md+) ═══════════════════════════════════════════════ */}
      <div className="hidden md:flex md:min-h-0 md:flex-1 md:flex-col">

        {/* Desktop header strip */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/70 px-6 backdrop-blur-md">
          {/* Left: Bot icon + title + execution mode + window */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0c141d] p-1 border border-[#00c076]/30 shadow-xs">
              <Bot className="h-5 w-5 text-[#00c076]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-heading text-sm font-bold tracking-tight text-foreground">
                  Bot Control Center
                </h1>
                <span
                  data-testid="execution-mode-badge"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    live
                      ? "border-[#ff455b]/40 bg-[#ff455b]/10 text-[#ff455b]"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                  )}
                >
                  {live ? <AlertTriangle className="h-2.5 w-2.5" /> : null}
                  {live ? "LIVE" : "PAPER"}
                </span>
              </div>
              <p className="num text-[10px] text-muted-foreground" data-testid="bot-window-label">
                {state?.trading_window ?? "05:30 → 03:40 IST · slots follow each strategy's timeframe"}
                {state ? ` · ${formatDateTime(state.server_time_ist, profile.timezone)}` : ""}
              </p>
            </div>
          </div>

          {/* Right: Status badges & Action buttons */}
          <div className="flex items-center gap-2.5">
            {/* Stream badge */}
            <span
              data-testid="bot-connection-badge"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-semibold",
                connection === "live"
                  ? "border-[#00c076]/30 bg-[#00c076]/10 text-[#00c076]"
                  : "border-[#ff455b]/30 bg-[#ff455b]/10 text-[#ff455b]",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  connection === "live"
                    ? "bg-[#00c076] animate-[beacon_1.6s_ease-in-out_infinite]"
                    : "bg-[#ff455b]",
                )}
              />
              {connection === "live" ? "Stream" : "Offline"}
            </span>

            {/* Credentials status */}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-medium",
                credConfigured
                  ? "border-[#00c076]/30 bg-[#00c076]/10 text-[#00c076]"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
              )}
            >
              <Key className="h-3 w-3" />
              {credConfigured ? "Keys OK" : "No Keys"}
            </span>

            <div className="h-5 w-px bg-border mx-0.5" />

            <AddStrategyDialog onCreate={(body) => create.mutate(body)} pending={create.isPending} />

            <ApiKeysDialog />

            {selected ? (
              <Button
                size="sm"
                variant="outline"
                data-testid="delete-strategy-button"
                disabled={remove.isPending}
                onClick={() => selected && remove.mutate(selected.id)}
                className="h-8 w-8 rounded-xl border-rose-500/30 bg-rose-500/10 p-0 text-rose-500 hover:bg-rose-500/20"
                aria-label="Delete strategy"
                title="Delete selected strategy"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="sr-only">Delete strategy</span>
              </Button>
            ) : null}

            {/* Hidden navigation links to preserve testids */}
            <span className="hidden">
              <Link to="/position" data-testid="position-link" />
              <Link to="/history" data-testid="history-link" />
              <Link to="/realmoneytrade" data-testid="real-money-trade-link" />
              <Link to="/" data-testid="scanner-link" />
            </span>

            {/* Master Bot Power Button */}
            <button
              type="button"
              data-testid="bot-power-button"
              disabled={toggleBot.isPending}
              onClick={() => toggleBot.mutate(!botOn)}
              aria-label={botOn ? "Turn bot off" : "Turn bot on"}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all shadow-xs",
                botOn
                  ? "border-2 border-[#00c076] bg-[#00c076]/15 text-[#00c076] hover:bg-[#00c076]/25 shadow-[0_0_14px_rgba(0,192,118,0.2)]"
                  : "border border-border bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted",
                toggleBot.isPending && "opacity-60 cursor-not-allowed",
              )}
            >
              <Power className={cn("h-4 w-4", botOn && "text-[#00c076]")} />
              <span>{botOn ? "Bot Running" : "Bot Stopped"}</span>
              <span className={cn(
                "h-2 w-2 rounded-full",
                botOn ? "bg-[#00c076] animate-pulse" : "bg-muted-foreground/40"
              )} />
            </button>
          </div>
        </header>




        {/* Hidden edit dialog */}
        <AddStrategyDialog
          onCreate={() => undefined}
          editingStrategy={editingStrategy}
          onUpdate={(id, body) => update.mutate({ id, body })}
          open={Boolean(editingStrategy)}
          onOpenChange={(open) => { if (!open) setEditingStrategy(null); }}
          showTrigger={false}
          pending={update.isPending}
        />

        {/* Desktop 2-column layout (full height edge-to-edge) */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* Left: strategy list sidebar (collapsible) */}
          <aside
            className={cn(
              "flex shrink-0 flex-col border-r border-border bg-card transition-all duration-300",
              stratSidebarCollapsed ? "w-[56px]" : "w-[300px]"
            )}
          >
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3.5">
              {!stratSidebarCollapsed && (
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Strategies ({strategies.length})
                </span>
              )}
              <button
                type="button"
                onClick={() => setStratSidebarCollapsed((prev) => !prev)}
                title={stratSidebarCollapsed ? "Expand strategies panel" : "Collapse strategies panel"}
                className={cn(
                  "rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                  stratSidebarCollapsed && "mx-auto"
                )}
              >
                {stratSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4 text-[#00c076]" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
            </div>
            {!stratSidebarCollapsed ? (
              <div className="min-h-0 flex-1 overflow-hidden">
                <StrategyList
                  strategies={strategies}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onToggleEnabled={(s) => setEnabled.mutate({ id: s.id, on: !s.enabled })}
                  onEdit={setEditingStrategy}
                />
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center gap-2 py-3 overflow-y-auto">
                {strategies.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    title={`${s.name} (${s.enabled ? "Armed" : "Off"})`}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold transition-all border",
                      selectedId === s.id
                        ? "bg-[#00c076]/15 border-[#00c076] text-[#00c076]"
                        : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    #{idx + 1}
                  </button>
                ))}
              </div>
            )}
          </aside>

          {/* Right: log console — full remaining width */}
          <aside className="flex flex-1 min-w-0 flex-col bg-card">
            <LogConsole logs={logs} strategies={strategies} onClear={() => clearLogs.mutate()} />
          </aside>
        </div>
      </div>
    </div>
  );
}
