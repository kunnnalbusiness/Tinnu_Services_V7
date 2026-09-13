import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { CalendarDays, Check, ChevronDown, ChevronRight, Eye, EyeOff, FileJson, Globe2, LockKeyhole, Mail, Phone, Shield, Sparkles, UserRound, WifiOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import ApiKeysDialog from "@/components/bot/ApiKeysDialog";
import ModernLoginPage from "@/pages/LoginPage";
import { ProfileProvider, TIMEZONE_OPTIONS, timezoneSummary, useProfile } from "@/lib/profile";
import Sidebar from "@/components/layout/Sidebar";
import BottomNav from "@/components/layout/BottomNav";
import TopBar from "@/components/layout/TopBar";
import { useBotStream } from "@/hooks/useBotStream";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TodaySummary } from "@/lib/botTypes";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const BotControl = lazy(() => import("@/pages/BotControl"));
const TradeHistory = lazy(() => import("@/pages/TradeHistory"));
const PositionMonitor = lazy(() => import("@/pages/PositionMonitor"));
const HistoricalTesting = lazy(() => import("@/pages/HistoricalTesting"));
const RealMoneyTrade = lazy(() => import("@/pages/RealMoneyTrade"));

function RouteLoading() {
  return (
    <div className="grid min-h-[calc(100dvh-4.5rem)] place-items-center bg-[var(--background)] px-6">
      <div className="w-full max-w-xs space-y-3" aria-label="Loading workspace">
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-800" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-800/80" />
        <div className="h-32 animate-pulse rounded-xl bg-slate-800/60" />
      </div>
    </div>
  );
}

function NetworkNotice() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  if (online) return null;
  return (
    <div className="fixed inset-x-3 top-3 z-[60] mx-auto flex max-w-md items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-card/95 px-3.5 py-2 text-xs text-foreground shadow-lg backdrop-blur-md" role="status">
      <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span>Connection weak hai. Reconnecting in background...</span>
    </div>
  );
}

function RabbitIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M19 17c-3 0-5 2-5 6 0 3 1 5 2 7l-5 1c-4 1-5 5-3 8l3 5c2 3 5 5 9 5h6l2-5-4-10 8-4 14 2 5 8 4 5h9c4 0 7-3 7-7 0-2-1-4-3-5l-7-5-2-8c-1-4-4-7-8-8l-11-3-7 4-2-5c-1-2-3-4-6-4h-5z" fill="#2d1b52"/>
      <circle cx="27" cy="26" r="4" fill="#f6efe7"/>
      <circle cx="41" cy="26" r="4" fill="#f6efe7"/>
      <circle cx="28" cy="26" r="1.6" fill="#1f2937"/>
      <circle cx="40" cy="26" r="1.6" fill="#1f2937"/>
      <path d="M31 35c2 2 5 2 8 0" stroke="#1f2937" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <path d="M37 13l8-8m-18 0l-8 8" stroke="#2d1b52" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

