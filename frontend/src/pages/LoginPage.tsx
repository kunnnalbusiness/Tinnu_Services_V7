import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";

import LogoSVG from "@/components/common/LogoSVG";

type FocusField = "idle" | "email" | "password";

function TradingMark({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center shrink-0 rounded-xl bg-[#0c141d] p-1.5 border border-[#00c076]/40 shadow-md shadow-[#00c076]/10 ${className}`}>
      <LogoSVG className="w-full h-full" />
    </div>
  );
}

function CharacterArtwork({
  focus,
  email,
  password,
  success,
}: {
  focus: FocusField;
  email: string;
  password: string;
  success: boolean;
}) {
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setBlink(true);
      window.setTimeout(() => setBlink(false), 120);
    }, 3600);
    return () => window.clearInterval(interval);
  }, []);

  const active = focus !== "idle";
  const lookX = focus === "email" ? -9 : focus === "password" ? 10 : 0;
  const lookY = focus === "password" ? 4 : -1;
  const typed = email.length + password.length > 0;

  return (
    <svg
      className={`character-art${active ? " is-active" : ""}${success ? " is-success" : ""}`}
      viewBox="0 0 620 470"
      role="img"
      aria-label="Animated geometric characters"
    >
      <defs>
        <linearGradient id="shape-blue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b7dff" />
          <stop offset="1" stopColor="#3560e8" />
        </linearGradient>

        <linearGradient id="shape-orange" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8a34" />
          <stop offset="1" stopColor="#ff7622" />
        </linearGradient>

        <linearGradient id="shape-yellow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4d30c" />
          <stop offset="1" stopColor="#eac407" />
        </linearGradient>
      </defs>

      <g className="characters-ground">
        <path d="M86 408h446" stroke="#dadadc" strokeWidth="2" />
      </g>

      <g className="character-blue">
        <rect x="222" y="86" width="122" height="300" rx="1" fill="url(#shape-blue)" />
        <g className={blink ? "face blink" : "face"}>
          <ellipse cx={254 + lookX * 0.24} cy={146 + lookY * 0.2} rx="7" ry={blink ? 1.2 : 7} fill="#f3f5ff" />
          <ellipse cx={307 + lookX * 0.24} cy={146 + lookY * 0.2} rx="7" ry={blink ? 1.2 : 7} fill="#f3f5ff" />
          <circle cx={254 + lookX} cy={146 + lookY} r="2.5" fill="#24324b" />
          <circle cx={307 + lookX} cy={146 + lookY} r="2.5" fill="#24324b" />
          <path
            d={success ? "M268 170q16 18 32 0" : typed ? "M271 171q13 10 26 0" : "M270 170q14 14 28 0"}
            fill="none"
            stroke="#24324b"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>
      </g>

      <g className="character-black">
        <rect x="332" y="182" width="104" height="204" rx="2" fill="#202328" />
        <g className={blink ? "face blink" : "face"}>
          <ellipse cx={362 + lookX * 0.3} cy={230 + lookY * 0.25} rx="6.4" ry={blink ? 1.1 : 6.4} fill="#f5f5f6" />
          <ellipse cx={402 + lookX * 0.3} cy={230 + lookY * 0.25} rx="6.4" ry={blink ? 1.1 : 6.4} fill="#f5f5f6" />
          <circle cx={362 + lookX} cy={230 + lookY} r="2.4" fill="#25282d" />
          <circle cx={402 + lookX} cy={230 + lookY} r="2.4" fill="#25282d" />
          <path
            d={success ? "M371 252q12 15 24 0" : "M371 254h24"}
            fill="none"
            stroke="#f1f1f2"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      </g>

      <g className="character-yellow">
        <path
          d="M436 387V282c0-38 24-63 49-63s49 25 49 63v105Z"
          fill="url(#shape-yellow)"
        />
        <g className={blink ? "face blink" : "face"}>
          <ellipse
            cx={469 + lookX * 0.46}
            cy={259 + lookY * 0.25}
            rx="6"
            ry={blink ? 1 : 6}
            fill="#3b3720"
          />
          <circle cx={469 + lookX} cy={259 + lookY} r="2.1" fill="#f9f0a4" />
          <path
            d={success ? "M486 282h26" : "M486 282q12 4 26 0"}
            fill="none"
            stroke="#3b3720"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>
      </g>

      <g className="character-orange">
        <path
          d="M88 387a113 113 0 0 1 226 0Z"
          fill="url(#shape-orange)"
        />
        <g className={blink ? "face blink" : "face"}>
          <ellipse cx={175 + lookX * 0.8} cy={328 + lookY * 0.3} rx="6.8" ry={blink ? 1.2 : 6.8} fill="#313338" />
          <ellipse cx={232 + lookX * 0.8} cy={328 + lookY * 0.3} rx="6.8" ry={blink ? 1.2 : 6.8} fill="#313338" />
          <circle cx={175 + lookX} cy={328 + lookY} r="2.25" fill="#fbf4ee" />
          <circle cx={232 + lookX} cy={328 + lookY} r="2.25" fill="#fbf4ee" />
          <path
            d={
              success
                ? "M190 348q13 18 26 0"
                : focus === "email"
                  ? "M190 350q13 6 26 0"
                  : "M190 347q13 15 26 0"
            }
            fill="none"
            stroke="#313338"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>
      </g>

      <g className="success-confetti" opacity={success ? 1 : 0}>
        <circle cx="126" cy="238" r="4" fill="#5b7dff" />
        <circle cx="301" cy="96" r="4" fill="#ff8a34" />
        <circle cx="389" cy="136" r="4" fill="#f4d30c" />
        <circle cx="540" cy="242" r="4" fill="#55efad" />
      </g>
    </svg>
  );
}

