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
                <stop offset="5%" stopColor="#1F4E5A" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#1F4E5A" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="predictionBandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#dc8939" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#dc8939" stopOpacity={0.03} />
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
                stroke="#D9826B"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                label={
                  isHovered
                    ? {
                        value: `Safety Buffer (${formatNumber(threshold)})`,
                        fill: "#D9826B",
                        fontSize: 10,
                        fontWeight: 700,
                        position: "insideBottomRight",
                      }
                    : undefined
                }
              />
            )}

            {/* Prediction Interval / Uncertainty Cone */}
            <Area
              type="monotone"
              dataKey="upperBound"
              fill="url(#predictionBandGradient)"
              stroke="#dc8939"
              strokeWidth={1}
              strokeDasharray="2 2"
              strokeOpacity={0.35}
              dot={false}
              activeDot={false}
              name="95% Confidence Range"
            />

            {/* Past Dispensed: Filled area with solid Clinical Teal border */}
            <Area
              type="monotone"
              dataKey="historical"
              fill="url(#pastDispensedGradient)"
              stroke="#1F4E5A"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "#1F4E5A", stroke: "#ffffff", strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: "#1F4E5A" }}
              connectNulls={false}
              name="Past Dispensed"
            />

            {/* Continuous OLS Fitted Trendline */}
            <Line
              type="monotone"
              dataKey="olsFit"
              stroke="#2563eb"
              strokeWidth={1.8}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, fill: "#2563eb" }}
              name="OLS Trendline"
            />

            {/* Expected Need: Dashed orange line with prominent circular markers */}
            <Line
              type="monotone"
              dataKey="projected"
              stroke="#dc8939"
              strokeWidth={2.5}
              strokeDasharray="5 4"
              dot={{ r: 4, fill: "#dc8939", stroke: "#ffffff", strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: "#dc8939" }}
              connectNulls={false}
              name="Expected Need"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend below the chart with stock & buffer numbers */}
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-[#5B7077]">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#1F4E5A] ring-2 ring-[#1F4E5A]/20" />
          <span>Past Dispensed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#dc8939] ring-2 ring-[#dc8939]/20" />
          <span>Expected Need</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3.5 border-t-2 border-dashed border-blue-600" />
          <span className="text-blue-700">OLS Trendline</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#dc8939]/20 border border-[#dc8939]/40" />
          <span>95% Confidence Range</span>
        </div>
        {showStockLine && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 border-t-2 border-dashed border-[#5B7077]" />
            <span className="text-[#1B2B30]">Stock on Shelf ({formatNumber(currentStock)})</span>
          </div>
        )}
        {showThresholdLine && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 border-t-2 border-dotted border-[#D9826B]" />
            <span className="text-[#D9826B]">Safety Buffer ({formatNumber(threshold)})</span>
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
  const olsFit = payload.find((p) => p.dataKey === "olsFit")?.value;
  const rawDataPoint = payload[0]?.payload || {};
  const lowerBound = rawDataPoint.lowerBound;
  const upperBound = rawDataPoint.upperBound;
  const isTransitionMonth = transitionIndex && label === transitionIndex;

  return (
    <div className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] px-3.5 py-2.5 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black text-[#1B2B30]">{label}</p>
        {isTransitionMonth && (
          <span className="rounded-md bg-[#E5EFF1] px-1.5 py-0.5 text-[10px] font-bold text-[#5B7077]">
            Forecast Start
          </span>
        )}
      </div>
      <div className="mt-1.5 space-y-1 text-xs">
        {historical != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-medium text-[#5B7077]">
              <span className="h-2 w-2 rounded-full bg-[#1F4E5A]" />
              Past Dispensed:
            </span>
            <span className="font-bold text-[#1B2B30]">{formatNumber(historical)} units</span>
          </div>
        )}
        {olsFit != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-medium text-slate-500">
              <span className="h-0.5 w-2 border-t-2 border-dashed border-blue-600" />
              OLS Fit:
            </span>
            <span className="font-bold text-blue-700">{formatNumber(olsFit)} units</span>
          </div>
        )}
        {projected != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-medium text-[#5B7077]">
              <span className="h-2 w-2 rounded-full bg-[#dc8939]" />
              Expected Need:
            </span>
            <span className="font-bold text-[#965315]">{formatNumber(projected)} units</span>
          </div>
        )}
        {lowerBound != null && upperBound != null && (
          <div className="flex items-center justify-between gap-4 text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              95% Confidence:
            </span>
            <span className="font-semibold text-amber-800">
              {formatNumber(lowerBound)} – {formatNumber(upperBound)} units
            </span>
          </div>
        )}
        {(currentStock != null || threshold != null) && (
          <div className="mt-1.5 space-y-1 border-t border-[#CFDDE0] pt-1.5">
            {currentStock != null && (
              <div className="flex items-center justify-between gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-[#5B7077]">
                  <span className="h-0.5 w-2 border-t border-dashed border-[#5B7077]" />
                  Stock on Shelf:
                </span>
                <span className="font-bold text-[#1B2B30]">{formatNumber(currentStock)} units</span>
              </div>
            )}
            {threshold != null && (
              <div className="flex items-center justify-between gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-[#D9826B]">
                  <span className="h-0.5 w-2 border-t border-dotted border-[#D9826B]" />
                  Safety Buffer:
                </span>
                <span className="font-bold text-[#D9826B]">{formatNumber(threshold)} units</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