function RabbitArtwork() {
  return (
    <svg viewBox="0 0 700 720" role="img" aria-label="Vanta mascot illustration" style={{ width: "100%", height: "100%" }}>
      <path d="M120 550c70-140 120-194 197-216 76-22 148-16 193 8 116 60 164 169 200 265H120z" fill="#f2c0b5" opacity="0.22"/>
      <path d="M470 75c53 8 102 37 134 86 46 70 44 158 8 234-28 59-80 100-149 109-63 8-123-21-169-69-60-61-90-158-68-245 22-90 103-127 244-115z" fill="#2b1a53"/>
      <path d="M350 92c62-6 102 19 111 64 9 45-7 71-45 98-38 27-88 31-142 18-53-14-77-42-75-80 2-38 33-89 151-100z" fill="#2b1a53"/>
      <path d="M303 64c18-36 70-53 120-43 63 13 110 52 123 107 14 58-8 113-60 147-39 26-82 36-128 29-64-10-98-60-100-128-2-42 9-80 45-112z" fill="#2b1a53"/>
      <path d="M429 168c19-13 35-14 53 1 18 15 18 35 10 55-10 25-40 39-66 31-27-8-38-32-31-57 7-23 24-30 34-30z" fill="#f8efe9"/>
      <path d="M274 168c18-16 35-15 53-2 18 12 25 31 19 52-7 28-31 46-60 47-29 0-54-20-57-51-2-20 15-40 45-46z" fill="#f8efe9"/>
      <circle cx="353" cy="228" r="16" fill="#f8efe9"/>
      <circle cx="448" cy="228" r="16" fill="#f8efe9"/>
      <circle cx="354" cy="228" r="5" fill="#24163d"/>
      <circle cx="449" cy="228" r="5" fill="#24163d"/>
      <path d="M392 261c12 9 26 9 39 0" stroke="#24163d" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <path d="M390 249c-15 21-39 29-60 28" stroke="#24163d" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <path d="M443 250c19 15 41 23 66 19" stroke="#24163d" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <ellipse cx="395" cy="322" rx="101" ry="92" fill="#2b1a53"/>
      <ellipse cx="400" cy="405" rx="113" ry="140" fill="#2b1a53"/>
      <path d="M309 383c-10 22-16 47-15 74 1 44 32 81 76 93 43 12 89-2 121-40 32-38 42-90 26-136-17-48-62-82-109-79-59 3-92 35-99 88z" fill="#2b1a53"/>
      <path d="M343 512c-54 39-101 97-94 164 9 87 119 144 216 135 72-7 149-61 174-129 26-70-10-143-84-182-59-31-147-17-212 12z" fill="#f3efe9"/>
      <path d="M371 549c18 16 37 27 61 30 28 4 52-6 72-25 21-19 28-44 31-75 2 33 5 69-16 99-25 35-61 52-102 52-49 0-91-31-101-77-8-35 6-69 26-97 16 25 20 53 29 93z" fill="#f3efe9"/>
      <circle cx="457" cy="571" r="42" fill="#f3efe9"/>
      <path d="M486 571c15 6 34 17 46 34" stroke="#2b1a53" strokeWidth="6" strokeLinecap="round" fill="none"/>
      <path d="M357 595c-34 1-62 21-76 52" stroke="#2b1a53" strokeWidth="6" strokeLinecap="round" fill="none"/>
      <path d="M433 594c19 88 91 155 170 175" stroke="#2b1a53" strokeWidth="7" strokeLinecap="round" fill="none"/>
      <path d="M423 621c19 64 48 122 111 163" stroke="#2b1a53" strokeWidth="7" strokeLinecap="round" fill="none"/>
      <path d="M232 229c-50 0-96 28-127 74-39 57-44 132-12 192 30 58 90 98 157 102 85 6 165-50 201-134 14-33 20-68 18-103-3-62-29-118-75-154-53-42-116-52-162-15z" fill="#2b1a53" opacity="0.92"/>
      <ellipse cx="310" cy="427" rx="110" ry="117" fill="#f3efe9"/>
      <path d="M278 418c-18 5-31 23-31 42 1 32 28 58 60 58 36 0 63-30 62-69-1-15-9-31-22-41-8-6-23-10-35-9-12 1-24 7-34 19z" fill="#f3efe9"/>
      <path d="M302 383c0-25 20-45 45-45s46 20 46 45v18c0 5-4 10-9 10h-74c-6 0-8-5-8-10v-18z" fill="#2b1a53"/>
      <path d="M293 430c25 8 48 8 76 0" stroke="#24163d" strokeWidth="6" strokeLinecap="round" fill="none"/>
      <circle cx="305" cy="462" r="4" fill="#24163d"/>
      <circle cx="369" cy="462" r="4" fill="#24163d"/>
      <path d="M286 480c17 16 38 25 57 24 18 0 38-7 55-24" stroke="#24163d" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <circle cx="409" cy="204" r="25" fill="#f3efe9"/>
      <circle cx="267" cy="204" r="25" fill="#f3efe9"/>
    </svg>
  );
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
      });

      if (!res.ok) {
        throw new Error("Invalid email or password");
      }

      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <style>{`
        .login-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          background: #f5f4f2;
          color: #1f1b2e;
          font-family: "Inter", "Segoe UI", sans-serif;
        }

        .login-left {
          padding: 22px 0 0 32px;
          display: flex;
          flex-direction: column;
        }

        .login-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 800;
          font-size: 15px;
          margin-bottom: 32px;
        }

        .login-content {
          margin-left: 60px;
          max-width: 430px;
        }

        .login-card {
          background: rgba(255,255,255,0.62);
          border: 1px solid rgba(32, 24, 48, 0.14);
          border-radius: 16px;
          box-shadow: 0 12px 36px rgba(41, 24, 62, 0.08);
          padding: 18px 18px 16px;
          max-width: 400px;
        }

        .login-form {
          display: grid;
          gap: 14px;
        }

        .login-input {
          width: 100%;
          border: 1px solid rgba(33, 27, 49, 0.18);
          background: rgba(255,255,255,0.75);
          border-radius: 10px;
          padding: 14px 16px;
          font-size: 16px;
          color: #1f1b2e;
          outline: none;
          box-sizing: border-box;
        }

        .login-right {
          position: relative;
          overflow: hidden;
          background: #f36a5d;
        }

        .login-right::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(0,0,0,0.02));
        }

        .login-right::after {
          content: "";
          position: absolute;
          inset: 0 0 0 0;
          clip-path: polygon(18% 0%, 100% 0%, 100% 100%, 0% 100%);
          background: rgba(255,255,255,0.06);
        }

        .login-illustration-wrap {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
        }

        .login-illustration {
          width: min(72vw, 620px);
          height: min(82vh, 620px);
        }

        @media (max-width: 768px) {
          .login-shell {
            grid-template-columns: 1fr;
          }

          .login-left {
            padding: 20px 16px 0;
          }

          .login-brand {
            margin-bottom: 28px;
            justify-content: center;
          }

          .login-content {
            margin-left: 0;
            max-width: none;
          }

          .login-card {
            max-width: none;
            padding: 18px 14px 16px;
          }

          .login-right {
            min-height: 260px;
            max-height: 300px;
          }

          .login-illustration-wrap {
            padding: 20px;
          }

          .login-illustration {
            width: min(82vw, 420px);
            height: min(36vh, 260px);
          }

          .login-form button {
            font-size: 16px;
          }
        }
      `}</style>

      <div className="login-shell">
        <div className="login-left">
          <div className="login-brand">
            <RabbitIcon />
            <span>Minnu Services</span>
          </div>

          <div className="login-content">
            <h1 style={{ margin: "0 0 28px", fontSize: "clamp(2rem, 4vw, 3.5rem)", lineHeight: 1, letterSpacing: "-0.03em", fontWeight: 800 }}>
              Welcome back!
            </h1>

            <div className="login-card">
              <form onSubmit={handleSubmit} className="login-form">
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1c1830" }}>Sign in to Minnu Services</h2>

                <label style={{ display: "grid", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "#2c2a3d", fontWeight: 600 }}>Enter your email address</span>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin"
                    autoFocus
                    className="login-input"
                  />
                </label>

                <label style={{ display: "grid", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "#2c2a3d", fontWeight: 600 }}>Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="login-input"
                  />
                </label>

                {error ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div> : null}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    marginTop: 6,
                    border: "none",
                    borderRadius: 10,
                    padding: "11px 14px",
                    background: "linear-gradient(135deg, #7e4dd7, #5a3ab9)",
                    color: "white",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    opacity: isSubmitting ? 0.8 : 1,
                    boxShadow: "0 10px 18px rgba(103, 81, 170, 0.25)",
                  }}
                >
                  {isSubmitting ? "Signing in..." : "Continue with email"}
                </button>
              </form>

              <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, color: "#433d58" }}>
                <span>Don't have an account? <a href="#" style={{ color: "#2d1b52", textDecoration: "none", fontWeight: 700 }}>Contact us.</a></span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(36, 29, 50, 0.15)", borderRadius: 8, padding: "8px 12px", background: "rgba(255,255,255,0.52)" }}>
                  <Globe2 size={14} aria-hidden="true" />
                  <span style={{ fontSize: 12 }}>US</span>
                  <ChevronDown size={13} aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="login-right">
          <div className="login-illustration-wrap">
            <div className="login-illustration">
              <RabbitArtwork />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

