import { Link, useLocation } from "react-router-dom";
import { Bot, History, Home, Radar, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/bot", label: "Bot", icon: Bot },
  { to: "/history", label: "History", icon: History },
  { to: "/position", label: "Positions", icon: Radar },
  { to: "/profile", label: "Profile", icon: UserRound },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-all",
                active
                  ? "text-[#00c076] font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label={label}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-7 rounded-full bg-[#00c076] shadow-[0_0_8px_rgba(0,192,118,0.6)]" />
              )}
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-xl transition-all",
                active ? "bg-[#00c076]/12 text-[#00c076]" : "text-muted-foreground"
              )}>
                <Icon
                  className="h-4 w-4 transition-transform"
                  strokeWidth={active ? 2.5 : 1.8}
                />
              </div>
              <span className={cn("leading-none text-[10px] tracking-tight", active ? "text-[#00c076] font-bold" : "text-muted-foreground")}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
