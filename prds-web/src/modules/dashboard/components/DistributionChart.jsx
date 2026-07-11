import { formatNumber } from "../dashboardUtils";

const markerClasses = ["bg-emerald-600", "bg-sky-500", "bg-amber-500", "bg-slate-400"];

export default function DistributionChart({ rows }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;

  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-5">
      <div className="relative h-28 w-28 rounded-full bg-[conic-gradient(#008060_0_48%,#0ea5e9_48%_72%,#f59e0b_72%_88%,#94a3b8_88%_100%)]">
        <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
          <span className="text-xl font-black text-slate-950">
            {formatNumber(total)}
          </span>
          <span className="text-[10px] font-bold uppercase text-slate-500">
            dispensed
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-600">
              <span className={`h-2 w-2 rounded-full ${markerClasses[index % markerClasses.length]}`} />
              <span className="truncate">{row.label}</span>
            </span> 
            <span className="font-bold text-slate-950">
              {Math.round((row.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
