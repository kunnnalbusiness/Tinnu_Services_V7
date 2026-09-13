import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, Eye, EyeOff, KeyRound, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { CredentialStatus, CredentialValidation } from "@/lib/botTypes";
import { cn } from "@/lib/utils";

export default function ApiKeysDialog({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSecretInput, setShowSecretInput] = useState(false);
  const [validation, setValidation] = useState<CredentialValidation | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationDetailsOpen, setValidationDetailsOpen] = useState(false);
  const [editingCredentials, setEditingCredentials] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const [liveConfirmationOpen, setLiveConfirmationOpen] = useState(false);
  const autoValidationAttempted = useRef(false);
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: ["bot-credentials"],
    queryFn: () => apiGet<CredentialStatus>("/bot/credentials"),
    retry: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["bot-credentials"] });
    queryClient.invalidateQueries({ queryKey: ["bot-state"] });
  };

  const validateKeys = useMutation({
    mutationFn: (next?: { api_key?: string; api_secret?: string }) => {
      const payload =
        next && (next.api_key || next.api_secret)
          ? {
              api_key: next.api_key ?? "",
              api_secret: next.api_secret ?? "",
            }
          : {};
      return apiPost<CredentialValidation>("/bot/credentials/validate", payload);
    },
    onSuccess: (data) => {
      setValidation(data);
      setValidationError(null);
      setValidationDetailsOpen(false);
      setEditingCredentials(false);
      toast.success(data.message || "Credentials validated successfully");
      refresh();
    },
    onError: (err: any) => {
      setValidation(null);
      setValidationError(err?.message || "Credential validation failed");
      setValidationDetailsOpen(false);
      setEditingCredentials(false);
      toast.error(err?.message || "Credential validation failed");
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const cleanKey = apiKey.trim();
      const cleanSecret = apiSecret.trim();
      if (cleanKey.length < 8 || cleanSecret.length < 8) {
        throw new Error("API key and secret must each contain at least 8 characters");
      }
      return apiPost<CredentialStatus>("/bot/credentials", { api_key: cleanKey, api_secret: cleanSecret });
    },
    onSuccess: () => {
      setApiKey("");
      setApiSecret("");
      setValidation(null);
      setValidationError(null);
      setValidationDetailsOpen(false);
      setEditingCredentials(false);
      toast.success("API credentials encrypted and saved securely");
      refresh();
    },
    onError: (err: any) => {
      setValidation(null);
      setValidationError(err?.message || "Could not securely save the credentials");
      toast.error(err?.message || "Could not securely save the credentials");
    },
  });

  const remove = useMutation({
    mutationFn: () => apiDelete("/bot/credentials"),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["bot-credentials"] });
      const previousStatus = queryClient.getQueryData<CredentialStatus>(["bot-credentials"]);
      queryClient.setQueryData<CredentialStatus>(["bot-credentials"], {
        configured: false,
        api_key_masked: "",
        api_secret_masked: "",
        live_trading: false,
      });
      setValidation(null);
      setValidationError(null);
      setValidationDetailsOpen(false);
      setEditingCredentials(true);
      return { previousStatus };
    },
    onSuccess: () => {
      toast.success("Credentials removed — back to PAPER mode");
      refresh();
    },
    onError: (_error, _variables, context) => {
      if (context?.previousStatus) {
        queryClient.setQueryData(["bot-credentials"], context.previousStatus);
      }
      setEditingCredentials(false);
      toast.error("Could not remove the credentials");
    },
  });

  const setLive = useMutation({
    mutationFn: (on: boolean) => apiPost<CredentialStatus>("/bot/credentials/live", { on }),
    onSuccess: (data) => {
      toast[data.live_trading ? "warning" : "success"](
        data.live_trading ? "LIVE ORDERS enabled — real money at risk" : "Switched back to PAPER mode",
      );
      setValidation(null);
      setValidationDetailsOpen(false);
      setLiveConfirmationOpen(false);
      refresh();
    },
    onError: (err: any) => toast.error(err?.message || "Add a valid API key and secret before enabling live trading"),
  });

  const configured = status.data?.configured ?? false;
  const live = status.data?.live_trading ?? false;

  useEffect(() => {
    if (!open) {
      autoValidationAttempted.current = false;
      return;
    }
    if (configured && !autoValidationAttempted.current) {
      autoValidationAttempted.current = true;
      validateKeys.mutate({});
    }
  }, [open, configured]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            data-testid="api-keys-button"
            aria-label="API keys"
            title="API keys"
            className={cn(
              "flex items-center justify-center gap-1.5 border font-semibold transition-all shrink-0",
              configured
                ? "border-[#00c076]/30 bg-[#00c076]/10 text-[#00c076] hover:bg-[#00c076]/20 shadow-xs"
                : "border-border bg-background text-foreground hover:bg-muted",
              compact ? "h-7 rounded-full px-2.5 text-[11px]" : "h-8 rounded-xl px-3 text-xs",
            )}
          >
            <KeyRound className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            <span className={compact ? "inline" : "hidden sm:inline"}>API Keys</span>
          </Button>
        }
      />
      <DialogContent className="box-border max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] min-w-0 overflow-x-hidden overflow-y-auto border-border bg-card text-card-foreground shadow-2xl p-4 sm:w-full sm:max-w-md sm:p-6 rounded-2xl">
        <DialogHeader className="min-w-0 pr-6 space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#00c076]/30 bg-[#00c076]/10 text-[#00c076] shadow-xs">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="font-heading text-base font-bold tracking-tight text-foreground">
                CoinDCX API Access
              </DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground">
                Futures Trading API Key Management
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Step-by-step creation guidance banner */}
        <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2 text-[11px]">
          <div className="flex items-center justify-between font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5 text-[#00c076]" /> Create API Key
            </span>
            <a
              href="https://coindcx.com/api-dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="num text-[10px] text-[#00c076] hover:underline font-medium"
            >
              coindcx.com/api-dashboard ↗
            </a>
          </div>
          <p className="text-muted-foreground text-[10px] leading-relaxed">
            Generate a key with exact permissions. Keys are encrypted server-side & shown masked.
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px]">
            <span className="rounded-md border border-[#00c076]/30 bg-[#00c076]/10 px-2 py-0.5 font-semibold text-[#00c076]">
              ✓ Futures Trading
            </span>
            <span className="rounded-md border border-[#00c076]/30 bg-[#00c076]/10 px-2 py-0.5 font-semibold text-[#00c076]">
              ✓ Read Only
            </span>
            <span className="rounded-md border border-[#ff455b]/30 bg-[#ff455b]/10 px-2 py-0.5 font-semibold text-[#ff455b]">
              🚫 No Withdrawals
            </span>
          </div>
        </div>

        <div className="grid gap-3.5 py-1">
          {/* Status banner */}
          <div className="min-w-0 rounded-xl border border-border/80 bg-muted/30 p-3">
            <div className="flex items-center justify-between min-w-0 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", configured ? "bg-[#00c076] animate-pulse" : "bg-muted-foreground/50")} />
                <p className="num text-[11px] text-muted-foreground break-words truncate" data-testid="credentials-status">
                  {configured
                    ? `Key: ${status.data?.api_key_masked} · Secret: ${status.data?.api_secret_masked}`
                    : "No credentials stored — running in PAPER mode."}
                </p>
              </div>
              {configured ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingCredentials((prev) => !prev)}
                  className="h-6 px-2 text-[10px] shrink-0 text-muted-foreground hover:text-foreground border border-border/60"
                >
                  {editingCredentials ? "Cancel" : "Change"}
                </Button>
              ) : null}
            </div>
          </div>

          {/* Key and Secret Inputs */}
          {(!configured || editingCredentials) ? (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="api-key" className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>API Key</span>
                  <span className="text-[10px] font-normal text-muted-foreground">Required</span>
                </Label>
                <div className="relative flex items-center">
                  <KeyRound className="absolute left-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="api-key"
                    data-testid="api-key-input"
                    value={apiKey}
                    autoComplete="off"
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={configured ? "enter new API key to replace" : "paste your API key"}
                    className="num min-w-0 w-full pl-9 h-10 border-border bg-background text-foreground text-xs font-mono focus-visible:ring-1 focus-visible:ring-[#00c076] focus-visible:border-[#00c076]"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="api-secret" className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>API Secret</span>
                  <span className="text-[10px] font-normal text-muted-foreground">Required</span>
                </Label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="api-secret"
                    data-testid="api-secret-input"
                    type={showSecretInput ? "text" : "password"}
                    autoComplete="off"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder={configured ? "enter new API secret to replace" : "paste your API secret"}
                    className="num min-w-0 w-full pl-9 pr-9 h-10 border-border bg-background text-foreground text-xs font-mono focus-visible:ring-1 focus-visible:ring-[#00c076] focus-visible:border-[#00c076]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecretInput(!showSecretInput)}
                    className="absolute right-3 text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label={showSecretInput ? "Hide API secret" : "Show API secret"}
                  >
                    {showSecretInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Mode Switch Card */}
          <div
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors shadow-xs",
              live ? "border-[#ff455b]/40 bg-[#ff455b]/10" : "border-border bg-card/60",
            )}
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5", live ? "bg-[#ff455b]/20 text-[#ff455b]" : "bg-[#00c076]/15 text-[#00c076]")}>
                {live ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">
                  {live ? "Live Real-Money Mode" : "Paper Simulation Mode"}
                </p>
                <p className="text-[10px] leading-snug text-muted-foreground mt-0.5">
                  {live
                    ? "Real orders will be placed with real money on CoinDCX."
                    : "Every fill is simulated. Enable live trading only when you are ready."}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant={live ? "destructive" : "secondary"}
              data-testid="live-trading-toggle"
              disabled={setLive.isPending || (!configured && !live) || (!validation?.live_ready && !live)}
              onClick={() => {
                if (!live) {
                  setLiveConfirmationOpen(true);
                  return;
                }
                setLive.mutate(false);
              }}
              className={cn("h-8 px-3 text-xs font-bold shrink-0 shadow-xs", !live && "bg-[#00c076]/15 text-[#00c076] border border-[#00c076]/30 hover:bg-[#00c076]/25")}
            >
              {live ? "Go paper" : "Go live"}
            </Button>
          </div>

          {/* Validation info accordion */}
          {validation && (
            <div className="rounded-xl border border-[#00c076]/30 bg-[#00c076]/[0.08] text-[11px] text-foreground">
              <button
                type="button"
                onClick={() => setValidationDetailsOpen((value) => !value)}
                aria-expanded={validationDetailsOpen}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[#00c076]">Validation status</span>
                  <span className="mt-0.5 block break-words text-[10px] text-muted-foreground">{validation.message}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={cn("font-semibold text-[10px] rounded px-2 py-0.5 border", validation.live_ready ? "bg-[#00c076]/15 text-[#00c076] border-[#00c076]/30" : "bg-[#ff455b]/15 text-[#ff455b] border-[#ff455b]/30")}>
                    {validation.live_ready ? "Ready" : "Blocked"}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", validationDetailsOpen && "rotate-180")} />
                </span>
              </button>
              {validationDetailsOpen ? (
                <div className="grid gap-1.5 border-t border-[#00c076]/20 px-3 py-2.5 text-muted-foreground sm:grid-cols-2 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <span>INR balance: {showBalance ? `₹${Number(validation.wallet_balance_inr || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "••••••"}</span>
                    <button type="button" onClick={() => setShowBalance((value) => !value)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label={showBalance ? "Hide INR balance" : "Show INR balance"} title={showBalance ? "Hide INR balance" : "Show INR balance"}>
                      {showBalance ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div>Active instruments: {validation.active_instruments_count}</div>
                  <div>Open positions: {validation.open_positions_count}</div>
                  <div>USDT/INR: ₹{Number(validation.usdt_inr_rate || 0).toLocaleString("en-IN", { maximumFractionDigits: 4 })}</div>
                </div>
              ) : null}
            </div>
          )}

          {validationError ? (
            <div className="rounded-xl border border-[#ff455b]/30 bg-[#ff455b]/10 p-3 text-[11px] text-[#ff455b]">
              <p className="font-bold">Validation failed</p>
              <p className="mt-1 break-words leading-relaxed text-foreground">{validationError}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Check key permissions, futures access, INR wallet, and request details in Real Money Trade Response.</p>
            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        <DialogFooter className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {configured ? (
              <Button
                size="sm"
                variant="ghost"
                data-testid="delete-credentials-button"
                onClick={() => {
                  setValidation(null);
                  remove.mutate();
                }}
                className="h-9 px-2 text-xs font-semibold text-[#ff455b] hover:text-[#ff455b] hover:bg-[#ff455b]/10"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove keys
              </Button>
            ) : null}
            {configured && !editingCredentials ? (
              <Button
                size="sm"
                variant="outline"
                data-testid="validate-credentials-button"
                disabled={validateKeys.isPending}
                onClick={() => validateKeys.mutate({})}
                className="h-9 px-3 text-xs font-semibold border-border"
              >
                Validate credentials
              </Button>
            ) : null}
          </div>

          {(!configured || editingCredentials) ? (
            <Button
              size="default"
              data-testid="save-credentials-button"
              disabled={save.isPending || apiKey.trim().length < 8 || apiSecret.trim().length < 8}
              onClick={() => save.mutate()}
              className="h-10 w-full sm:w-auto px-5 bg-[#00c076] hover:bg-[#00b06c] text-slate-950 font-bold text-xs shadow-md shadow-[#00c076]/20 transition-all rounded-xl"
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Save credentials
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>

      <Dialog open={liveConfirmationOpen} onOpenChange={setLiveConfirmationOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[360px] border-border bg-card text-card-foreground shadow-2xl p-4 sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#ff455b] font-heading font-bold text-base">
              <AlertTriangle className="h-5 w-5 shrink-0 text-[#ff455b]" />
              Enable live orders?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
              Real CoinDCX orders will use real money. Confirm that your API key has only Read and Futures Trading permissions, with withdrawals disabled.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-[#ff455b]/30 bg-[#ff455b]/10 p-3 text-xs leading-relaxed text-foreground">
            Check the pair, capital limit, leverage, take-profit and stop-loss settings before continuing.
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 p-0 pt-2 sm:flex sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setLiveConfirmationOpen(false)} className="h-9 text-xs font-semibold">
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={setLive.isPending}
              onClick={() => {
                setLiveConfirmationOpen(false);
                setLive.mutate(true);
              }}
              className="h-9 text-xs font-bold"
            >
              Enable live orders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
