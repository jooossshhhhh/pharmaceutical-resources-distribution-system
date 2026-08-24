import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatNumber } from "../../../dashboard/dashboardUtils";
import { chartColors, chartFont } from "./chartTheme";

export default function ConsumptionTrendChart({ rows = [] }) {
  const [visibleSeries, setVisibleSeries] = useState({
    actual: true,
    forecast: true,
  });

  const chartRows = useMemo(
    () =>
      rows.map((row) => ({
        month: row.label,
        actual: row.historical || null,
        forecast: row.forecasted || null,
      })),
    [rows]
  );

  if (rows.length === 0) {
    return (
      <div className="grid min-h-64 place-items-center rounded-xl bg-[#f8f9ff] text-center">
        <div>
          <p className="text-sm font-black text-[#0d1117]">No consumption data yet</p>
          <p className="mt-1 text-xs font-medium text-[#42474e]">
            Monthly medicine use and forecast records will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartRows} margin={{ bottom: 8, left: 8, right: 16, top: 12 }}>
          <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tick={chartFont}
            tickLine={false}
            axisLine={{ stroke: chartColors.grid }}
          />
          <YAxis
            allowDecimals={false}
            tick={chartFont}
            tickFormatter={(value) => formatNumber(value)}
            tickLine={false}
            axisLine={{ stroke: chartColors.grid }}
            label={{
              angle: -90,
              fill: chartColors.text,
              fontSize: 11,
              fontWeight: 800,
              position: "insideLeft",
              value: "Quantity",
            }}
          />
          <Tooltip content={<TrendTooltip />} />
          <Legend
            iconType="circle"
            wrapperStyle={{ color: chartColors.text, fontSize: 12, fontWeight: 800 }}
            onClick={(entry) =>
              setVisibleSeries((current) => ({
                ...current,
                [entry.dataKey]: !current[entry.dataKey],
              }))
            }
          />
          {visibleSeries.actual && (
            <Line
              dataKey="actual"
              dot={{ r: 3 }}
              name="Dispensed"
              stroke={chartColors.actual}
              strokeWidth={3}
              type="monotone"
              connectNulls={false}
            />
          )}
          {visibleSeries.forecast && (
            <Line
              dataKey="forecast"
              dot={{ r: 3 }}
              name="Forecast"
              stroke={chartColors.forecast}
              strokeDasharray="6 5"
              strokeWidth={3}
              type="monotone"
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendTooltip({ active, label, payload = [] }) {
  if (!active || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[#d8dadc] bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-black text-[#0d1117]">{label}</p>
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
