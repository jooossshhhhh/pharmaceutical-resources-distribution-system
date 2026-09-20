import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatNumber } from "../../../dashboard/dashboardUtils";
import { chartColors, chartFont } from "./chartTheme";

export default function ForecastComparisonChart({ rows = [] }) {
  const chartRows = rows.slice(0, 8).map((row) => ({
    label: `${row.genericName} ${row.dosage}`.trim(),
    latestUse: row.latestHistorical,
    projectedUse: row.projectedDemand,
  }));

  return (
    <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-neutral-200/40">
      <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
            Use Comparison
          </p>
          <h2 className="mt-1 text-base font-black text-[#0d1117]">Recent Use vs Expected Use</h2>
        </div>
      </div>

      <div className="h-80 p-4">
        {chartRows.length === 0 ? (
          <div className="grid h-full place-items-center rounded-xl bg-[#f8f9ff] text-center">
            <div>
              <p className="text-sm font-black text-[#0d1117]">No medicine comparison yet</p>
              <p className="mt-1 text-xs font-medium text-[#42474e]">
                Dispensing history and forecast rows will appear here.
              </p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} margin={{ bottom: 10, left: 8, right: 16, top: 8 }}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={chartFont}
                tickFormatter={(value) => shortenLabel(value)}
                tickLine={false}
                axisLine={{ stroke: chartColors.grid }}
              />
              <YAxis
                allowDecimals={false}
                tick={chartFont}
                tickFormatter={(value) => formatNumber(value)}
                tickLine={false}
                axisLine={{ stroke: chartColors.grid }}
              />
              <Tooltip content={<ComparisonTooltip />} />
              <Legend
                iconType="circle"
                wrapperStyle={{ color: chartColors.text, fontSize: 12, fontWeight: 800 }}
              />
              <Bar
                dataKey="latestUse"
                fill={chartColors.actual}
                name="Latest use"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="projectedUse"
                fill={chartColors.forecast}
                name="Expected use"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function ComparisonTooltip({ active, label, payload = [] }) {
  if (!active || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[#d8dadc] bg-white px-3 py-2 text-xs shadow-lg">
      <p className="max-w-56 font-black text-[#0d1117]">{label}</p>
      <div className="mt-2 space-y-1">
        {payload
          .filter((entry) => Number.isFinite(Number(entry.value)))
          .map((entry) => (
            <p key={entry.dataKey} className="flex items-center justify-between gap-4 font-bold text-[#42474e]">
              <span>{entry.name}</span>
              <span className="text-[#0d1117]">{formatNumber(entry.value)} units</span>
            </p>
          ))}
      </div>
    </div>
  );
}

const shortenLabel = (label = "") => {
  if (label.length <= 14) {
    return label;
  }

  return `${label.slice(0, 13)}...`;
};
