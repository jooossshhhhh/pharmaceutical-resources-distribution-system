import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatPeso } from "@shared/utils/reportUtils";
import { Clock, TrendingUp, Sun, Moon } from "lucide-react";

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div
        className="bg-white border border-[#d8dadc] p-3 rounded-xl shadow-xl text-xs min-w-[170px] pointer-events-none select-none"
        style={{ backgroundColor: "#ffffff" }}
      >
        <div className="flex items-center gap-1.5 font-bold text-[#0d1117] text-[13px] mb-1.5">
          <Clock className="h-3.5 w-3.5 text-emerald-600" />
          <span>{label}</span>
        </div>
        <div className="space-y-1 pt-1.5 border-t border-[#e5e7eb] text-[11.5px]">
          <div className="flex justify-between items-center">
            <span className="text-[#5f6673]">Total Units:</span>
            <strong className="text-[#0d1117] font-bold">{data.units?.toLocaleString()}</strong>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[#5f6673]">Walk-in Dispensed:</span>
            <span className="text-blue-600 font-semibold">{data.walkInUnits?.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[#5f6673]">Barangay Requisitions:</span>
            <span className="text-emerald-700 font-semibold">{data.bhwUnits?.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-[#f1f3f5]">
            <span className="text-[#5f6673]">Value:</span>
            <strong className="text-[#0d1117] font-bold">{formatPeso(data.cost)}</strong>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function DailyHourlyFlowChart({
  flowData = { hours: [], totalUnits: 0, totalCost: 0, peakHour: null },
  formattedDate = "Today",
}) {
  const { hours = [], totalUnits = 0, totalCost = 0, peakHour = null } = flowData;

  // Calculate morning vs afternoon totals
  const { morningUnits, afternoonUnits } = useMemo(() => {
    let morn = 0;
    let aft = 0;
    hours.forEach((h) => {
      if (h.hour < 12) morn += h.units;
      else aft += h.units;
    });
    return { morningUnits: morn, afternoonUnits: aft };
  }, [hours]);

  if (!totalUnits || totalUnits === 0) {
    return (
      <div className="bg-white border border-[#d8dadc] rounded-xl p-5 shadow-xs flex flex-col items-center justify-center min-h-[240px] text-center">
        <div className="h-10 w-10 rounded-full bg-[#f4f6f8] flex items-center justify-center text-[#5f6673] mb-2.5">
          <Clock className="h-5 w-5" />
        </div>
        <h4 className="text-sm font-bold text-[#0d1117]">No Dispensing Activity Recorded</h4>
        <p className="text-xs text-[#5f6673] mt-1 max-w-[320px]">
          No medicines were dispensed during operational hours on {formattedDate}.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#d8dadc] rounded-xl p-4.5 shadow-xs transition-all flex flex-col justify-between">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[#0d1117]">
              Busiest Hours of the Day
            </h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              <Clock className="h-3 w-3" />
              Hourly Flow
            </span>
          </div>
          <p className="text-[11.5px] text-[#5f6673] mt-0.5">
            Hourly dispensing rush hours from 8:00 AM to 5:00 PM
          </p>
        </div>

        {peakHour && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-[#5f6673] font-medium">Peak Hour:</span>
            <strong className="text-emerald-800 font-bold">
              {peakHour.label} ({peakHour.units.toLocaleString()} units)
            </strong>
          </div>
        )}
      </div>

      {/* Chart Canvas */}
      <div className="h-[175px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={hours}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="hourlyDispensingGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10.5, fill: "#5f6673" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10.5, fill: "#5f6673" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              wrapperStyle={{ zIndex: 100, pointerEvents: "none" }}
            />
            <Area
              type="monotone"
              dataKey="units"
              stroke="#2563eb"
              strokeWidth={2.2}
              fillOpacity={1}
              fill="url(#hourlyDispensingGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Breakdown Chips */}
      <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-[#f1f3f5] text-xs text-[#5f6673]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Sun className="h-3.5 w-3.5 text-amber-500" />
            <span>Morning (8 AM - 12 PM):</span>
            <strong className="text-[#0d1117] font-semibold">{morningUnits.toLocaleString()} units</strong>
          </div>
          <span className="text-[#d8dadc]">•</span>
          <div className="flex items-center gap-1.5">
            <Moon className="h-3.5 w-3.5 text-indigo-500" />
            <span>Afternoon (1 PM - 5 PM):</span>
            <strong className="text-[#0d1117] font-semibold">{afternoonUnits.toLocaleString()} units</strong>
          </div>
        </div>
        <div className="font-semibold text-emerald-700">
          Total: {totalUnits.toLocaleString()} units ({formatPeso(totalCost)})
        </div>
      </div>
    </div>
  );
}
