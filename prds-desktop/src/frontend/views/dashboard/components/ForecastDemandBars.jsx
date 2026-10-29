import { formatNumber } from "@shared/utils/dashboardUtils";
import EmptyState from "./EmptyState";

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });

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

  if (chartRows.length === 0) {
    return (
      <EmptyState title="No forecast data yet" hint="Generated forecasts will appear here." />
    );
  }

  const maxValue = Math.max(...chartRows.map((row) => row.value), 1);

  return (
    <div className="space-y-3">
      {chartRows.map((row) => {
        const percent = Math.max(8, Math.round((row.value / maxValue) * 100));

        return (
          <div key={row.label} className="grid grid-cols-[38px_1fr_58px] items-center gap-2.5">
            <span className="text-[11px] font-black uppercase tracking-wide text-[#5B7077]">
              {row.label}
            </span>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#E3EEF5]">
              <div
                className="h-full rounded-full bg-[#34769B]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-right text-[11px] font-black text-[#1B2B30]">
              {formatNumber(row.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
