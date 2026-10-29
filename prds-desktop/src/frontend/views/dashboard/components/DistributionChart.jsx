import { formatNumber } from "@shared/utils/dashboardUtils";

const markerClasses = ["bg-[#4C9F80]", "bg-[#34769B]", "bg-[#D9826B]", "bg-[#5B7077]"];

export default function DistributionChart({ rows }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;

  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-5">
      <div className="relative h-28 w-28 rounded-full bg-[conic-gradient(#4C9F80_0_48%,#34769B_48%_72%,#D9826B_72%_88%,#5B7077_88%_100%)]">
        <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-[#F9FBFB] shadow-inner">
          <span className="text-xl font-black text-[#1B2B30]">
            {formatNumber(total)}
          </span>
          <span className="text-[10px] font-bold uppercase text-[#5B7077]">
            dispensed
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 font-semibold text-[#5B7077]">
              <span className={`h-2 w-2 rounded-full ${markerClasses[index % markerClasses.length]}`} />
              <span className="truncate">{row.label}</span>
            </span> 
            <span className="font-bold text-[#1B2B30]">
              {Math.round((row.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
