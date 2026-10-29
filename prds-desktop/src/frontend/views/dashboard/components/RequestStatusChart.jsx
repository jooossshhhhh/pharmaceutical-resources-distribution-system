import { formatNumber } from "@shared/utils/dashboardUtils";

const palette = {
  APPROVED: "#4C9F80",
  PENDING: "#D9826B",
  DISPENSED: "#34769B",
  REJECTED: "#8F3F2B",
};

const labels = ["APPROVED", "PENDING", "DISPENSED", "REJECTED"];

export default function RequestStatusChart({ rows }) {
  const statusRows = labels.map((status) => ({
    status,
    value: rows?.[status] || 0,
  }));
  const total = statusRows.reduce((sum, row) => sum + row.value, 0) || 1;

  const gradient = statusRows
    .map((row, index) => {
      const start =
        statusRows
          .slice(0, index)
          .reduce((sum, item) => sum + (item.value / total) * 100, 0);
      const end = start + (row.value / total) * 100;
      return `${palette[row.status]} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[112px_1fr]">
      <div
        className="relative mx-auto h-28 w-28 rounded-full"
        style={{ background: `conic-gradient(${gradient})` }}
      >
        <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-[#F9FBFB] shadow-inner">
          <span className="text-xl font-black text-[#1B2B30]">{formatNumber(total)}</span>
          <span className="text-[11px] font-semibold text-[#5B7077]">Total</span>
        </div>
      </div>

      <div className="space-y-2.5">
        {statusRows.map((row) => {
          const percent = Math.round((row.value / total) * 100);
          const label =
            row.status.charAt(0) + row.status.slice(1).toLowerCase();

          return (
            <div key={row.status} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-2 font-medium text-[#5B7077]">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: palette[row.status] }}
                />
                <span className="truncate">{label}</span>
              </span>
              <span className="font-black text-[#1B2B30]">{formatNumber(row.value)}</span>
              <span className="w-8 text-right font-medium text-[#5B7077]/70">{percent}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
