import { Link, useLocation } from "react-router-dom";
import { Bot, History, Home, PanelLeftClose, PanelLeftOpen, Radar, UserRound } from "lucide-react";
import LogoSVG from "@/components/common/LogoSVG";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/bot", label: "Bot", icon: Bot },
  { to: "/history", label: "History", icon: History },
  { to: "/position", label: "Positions", icon: Radar },
  { to: "/profile", label: "Profile", icon: UserRound },
];

interface SidebarProps {
  botOn?: boolean;
  liveMode?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ botOn, liveMode, collapsed = false, onToggleCollapse }: SidebarProps) {
  const location = useLocation();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-300 md:flex",
        collapsed ? "w-[64px]" : "w-[220px]"
      )}
    >
      {/* Clean Brand Header */}
      <div className={cn("flex h-16 shrink-0 items-center border-b border-border px-4", collapsed ? "justify-center" : "gap-3")}>
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0c141d] p-1 border border-[#00c076]/30 shadow-md shadow-[#00c076]/10">
            <LogoSVG className="w-full h-full" />
          </div>
          {!collapsed && (
            <div className="min-w-0 overflow-hidden">
              <p className="font-heading text-[13px] font-bold tracking-tight text-foreground leading-tight truncate">Minnu Services</p>
              <p className="text-[10px] text-muted-foreground leading-tight truncate">Scalping Bot</p>
            </div>
          )}
        </Link>
      </div>

      {/* Collapse / Expand Toggle Strip (placed above Dashboard) */}
      {onToggleCollapse && (
        <div className={cn("flex items-center py-2 px-3", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Menu
            </span>
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 text-[#00c076]" />
            ) : (
              <>
                <span className="text-[11px] font-medium">Collapse</span>
                <PanelLeftClose className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      )}

      {/* Nav links */}
      <nav className="flex-1 space-y-1.5 overflow-y-auto px-2.5 py-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={cn(
                "group flex items-center rounded-xl py-2.5 text-sm font-medium transition-all duration-150",
                collapsed ? "justify-center px-0" : "gap-3 px-3",
                active
                  ? "bg-[#00c076]/12 text-[#00c076] font-semibold shadow-[inset_0_0_0_1px_rgba(0,192,118,0.25)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-4.5 w-4.5 shrink-0 transition-colors",
                  active ? "text-[#00c076]" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              {!collapsed && (
                <>
                  <span className="truncate">{label}</span>
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#00c076]" />
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Engine Status indicator */}
      <div className={cn("shrink-0 border-t border-border py-3", collapsed ? "px-2 text-center" : "px-4")}>
        {!collapsed ? (
          <>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">Engine</span>
              <span className={cn(
                "inline-flex items-center gap-1.5 text-xs font-semibold",
                botOn ? "text-[#00c076]" : "text-muted-foreground"
              )}>
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  botOn ? "bg-[#00c076] animate-pulse" : "bg-muted-foreground/40"
                )} />
                {botOn ? "Online" : "Offline"}
              </span>
            </div>
            {liveMode && (
              <p className="mt-1 text-[9px] text-[#ff455b] font-bold uppercase tracking-wider">● Real Money Live</p>
            )}
          </>
        ) : (
          <div className="flex justify-center" title={`Engine: ${botOn ? "Online" : "Offline"}`}>
            <span className={cn(
              "h-2.5 w-2.5 rounded-full",
              botOn ? "bg-[#00c076] animate-pulse shadow-[0_0_8px_#00c076]" : "bg-muted-foreground/40"
            )} />
          </div>
        )}
      </div>
    </aside>
  );
}