void LoginPage;

type AppTheme = "dark" | "light";

const THEME_STORAGE_KEY = "app-theme";
const TRADING_OVERVIEW_KEY = "trading-overview";

const getSavedTheme = (): AppTheme => {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    // ignore storage errors and fall back to dark mode
  }
  return "dark";
};


function ProfilePage({ theme, setTheme }: { theme: AppTheme; setTheme: React.Dispatch<React.SetStateAction<AppTheme>> }) {
  const { profile, saveProfile } = useProfile();
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showSensitiveInfo, setShowSensitiveInfo] = useState(false);
  const [showPerformanceInfo, setShowPerformanceInfo] = useState(false);
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);
  const { state: botState } = useBotStream();

  const todaySummary = useQuery({
    queryKey: ["bot-history-today-profile"],
    queryFn: () => apiGet<TodaySummary>("/bot/history/today"),
    refetchInterval: 10000,
    retry: false,
  });

  const tradesList = todaySummary.data?.trades ?? [];
  const totalTrades = todaySummary.data?.trades_done ?? tradesList.length;
  const winningTrades = tradesList.filter((t) => ((t.partial_booked_pnl_inr ?? 0) + (t.pnl_inr ?? 0)) > 0).length;
  const winRate = totalTrades > 0 ? Math.round((winningTrades / totalTrades) * 100) : 0;

  const [formData, setFormData] = useState({
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    age: profile.age,
  });

  useEffect(() => {
    setFormData({
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      age: profile.age,
    });
  }, [profile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveProfile({
      ...profile,
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      age: formData.age.trim(),
    });
    toast.success("Profile details updated successfully");
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      // ignore
    }
    localStorage.removeItem(TRADING_OVERVIEW_KEY);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    setTheme("dark");
    window.location.assign("/login");
  };

  const handleThemeToggle = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  const handleChangeTimezone = (tz: string) => {
    void saveProfile({ ...profile, timezone: tz });
  };

  const displayName = profile.name.trim() || "User Administrator";
  const displayEmail = profile.email.trim() || "admin@scalpingbot.internal";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";

  const timezone = timezoneSummary(profile.timezone);
  const credConfigured = botState?.credentials_configured ?? false;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground transition-colors duration-150 pb-24 md:pb-8">
      {/* Mobile TopBar */}
      <div className="md:hidden">
        <TopBar title="Profile & Settings" />
      </div>

      {/* Desktop Header */}
      <header className="hidden md:flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/70 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-background text-[#00c076]">
            <UserRound className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="font-heading text-sm font-bold text-foreground">User Profile & Account</h1>
            <p className="text-[11px] text-muted-foreground">Manage personal details, API keys, and system preferences</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
              credConfigured
                ? "border-[#00c076]/40 bg-[#00c076]/10 text-[#00c076]"
                : "border-amber-500/40 bg-amber-500/10 text-amber-500"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", credConfigured ? "bg-[#00c076] animate-pulse" : "bg-amber-500")} />
            {credConfigured ? "CoinDCX Connected" : "Paper Mode (No Keys)"}
          </span>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full space-y-6">
        {/* Profile Hero Header Card */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-xs">
          <div className="absolute top-0 right-0 h-32 w-64 bg-gradient-to-l from-[#00c076]/10 via-transparent to-transparent pointer-events-none" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center rounded-2xl border-2 border-[#00c076]/40 bg-[#00c076]/15 text-xl font-bold text-[#00c076] shadow-md shadow-[#00c076]/10">
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-xl font-bold text-foreground">
                    {displayName}
                  </h2>
                  <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                    Admin Operator
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {displayEmail}
                </p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5 text-[#00c076]" /> Session Secured</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Globe2 className="h-3.5 w-3.5" /> {timezone.offset} ({profile.timezone || "IST"})</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <ApiKeysDialog compact />
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-bold text-red-500 transition hover:bg-red-500/20"
              >
                <LockKeyhole className="h-3.5 w-3.5" />
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* 2-Column Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Personal Information Form */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#00c076]/10 text-[#00c076]">
                    <UserRound className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-heading text-sm font-bold text-foreground">Personal Information</h3>
                    <p className="text-[11px] text-muted-foreground">Update your identity and account contact details</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSensitiveInfo((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                  title={showSensitiveInfo ? "Blur details" : "Click to reveal details"}
                >
                  {showSensitiveInfo ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-[#00c076]" />}
                  <span className="text-[11px]">{showSensitiveInfo ? "Blur Info" : "Reveal Info"}</span>
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Full Name</label>
                  <div
                    onClick={() => !showSensitiveInfo && setShowSensitiveInfo(true)}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-2.5 focus-within:border-[#00c076] transition-colors"
                  >
                    <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      value={formData.name}
                      onFocus={() => setShowSensitiveInfo(true)}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Rahul Sharma"
                      className={cn(
                        "w-full bg-transparent text-sm font-medium outline-none text-foreground placeholder:text-muted-foreground/50 transition-all duration-200",
                        !showSensitiveInfo && "blur-xs select-none cursor-pointer"
                      )}
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowSensitiveInfo((prev) => !prev); }}
                      className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
                    >
                      {showSensitiveInfo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 text-[#00c076]" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Email Address</label>
                  <div
                    onClick={() => !showSensitiveInfo && setShowSensitiveInfo(true)}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-2.5 focus-within:border-[#00c076] transition-colors"
                  >
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <input
                      type="email"
                      value={formData.email}
                      onFocus={() => setShowSensitiveInfo(true)}
                      onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="admin@example.com"
                      className={cn(
                        "w-full bg-transparent text-sm font-medium outline-none text-foreground placeholder:text-muted-foreground/50 transition-all duration-200",
                        !showSensitiveInfo && "blur-xs select-none cursor-pointer"
                      )}
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowSensitiveInfo((prev) => !prev); }}
                      className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
                    >
                      {showSensitiveInfo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 text-[#00c076]" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Phone Number</label>
                    <div
                      onClick={() => !showSensitiveInfo && setShowSensitiveInfo(true)}
                      className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-2.5 focus-within:border-[#00c076] transition-colors"
                    >
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <input
                        type="text"
                        value={formData.phone}
                        onFocus={() => setShowSensitiveInfo(true)}
                        onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="+91 98765 43210"
                        className={cn(
                          "w-full bg-transparent text-sm font-medium outline-none text-foreground placeholder:text-muted-foreground/50 transition-all duration-200",
                          !showSensitiveInfo && "blur-xs select-none cursor-pointer"
                        )}
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowSensitiveInfo((prev) => !prev); }}
                        className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
                      >
                        {showSensitiveInfo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 text-[#00c076]" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Age / DOB</label>
                    <div
                      onClick={() => !showSensitiveInfo && setShowSensitiveInfo(true)}
                      className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-2.5 focus-within:border-[#00c076] transition-colors"
                    >
                      <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                      <input
                        type="text"
                        value={formData.age}
                        onFocus={() => setShowSensitiveInfo(true)}
                        onChange={(e) => setFormData((prev) => ({ ...prev, age: e.target.value }))}
                        placeholder="28 years old"
                        className={cn(
                          "w-full bg-transparent text-sm font-medium outline-none text-foreground placeholder:text-muted-foreground/50 transition-all duration-200",
                          !showSensitiveInfo && "blur-xs select-none cursor-pointer"
                        )}
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowSensitiveInfo((prev) => !prev); }}
                        className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
                      >
                        {showSensitiveInfo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 text-[#00c076]" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-[#00c076] py-2.5 text-sm font-bold text-[#04140d] transition hover:bg-[#00d684] shadow-xs active:scale-[0.99]"
                  >
                    {savedSuccess ? (
                      <>
                        <Check className="h-4 w-4" /> Saved Successfully!
                      </>
                    ) : (
                      "Save Profile Details"
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Security & Authentication Info */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-500/10 text-blue-500">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-heading text-sm font-bold text-foreground">Security & Session</h3>
                    <p className="text-[11px] text-muted-foreground">Session authentication and encryption status</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSecurityInfo((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                  title={showSecurityInfo ? "Blur details" : "Click to reveal details"}
                >
                  {showSecurityInfo ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-[#00c076]" />}
                  <span className="text-[11px]">{showSecurityInfo ? "Blur Info" : "Reveal Info"}</span>
                </button>
              </div>

              <div
                onClick={() => !showSecurityInfo && setShowSecurityInfo(true)}
                className={cn(
                  "mt-4 space-y-3 transition-all duration-200",
                  !showSecurityInfo && "blur-xs select-none cursor-pointer"
                )}
              >
                <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3 text-xs">
                  <span className="font-medium text-muted-foreground">Authentication Mode</span>
                  <span className="font-bold text-foreground">JWT Session Cookie</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3 text-xs">
                  <span className="font-medium text-muted-foreground">CoinDCX API Encryption</span>
                  <span className="font-bold text-[#00c076]">AES-256 GCM</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Trading Overview & Preferences */}
          <div className="space-y-6">
            {/* Trading Performance Overview */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#00c076]/10 text-[#00c076]">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-heading text-sm font-bold text-foreground">Trading Performance</h3>
                    <p className="text-[11px] text-muted-foreground">Real-time bot execution metrics</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPerformanceInfo((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/60 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                  title={showPerformanceInfo ? "Blur details" : "Click to reveal details"}
                >
                  {showPerformanceInfo ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-[#00c076]" />}
                  <span className="text-[11px]">{showPerformanceInfo ? "Blur Info" : "Reveal Info"}</span>
                </button>
              </div>

              <div
                onClick={() => !showPerformanceInfo && setShowPerformanceInfo(true)}
                className={cn(
                  "mt-4 grid grid-cols-3 gap-3 transition-all duration-200",
                  !showPerformanceInfo && "blur-xs select-none cursor-pointer"
                )}
              >
                <div className="rounded-xl border border-border bg-background p-3.5 text-center">
                  <span className="num text-xl font-extrabold text-foreground">{totalTrades}</span>
                  <span className="block mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Trades</span>
                </div>

                <div className="rounded-xl border border-border bg-background p-3.5 text-center">
                  <span className="num text-xl font-extrabold text-[#00c076]">{winningTrades}</span>
                  <span className="block mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Winning Trades</span>
                </div>

                <div className="rounded-xl border border-border bg-background p-3.5 text-center">
                  <span className="num text-xl font-extrabold text-[#00c076]">{winRate}%</span>
                  <span className="block mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Win Rate</span>
                </div>
              </div>
            </div>

            {/* System Preferences */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <div className="flex items-center gap-2.5 pb-4 border-b border-border">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/10 text-amber-500">
                  <Globe2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-bold text-foreground">System Preferences</h3>
                  <p className="text-[11px] text-muted-foreground">Display, theme, and API options</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {/* Theme Selector */}
                <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="block text-xs font-bold text-foreground">Interface Theme</span>
                      <span className="text-[10px] text-muted-foreground">Switch between Light and Dark mode</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleThemeToggle}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors"
                  >
                    {theme === "dark" ? "🌙 Dark Mode" : "☀️ Light Mode"}
                  </button>
                </div>

                {/* Display Timezone */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-2.5">
                    <Globe2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="block text-xs font-bold text-foreground">Display Timezone</span>
                      <span className="text-[10px] text-muted-foreground">{timezone.label} · {timezone.offset}</span>
                    </div>
                  </div>

                  <select
                    aria-label="Display timezone"
                    value={profile.timezone}
                    onChange={(e) => handleChangeTimezone(e.target.value)}
                    className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground outline-none focus:border-[#00c076]"
                  >
                    {!TIMEZONE_OPTIONS.some(([val]) => val === profile.timezone) && (
                      <option value={profile.timezone}>{profile.timezone}</option>
                    )}
                    {TIMEZONE_OPTIONS.map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* Real Money Trade Navigation */}
                <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-2.5">
                    <FileJson className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="block text-xs font-bold text-foreground">Real Money Trade Logs</span>
                      <span className="text-[10px] text-muted-foreground">View raw response payloads</span>
                    </div>
                  </div>

                  <Link
                    to="/realmoneytrade"
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#00c076] hover:underline"
                  >
                    Open Logs <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Logout Action Card */}
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-rose-500">Sign Out of Account</h4>
                  <p className="text-[11px] text-muted-foreground">Ends your current session safely</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/20 transition-all"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ProtectedRoutes({ theme, setTheme }: { theme: AppTheme; setTheme: React.Dispatch<React.SetStateAction<AppTheme>> }) {
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const { state: botState } = useBotStream();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true"
  );

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  useEffect(() => {
    fetch("/api/session")
      .then((response) => {
        if (!response.ok) throw new Error("not authenticated");
        setReady(true);
      })
      .catch(() => {
        setSessionError(true);
        window.location.assign("/login");
      });
  }, []);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--background)] px-6 text-center text-sm text-slate-400">
        {sessionError ? "Redirecting to login..." : "Loading trading workspace..."}
      </div>
    );
  }

  return (
    <>
      <NetworkNotice />
      <div className="flex min-h-screen bg-background text-foreground">
        {/* Desktop sidebar — hidden on mobile */}
        <Sidebar
          botOn={botState?.bot_on}
          liveMode={botState?.execution_mode === "LIVE"}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />

        {/* Main content area */}
        <main
          className={cn(
            "flex-1 min-w-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 transition-all duration-300 overflow-x-hidden",
            sidebarCollapsed ? "md:ml-[64px]" : "md:ml-[220px]"
          )}
        >
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/bot" element={<BotControl />} />
              <Route path="/history" element={<TradeHistory />} />
              <Route path="/position" element={<PositionMonitor />} />
              <Route path="/profile" element={<ProfilePage theme={theme} setTheme={setTheme} />} />
              <Route path="/testing" element={<HistoricalTesting />} />
              <Route path="/realmoneytrade" element={<RealMoneyTrade />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom nav — hidden on desktop */}
      <BottomNav />

      <Toaster position="bottom-right" richColors />
    </>
  );
}

export default function App() {
  const [theme, setTheme] = useState<AppTheme>(() => getSavedTheme());

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return (
    <Routes>
      <Route path="/login" element={<ModernLoginPage />} />
      <Route
        path="*"
        element={(
          <ProfileProvider>
            <ProtectedRoutes theme={theme} setTheme={setTheme} />
          </ProfileProvider>
        )}
      />
    </Routes>
  );
}
