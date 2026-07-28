import { formatNumber } from "../dashboardUtils";

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });

const fallbackRows = [
  { label: "Aug", value: 120 },
  { label: "Sep", value: 160 },
  { label: "Oct", value: 140 },
  { label: "Nov", value: 190 },
  { label: "Dec", value: 220 },
];

const getMonthLabel = (value) => {
  if (!value) {
    return "No date";
  }

  return monthFormatter.format(new Date(value));
};

export default function ForecastDemandBars({ rows = [] }) {
  const groupedRows = rows.reduce((summary, row) => {
    const label = getMonthLabel(row.forecast_month);
    summary[label] = (summary[label] || 0) + Number(row.predicted_quantity || 0);
    return summary;
  }, {});
  const chartRows = Object.entries(groupedRows)
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));
  const visibleRows = chartRows.length > 0 ? chartRows : fallbackRows;
  const maxValue = Math.max(...visibleRows.map((row) => row.value), 1);

  return (
    <div className="space-y-4">
      {visibleRows.map((row) => {
        const percent = Math.max(8, Math.round((row.value / maxValue) * 100));

        return (
          <div key={row.label} className="grid grid-cols-[44px_1fr_72px] items-center gap-3">
            <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
              {row.label}
            </span>
            <div className="h-3 overflow-hidden rounded-full bg-[#eff4ff]">
              <div
                className="h-full rounded-full bg-[#6be9c2]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-right text-xs font-black text-[#0d1117]">
              {formatNumber(row.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
