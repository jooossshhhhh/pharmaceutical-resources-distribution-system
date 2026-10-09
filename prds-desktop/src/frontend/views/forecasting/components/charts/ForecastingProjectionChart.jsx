import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@shared/utils/dashboardUtils";

export default function ForecastingProjectionChart({
  data = [],
  currentStock = null,
  threshold = null,
  height = 310,
}) {
  const [isHovered, setIsHovered] = useState(false);

  const transitionIndex = useMemo(() => {
    // Find index of the last item that has a historical value
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i]?.historical != null) {
        return data[i]?.month;
      }
    }
    return null;
  }, [data]);

  const maxVal = useMemo(() => {
    let max = 0;
    data.forEach((d) => {
      if (d.historical != null) max = Math.max(max, d.historical);
      if (d.projected != null) max = Math.max(max, d.projected);
    });
    return max;
  }, [data]);

  // Only display horizontal stock lines when they fit reasonably in chart scale (within 3.5x of peak demand)
  const showStockLine = currentStock != null && currentStock > 0 && (maxVal === 0 || currentStock <= Math.max(maxVal * 3.5, 100));
  const showThresholdLine = threshold != null && threshold > 0 && (maxVal === 0 || threshold <= Math.max(maxVal * 3.5, 100));

  if (!data || data.length === 0) {
    return (
      <div className="flex h-72 w-full flex-col items-center justify-center rounded-xl bg-slate-50/70 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <TrendingUp className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm font-bold text-slate-700">No Dispensing History Available</p>
        <p className="mt-1 max-w-sm text-xs font-medium text-slate-400">
          This medicine does not have historical dispensing records at this facility yet. Demand forecasts require at least one recorded dispensing period.
        </p>
      </div>
    );
  }

  return (
    <div
      className="w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 20, right: 30, left: 0, bottom: 8 }}
          >
            <defs>
              <linearGradient id="pastDispensedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00a36c" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#00a36c" stopOpacity={0.0} />
              </linearGradient>
            </defs>
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
              width={46}
            />
            <Tooltip
              content={
                <CustomProjectionTooltip
                  currentStock={currentStock}
                  threshold={threshold}
                  transitionIndex={transitionIndex}
                />
              }
            />

            {/* Vertical Forecast Start boundary - text only appears when hovering */}
            {transitionIndex && (
              <ReferenceLine
                x={transitionIndex}
                stroke="#cbd5e1"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={
                  isHovered
                    ? {
                        value: "Forecast Start →",
                        fill: "#64748b",
                        fontSize: 10,
                        fontWeight: 700,
                        position: "insideTopLeft",
                      }
                    : undefined
                }
              />
            )}

            {/* Horizontal Current Stock reference line - text only appears when hovering */}
            {showStockLine && (
              <ReferenceLine
                y={currentStock}
                stroke="#64748b"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={
                  isHovered
                    ? {
                        value: `Stock on Shelf (${formatNumber(currentStock)})`,
                        fill: "#475569",
                        fontSize: 10,
                        fontWeight: 700,
                        position: "insideTopRight",
                      }
                    : undefined
                }
              />
            )}

            {/* Horizontal Safety Buffer reference line - text only appears when hovering */}
            {showThresholdLine && (
              <ReferenceLine
                y={threshold}
                stroke="#f43f5e"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                label={
                  isHovered
                    ? {
                        value: `Safety Buffer (${formatNumber(threshold)})`,
                        fill: "#e11d48",
                        fontSize: 10,
                        fontWeight: 700,
                        position: "insideBottomRight",
                      }
                    : undefined
                }
              />
            )}

            {/* Past Dispensed: Filled area with solid emerald border */}
            <Area
              type="monotone"
              dataKey="historical"
              fill="url(#pastDispensedGradient)"
              stroke="#00a36c"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "#00a36c", stroke: "#ffffff", strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: "#00a36c" }}
              connectNulls={false}
              name="Past Dispensed"
            />

            {/* Expected Need: Dashed orange line with prominent circular markers */}
            <Line
              type="monotone"
              dataKey="projected"
              stroke="#ea580c"
              strokeWidth={2.5}
              strokeDasharray="5 4"
              dot={{ r: 4, fill: "#ea580c", stroke: "#ffffff", strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: "#ea580c" }}
              connectNulls={false}
              name="Expected Need"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend below the chart with stock & buffer numbers */}
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-5 text-xs font-semibold text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#00a36c] ring-2 ring-[#00a36c]/20" />
          <span>Past Dispensed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ea580c] ring-2 ring-[#ea580c]/20" />
          <span>Expected Need</span>
        </div>
        {showStockLine && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 border-t-2 border-dashed border-slate-500" />
            <span className="text-slate-700">Stock on Shelf ({formatNumber(currentStock)})</span>
          </div>
        )}
        {showThresholdLine && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 border-t-2 border-dotted border-rose-500" />
            <span className="text-rose-700">Safety Buffer ({formatNumber(threshold)})</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomProjectionTooltip({ active, label, payload = [], currentStock, threshold, transitionIndex }) {
  if (!active || payload.length === 0) {
    return null;
  }

  const historical = payload.find((p) => p.dataKey === "historical")?.value;
  const projected = payload.find((p) => p.dataKey === "projected")?.value;
  const isTransitionMonth = transitionIndex && label === transitionIndex;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black text-slate-800">{label}</p>
        {isTransitionMonth && (
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
            Forecast Start
          </span>
        )}
      </div>
      <div className="mt-1.5 space-y-1 text-xs">
        {historical != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-medium text-slate-500">
              <span className="h-2 w-2 rounded-full bg-[#00a36c]" />
              Past Dispensed:
            </span>
            <span className="font-bold text-slate-900">{formatNumber(historical)} units</span>
          </div>
        )}
        {projected != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-medium text-slate-500">
              <span className="h-2 w-2 rounded-full bg-[#ea580c]" />
              Expected Need:
            </span>
            <span className="font-bold text-orange-600">{formatNumber(projected)} units</span>
          </div>
        )}
        {(currentStock != null || threshold != null) && (
          <div className="mt-1.5 space-y-1 border-t border-slate-100 pt-1.5">
            {currentStock != null && (
              <div className="flex items-center justify-between gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-0.5 w-2 border-t border-dashed border-slate-500" />
                  Stock on Shelf:
                </span>
                <span className="font-bold text-slate-700">{formatNumber(currentStock)} units</span>
              </div>
            )}
            {threshold != null && (
              <div className="flex items-center justify-between gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-rose-500">
                  <span className="h-0.5 w-2 border-t border-dotted border-rose-500" />
                  Safety Buffer:
                </span>
                <span className="font-bold text-rose-600">{formatNumber(threshold)} units</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