function IntroLanding({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="min-h-screen w-full bg-[#080a0f] text-slate-100 flex flex-col font-sans overflow-y-auto selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Navbar Header */}
      <header
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        className="border-b border-slate-800/80 bg-[#080a0f]/90 backdrop-blur-md sticky top-0 z-40"
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TradingMark className="w-10 h-10" />
            <div className="flex flex-col">
              <span className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Minnu Services
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  v2.9 Node Active
                </span>
              </span>
              <span className="text-xs text-slate-400 font-medium">Private Algorithmic Trading Workspace</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onConnect}
            className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all duration-200 cursor-pointer transform hover:-translate-y-0.5"
          >
            <span>Connect</span>
            <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col justify-center">
        {/* Hero Section */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 pt-16 pb-12 text-center flex flex-col items-center gap-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles size={14} className="text-emerald-400" />
            High-Frequency Automated Scalping
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.12] max-w-4xl">
            Automated Scalping Hub & <br className="hidden md:inline" />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Algorithmic Execution Engine
            </span>
          </h1>

          <p className="text-base md:text-lg text-slate-300 max-w-2xl font-normal leading-relaxed">
            High-speed trading engine with real-time WebSocket telemetry, automated partial take-profits, dynamic leverage scaling, and private session control.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
            <button
              type="button"
              onClick={onConnect}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-base shadow-xl shadow-emerald-500/25 transition-all duration-200 cursor-pointer transform hover:-translate-y-0.5"
            >
              <span>Connect Workspace</span>
              <ArrowRight size={18} />
            </button>

            <div className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              24/7 Algorithmic Engine Active
            </div>
          </div>
        </section>

        {/* System Features Overview */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 py-10 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/30 transition-all duration-200 flex flex-col gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Zap size={20} />
              </div>
              <h3 className="text-base font-bold text-white">Algorithmic Execution</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Automated multi-timeframe market scanning with precision trigger conditions and instant order placement.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/30 transition-all duration-200 flex flex-col gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Target size={20} />
              </div>
              <h3 className="text-base font-bold text-white">Dynamic Partial TP</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Automated partial position reduction at target milestones with trailing break-even stop protection.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/30 transition-all duration-200 flex flex-col gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <ShieldCheck size={20} />
              </div>
              <h3 className="text-base font-bold text-white">Encrypted Workspace</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Private authenticated session control, API credential security, and instant emergency stop features.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/30 transition-all duration-200 flex flex-col gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                <BarChart3 size={20} />
              </div>
              <h3 className="text-base font-bold text-white">Real-Time Telemetry</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Live WebSocket feeds for cycle tracking, PnL analytics, win rate metrics, and searchable trade logs.
              </p>
            </div>
          </div>
        </section>

        {/* Bottom Banner */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 py-4 w-full mb-8">
          <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-slate-800 p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col gap-1 text-center md:text-left">
              <h4 className="text-lg font-bold text-white">Ready to access your trading workspace?</h4>
              <p className="text-xs text-slate-400">Connect your session to start monitoring active scalp positions.</p>
            </div>
            <button
              type="button"
              onClick={onConnect}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all cursor-pointer whitespace-nowrap"
            >
              <span>Connect</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-400">
        Minnu Services Trading System · Private Algorithmic Infrastructure
      </footer>
    </div>
  );
}

export default function LoginPage() {
  const [step, setStep] = useState<"intro" | "login">("intro");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focus, setFocus] = useState<FocusField>("idle");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error("Invalid username or password");
      }

      setSuccess(true);
      window.setTimeout(() => {
        window.location.assign("/");
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setSuccess(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "intro") {
    return <IntroLanding onConnect={() => setStep("login")} />;
  }

  return (
    <main className="login-shell">
      <style>{`

        html,
        body,
        #root {
          width: 100%;
          min-width: 100%;
          height: 100%;
          min-height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }

        body {
          overscroll-behavior: none;
        }

        .login-shell,
        .login-shell * {
          box-sizing: border-box;
        }

        .login-shell {
          --bg: #f0f0f1;
          --paper: #ffffff;
          --ink: #1f2227;
          --muted: #767980;
          --line: #d7d7da;
          --green: #2dcb86;
          --green-dark: #16895a;

          min-height: 100vh;
          min-height: 100dvh;
          width: 100%;
          display: grid;
          grid-template-columns: minmax(0, 1.18fr) minmax(330px, 0.82fr);
          background: var(--bg);
          color: var(--ink);
          font-family: "Inter", "Inter", "Segoe UI", Arial, sans-serif;
          overflow: hidden;
        }

        .visual-pane {
          position: relative;
          min-width: 0;
          min-height: 100vh;
          min-height: 100dvh;
          display: grid;
          place-items: center;
          padding: 40px clamp(20px, 4vw, 70px);
          background:
            radial-gradient(circle at 50% 55%, rgba(255,255,255,.7), transparent 34%),
            #ececee;
          overflow: hidden;
        }

        .visual-pane::before {
          content: "";
          position: absolute;
          width: 360px;
          height: 360px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.56);
          filter: blur(80px);
          transform: translateY(4%);
        }

        .visual-caption {
          position: absolute;
          top: 32px;
          left: clamp(22px, 3.5vw, 56px);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #8a8c91;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          z-index: 3;
        }

        .visual-caption-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #43dda0;
          box-shadow: 0 0 0 5px rgba(67,221,160,.12);
        }

        .character-art {
          position: relative;
          z-index: 2;
          width: min(760px, 95%);
          max-height: 82vh;
          height: auto;
          overflow: visible;
          transform-origin: center bottom;
          animation: idleFloat 5s ease-in-out infinite;
        }

        .character-art .face {
          transition: transform .26s ease;
        }

        .character-art.is-active .character-blue {
          animation: blueLook .55s ease-in-out;
        }

        .character-art.is-active .character-black {
          animation: blackLook .6s ease-in-out;
        }

        .character-art.is-active .character-orange {
          animation: orangeReact .7s ease-in-out;
        }

        .character-art.is-active .character-yellow {
          animation: yellowReact .62s ease-in-out;
        }

        .character-art.is-success {
          animation: successJump .7s cubic-bezier(.18,.8,.25,1);
        }

        .character-art.is-success .character-blue {
          animation: successBlue .7s cubic-bezier(.18,.8,.25,1);
        }

        .character-art.is-success .character-black {
          animation: successBlack .7s cubic-bezier(.18,.8,.25,1);
        }

        .character-art.is-success .character-orange {
          animation: successOrange .7s cubic-bezier(.18,.8,.25,1);
        }

        .character-art.is-success .character-yellow {
          animation: successYellow .7s cubic-bezier(.18,.8,.25,1);
        }

        .success-confetti {
          transition: opacity .2s ease;
          animation: confettiPop .7s ease-out;
        }

        .form-pane {
          position: relative;
          z-index: 5;
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px clamp(16px, 2.4vw, 32px);
          background: var(--paper);
        }

        .form-content {
          width: min(100%, 350px);
        }

        .login-brand {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
        }

        .brand-lockup {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .brand-name {
          color: #0f172a;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: .02em;
        }

        .brand-subtitle {
          color: #64748b;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .form-heading {
          text-align: center;
          margin-bottom: 24px;
        }

        .form-heading h1 {
          margin: 0;
          color: #0f172a;
          font-size: clamp(1.5rem, 2.2vw, 1.85rem);
          font-weight: 700;
          line-height: 1.15;
          letter-spacing: -.03em;
        }

        .form-heading p {
          margin: 6px 0 0;
          color: #64748b;
          font-size: 13px;
        }

        .login-form {
          display: grid;
          gap: 16px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field-label {
          color: #334155;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: -0.01em;
        }

        .input-wrap {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          color: #94a3b8;
          pointer-events: none;
          transition: color .2s ease;
          z-index: 1;
        }

        .input-wrap:focus-within .input-icon {
          color: #0f172a;
        }

        .login-input {
          width: 100%;
          height: 44px;
          padding: 0 42px 0 40px;
          border: 1.5px solid #e2e8f0;
          outline: none;
          border-radius: 10px;
          background: #f8fafc;
          color: #0f172a;
          font-size: 13px;
          font-weight: 500;
          transition: border-color .2s ease, box-shadow .2s ease, background-color .2s ease;
        }

        .login-input::placeholder {
          color: #94a3b8;
          font-weight: 400;
        }

        .login-input:focus {
          border-color: #0f172a;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
        }

        .password-toggle {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          transition: color .15s ease, background-color .15s ease;
        }

        .password-toggle:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .login-error {
          padding: 10px 14px;
          border-radius: 10px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          font-size: 12px;
          font-weight: 500;
          line-height: 1.4;
        }

        .login-submit {
          width: 100%;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 4px;
          border: 0;
          border-radius: 10px;
          background: #0f172a;
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: transform .18s ease, background-color .18s ease, box-shadow .18s ease;
        }

        .login-submit:hover:not(:disabled) {
          background: #1e293b;
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.15);
        }

        .login-submit:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-submit:disabled {
          cursor: not-allowed;
          opacity: .55;
        }

        .security-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-top: 20px;
          color: #64748b;
          font-size: 11px;
          font-weight: 500;
        }

        .security-item {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }

        .security-item svg {
          color: #10b981;
        }

        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: 0;
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 16px;
          padding: 6px 10px;
          border-radius: 8px;
          transition: background-color .15s ease, color .15s ease;
        }

        .back-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        @keyframes idleFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }

        @keyframes blueLook {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          45% { transform: rotate(-1.2deg) translateY(-3px); }
        }

        @keyframes blackLook {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          50% { transform: rotate(1.4deg) translateY(-2px); }
        }

        @keyframes orangeReact {
          0%, 100% { transform: rotate(0deg); }
          45% { transform: rotate(-1deg) translateX(-2px); }
        }

        @keyframes yellowReact {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          50% { transform: rotate(1deg) translateY(-4px); }
        }

        @keyframes successJump {
          0% { transform: translateY(0) scale(1); }
          35% { transform: translateY(-13px) scale(1.012); }
          65% { transform: translateY(2px) scale(.995); }
          100% { transform: translateY(0) scale(1); }
        }

        @keyframes successBlue {
          0%, 100% { transform: rotate(0); }
          45% { transform: rotate(-4deg) translateY(-7px); }
        }

        @keyframes successBlack {
          0%, 100% { transform: rotate(0); }
          45% { transform: rotate(4deg) translateY(-5px); }
        }

        @keyframes successOrange {
          0%, 100% { transform: translateY(0); }
          40% { transform: translateY(-10px); }
        }

        @keyframes successYellow {
          0%, 100% { transform: rotate(0); }
          45% { transform: rotate(5deg) translateY(-9px); }
        }

        @keyframes confettiPop {
          0% { transform: scale(.5); }
          55% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .character-art,
          .character-art *,
          .success-confetti {
            animation: none !important;
            transition: none !important;
          }
        }

        @media (max-width: 900px) {
          html,
          body,
          #root {
            overflow-y: auto !important;
            overflow-x: hidden !important;
            height: auto !important;
            min-height: 100dvh !important;
            overscroll-behavior-y: auto !important;
          }

          .login-shell {
            display: flex;
            flex-direction: column;
            grid-template-columns: none;
            min-height: 100vh;
            min-height: 100dvh;
            height: auto !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            -webkit-overflow-scrolling: touch;
          }

          .visual-pane {
            min-height: 260px;
            height: 35dvh;
            max-height: 340px;
            padding: 24px 16px 16px;
            order: 1;
            flex-shrink: 0;
          }

          .form-pane {
            min-height: 0;
            flex: 1;
            padding: 24px 16px 40px;
            order: 2;
            overflow-y: visible;
          }

          .character-art {
            width: min(480px, 92%);
            max-height: 240px;
          }

          .visual-caption {
            top: 14px;
            left: 16px;
          }

          .form-content {
            width: min(100%, 350px);
            transform: none;
          }
        }

        @media (max-width: 560px) {
          .visual-pane {
            min-height: 220px;
            height: 30dvh;
            max-height: 280px;
            padding: 20px 12px 12px;
          }

          .character-art {
            width: min(380px, 90%);
            max-height: 200px;
          }

          .form-pane {
            padding: 20px 16px 36px;
          }

          .login-brand {
            margin-bottom: 16px;
          }

          .form-heading {
            margin-bottom: 20px;
          }

          .form-heading h1 {
            font-size: 1.6rem;
          }

          .login-form {
            gap: 14px;
          }
        }
      `}</style>

      <section className="visual-pane" aria-label="Animated product illustration">
        <div className="visual-caption">
          <span className="visual-caption-dot" />
          Minnu Services
        </div>

        <CharacterArtwork
          focus={focus}
          email={email}
          password={password}
          success={success}
        />
      </section>

      <section className="form-pane">
        <div className="form-content">
          <button
            type="button"
            className="back-btn"
            onClick={() => setStep("intro")}
          >
            <ArrowLeft size={14} />
            <span>Back to Overview</span>
          </button>

          <div className="login-brand">
            <div className="brand-lockup">
              <TradingMark />
              <div className="brand-name">Minnu Services</div>
              <div className="brand-subtitle">Private trading workspace</div>
            </div>
          </div>

          <div className="form-heading">
            <h1>Welcome back!</h1>
            <p>Please enter your details to sign in</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <label className="field">
              <span className="field-label">Email address</span>
              <span className="input-wrap">
                <Mail size={16} className="input-icon" />
                <input
                  className="login-input"
                  type="text"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onFocus={() => setFocus("email")}
                  onBlur={() => setFocus("idle")}
                  placeholder="Enter your email"
                  autoComplete="username"
                  aria-label="Email"
                  autoFocus
                />
              </span>
            </label>

            <label className="field">
              <span className="field-label">Password</span>
              <span className="input-wrap">
                <LockKeyhole size={16} className="input-icon" />
                <input
                  className="login-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onFocus={() => setFocus("password")}
                  onBlur={() => setFocus("idle")}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  aria-label="Password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>

            {error ? (
              <div className="login-error" role="alert">
                {error}
              </div>
            ) : null}

            <button className="login-submit" type="submit" disabled={isSubmitting || success}>
              {success
                ? "Login successful"
                : isSubmitting
                  ? "Signing in..."
                  : "Log in"}
              {!isSubmitting && !success ? <ArrowUpRight size={16} /> : null}
            </button>
          </form>

          <div className="security-row">
            <span className="security-item">
              <ShieldCheck size={13} />
              Secure session
            </span>
            <span className="security-item">
              <LockKeyhole size={13} />
              Private access
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
