import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtInr } from "@/lib/botTypes";
import type { DayPnl } from "@/lib/botTypes";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function monthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(d);
  return cells;
}

function MonthPanel({
  year,
  month,
  byDate,
  selectedDate,
  onSelectDate,
}: {
  year: number;
  month: number;
  byDate: Map<string, DayPnl>;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  return (
    <div className="min-w-[150px] flex-1" data-testid="calendar-month" data-month={`${year}-${month + 1}`}>
      <p className="mb-1.5 font-heading text-[11px] font-bold text-foreground">
        {monthLabel(year, month)}
      </p>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d, i) => (
          <span key={`${d}-${i}`} className="num text-center text-[8px] font-semibold uppercase text-muted-foreground">
            {d}
          </span>
        ))}
        {monthGrid(year, month).map((day, index) => {
          if (day === null) return <span key={`pad-${index}`} />;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const entry = byDate.get(key);
          const pnl = entry?.pnl_inr ?? 0;
          const selected = selectedDate === key;
          const tone =
            !entry || entry.trades === 0
              ? "bg-muted/60 text-muted-foreground hover:bg-muted"
              : pnl > 0
                ? "bg-[#00c076]/15 text-[#00c076] font-bold hover:bg-[#00c076]/25"
                : pnl < 0
                  ? "bg-[#ff455b]/15 text-[#ff455b] font-bold hover:bg-[#ff455b]/25"
                  : "bg-muted text-foreground";
          return (
            <button
              type="button"
              key={key}
              data-testid="calendar-day"
              data-date={key}
              data-pnl={entry ? entry.pnl_inr.toFixed(0) : "0"}
              title={entry ? `${key}: ${fmtInr(entry.pnl_inr)} · ${entry.trades} trades` : `${key}: no trades`}
              className={cn(
                "num grid h-5.5 place-items-center rounded-md text-[9px] font-semibold transition-all duration-150",
                tone,
                selected && "ring-2 ring-[#00c076] font-bold shadow-xs",
              )}
              onClick={() => onSelectDate(key)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PnlCalendar({
  days,
  selectedDate,
  onSelectDate,
}: {
  days: DayPnl[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const second = new Date(base);
  second.setMonth(second.getMonth() + 1);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-heading text-xs font-bold text-foreground">P&amp;L Calendar</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="calendar-prev-button"
            onClick={() => setOffset((o) => o - 1)}
            className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            data-testid="calendar-next-button"
            onClick={() => setOffset((o) => o + 1)}
            className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <MonthPanel
          year={base.getFullYear()}
          month={base.getMonth()}
          byDate={byDate}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />
      </div>

      <div className="num mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-[#00c076]/25 border border-[#00c076]/40" /> Profit
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-[#ff455b]/25 border border-[#ff455b]/40" /> Loss
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-muted border border-border" /> No trades
        </span>
      </div>
    </div>
  );
}
