import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "../../../dashboard/dashboardUtils";

export default function ForecastingProjectionChart({
  data = [],
  height = 330,
}) {
  const transitionIndex = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i]?.historical != null) {
        return data[i]?.month;
      }
    }
    return null;
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-72 w-full flex-col items-center justify-center rounded-xl bg-slate-50 text-center">
        <p className="text-sm font-bold text-slate-700">No chart data available</p>
        <p className="mt-1 text-xs text-slate-400">
          Select a medicine to view historical trends and linear regression projections.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 18, right: 24, left: 0, bottom: 8 }}
          >
            <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              stroke="#94a3b8"
              tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
            />
            <YAxis
              stroke="#94a3b8"
              tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatNumber(v)}
              width={42}
            />
            <Tooltip content={<CustomProjectionTooltip />} />

            {transitionIndex && (
              <ReferenceLine
                x={transitionIndex}
                stroke="#cbd5e1"
                strokeDasharray="4 4"
                label={{
                  value: "Forecast →",
                  fill: "#94a3b8",
                  fontSize: 10,
                  fontWeight: 700,
                  position: "insideTopRight",
                }}
              />
            )}

            {/* Historical: Solid green line */}
            <Line
              type="monotone"
              dataKey="historical"
              stroke="#00a36c"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "#00a36c", stroke: "#ffffff", strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: "#00a36c" }}
              connectNulls={false}
              name="Historical"
            />

            {/* OLS Fit: Dashed blue line */}
            <Line
              type="linear"
              dataKey="olsFit"
              stroke="#2563eb"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, fill: "#2563eb" }}
              connectNulls={false}
              name="OLS Fit"
            />

            {/* Projected: Dashed orange line with prominent markers */}
            <Line
              type="monotone"
              dataKey="projected"
              stroke="#ea580c"
              strokeWidth={2.5}
              strokeDasharray="5 4"
              dot={{ r: 4, fill: "#ea580c", stroke: "#ffffff", strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: "#ea580c" }}
              connectNulls={false}
              name="Projected"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend below the chart */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-6 text-xs font-semibold text-slate-600">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#00a36c] ring-2 ring-[#00a36c]/20" />
          <span>Historical</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-1 w-4 border-t-2 border-dashed border-[#2563eb]" />
          <span>OLS Fit</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ea580c] ring-2 ring-[#ea580c]/20" />
          <span>Projected</span>
        </div>
      </div>
    </div>
  );
}

function CustomProjectionTooltip({ active, label, payload = [] }) {
  if (!active || payload.length === 0) {
    return null;
  }

  const historical = payload.find((p) => p.dataKey === "historical")?.value;
  const olsFit = payload.find((p) => p.dataKey === "olsFit")?.value;
  const projected = payload.find((p) => p.dataKey === "projected")?.value;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg">
      <p className="text-xs font-black text-slate-800">{label}</p>
      <div className="mt-1.5 space-y-1 text-xs">
        {historical != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-medium text-slate-500">
              <span className="h-2 w-2 rounded-full bg-[#00a36c]" />
              Historical:
            </span>
            <span className="font-bold text-slate-900">{formatNumber(historical)} units</span>
          </div>
        )}
        {olsFit != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-medium text-slate-500">
              <span className="h-1.5 w-2.5 border-t border-dashed border-[#2563eb]" />
              OLS Fit:
            </span>
            <span className="font-bold text-blue-700">{formatNumber(olsFit)} units</span>
          </div>
        )}
        {projected != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-medium text-slate-500">
              <span className="h-2 w-2 rounded-full bg-[#ea580c]" />
              Projected:
            </span>
            <span className="font-bold text-orange-600">{formatNumber(projected)} units</span>
          </div>
        )}
      </div>
    </div>
  );
}
