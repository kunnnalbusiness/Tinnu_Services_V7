import { fmtInr } from "@/lib/botTypes";
import type { Trade } from "@/lib/botTypes";
import { fmtPrice } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function StrategyCycleCard({ cycles }: { cycles: Trade[] }) {
  const rows = [...cycles]
    .sort((left, right) => (left.cycle_number ?? 1) - (right.cycle_number ?? 1))
    .map((trade) => {
      const finalHit = trade.status === "tp" ? "TP HIT" : trade.status === "sl" ? "SL HIT" : trade.status === "open" ? "RUNNING" : trade.status.toUpperCase();
      const netPnl = (trade.partial_booked_pnl_inr ?? 0) + (trade.pnl_inr ?? 0);
      return { trade, cycle: trade.cycle_number ?? 1, finalHit, netPnl };
    });
  const total = rows.reduce((sum, row) => sum + row.netPnl, 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-[#1e293b] bg-[#111724]">
      <div className="border-b border-[#1e293b] px-3 py-2">
        <h3 className="font-heading text-xs font-semibold text-slate-100">Cycle Summary</h3>
      </div>
      <table className="w-full min-w-[680px] text-[11px]">
        <thead>
          <tr className="border-b border-[#1e293b] text-slate-500">
            {['Cycle', 'Entry', 'TP', 'SL', 'Partial book', 'Final hit', 'Net P&L'].map((label) => <th key={label} className="px-2 py-1.5 text-right first:text-left">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ trade, cycle, finalHit, netPnl }) => (
            <tr key={trade.id} className="border-b border-[#1e293b]/50">
              <td className="px-2 py-1.5 text-slate-300">Cycle {cycle}</td>
              <td className="num px-2 py-1.5 text-right text-slate-300">{fmtPrice(trade.entry_price)}</td>
              <td className="num px-2 py-1.5 text-right text-slate-300">{trade.tp_price ? fmtPrice(trade.tp_price) : "—"}</td>
              <td className="num px-2 py-1.5 text-right text-slate-300">{trade.sl_price ? fmtPrice(trade.sl_price) : "—"}</td>
              <td className="num px-2 py-1.5 text-right text-slate-400">{trade.partial_booked_pct ? `${trade.partial_booked_pct}% · ${fmtInr(trade.partial_booked_pnl_inr ?? 0)}` : "—"}</td>
              <td className="px-2 py-1.5 text-right"><span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", finalHit === "TP HIT" ? "bg-[#00c076]/12 text-[#00c076]" : finalHit === "SL HIT" ? "bg-[#ff455b]/12 text-[#ff455b]" : "bg-slate-500/12 text-slate-400")}>{finalHit}</span></td>
              <td className={cn("num px-2 py-1.5 text-right font-semibold", netPnl >= 0 ? "text-[#00c076]" : "text-[#ff455b]")}>{fmtInr(netPnl)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="bg-[#0f172a]"><td colSpan={6} className="px-2 py-1.5 text-right text-slate-400">Total</td><td className={cn("num px-2 py-1.5 text-right font-bold", total >= 0 ? "text-[#00c076]" : "text-[#ff455b]")}>{fmtInr(total)}</td></tr></tfoot>
      </table>
    </div>
  );
}
