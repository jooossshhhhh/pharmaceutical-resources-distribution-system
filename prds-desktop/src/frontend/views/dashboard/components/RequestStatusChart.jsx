import { formatNumber } from "@shared/utils/dashboardUtils";

const palette = {
  APPROVED: "#4C9F80",
  PENDING: "#D9826B",
  DISPENSED: "#34769B",
  REJECTED: "#8F3F2B",
};

const labels = ["APPROVED", "PENDING", "DISPENSED", "REJECTED"];

export default function RequestStatusChart({
  rows = {},
  title = "Request Status Pipeline",
  subtitle = "All requests",
}) {
  const statusRows = labels.map((status) => ({
    status,
    value: rows?.[status] || 0,
  }));
  const total = statusRows.reduce((sum, row) => sum + row.value, 0);
  const displayTotal = total;
  const gradientTotal = total || 1;

  const gradient = total > 0
    ? statusRows
        .map((row, index) => {
          const start =
            statusRows
              .slice(0, index)
              .reduce((sum, item) => sum + (item.value / gradientTotal) * 100, 0);
          const end = start + (row.value / gradientTotal) * 100;
          return `${palette[row.status]} ${start}% ${end}%`;
        })
        .join(", ")
    : "#CFDDE0 0% 100%";

  const approvedCount = rows?.APPROVED || 0;
  const dispensedCount = rows?.DISPENSED || 0;
  const pendingCount = rows?.PENDING || 0;
  const fulfillmentRate = total > 0
    ? Math.round(((approvedCount + dispensedCount) / total) * 100)
    : 0;

  const displaySubtitle =
    subtitle === "All requests" && pendingCount > 0
      ? `${formatNumber(pendingCount)} awaiting review`
      : total > 0
      ? `${subtitle} · ${fulfillmentRate}% fulfilled`
      : subtitle;

  return (
    <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-4.5 shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#1B2B30]">
          {title}
        </h3>
        <span className="text-[11px] font-medium text-[#5B7077]">
          {displaySubtitle}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4.5 h-[210px] w-full">
        {/* Donut Chart */}
        <div className="flex-shrink-0 flex items-center justify-center">
          <div
            className="relative h-36 w-36 rounded-full shadow-inner"
            style={{ background: `conic-gradient(${gradient})` }}
          >
            <div className="absolute inset-4.5 flex flex-col items-center justify-center rounded-full bg-[#F9FBFB] shadow-xs">
              <span className="text-2xl font-black text-[#1B2B30] tracking-tight">
                {formatNumber(displayTotal)}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5B7077]">
                Total
              </span>
            </div>
          </div>
        </div>

        {/* Status Breakdown with Visual Progress Tracks evenly filling vertical space */}
        <div className="flex-1 w-full flex flex-col justify-between h-full py-1">
          {statusRows.map((row) => {
            const percent = total > 0 ? Math.round((row.value / total) * 100) : 0;
            const label =
              row.status.charAt(0) + row.status.slice(1).toLowerCase();
            const color = palette[row.status];

            return (
              <div key={row.status} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-medium text-[#1B2B30]">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: color }}
                    />
                    <span>{label}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#1B2B30]">{formatNumber(row.value)}</span>
                    <span className="w-9 text-right font-medium text-[#5B7077] text-[11px]">
                      {percent}%
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-[#E5ECEE] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${percent}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
