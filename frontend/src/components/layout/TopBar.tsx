import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import LogoSVG from "@/components/common/LogoSVG";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title: string;
  onBack?: () => void;
  icon?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export default function TopBar({ title, onBack, icon, right, className }: TopBarProps) {
  return (
    <header
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      className={cn(
        "z-30 flex shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur-md min-h-[56px]",
        className
      )}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#0c141d] p-1 border border-[#00c076]/30 shadow-xs">
          <LogoSVG className="w-full h-full" />
        </div>
      )}
      <h1 className="font-heading text-[15px] font-bold tracking-tight text-foreground truncate flex-1">
        {title}
      </h1>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </header>
  );
}
