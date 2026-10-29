import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatPeso } from "@shared/utils/reportUtils";
import { Building2, UserCheck, Layers, PieChart as PieChartIcon } from "lucide-react";

const CHANNEL_ICONS = {
  requests: Building2,
  walk_in: UserCheck,
  other_programs: Layers,
};

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div
        className="relative z-50 bg-[#F9FBFB] border border-[#CFDDE0] p-3.5 rounded-xl shadow-xl text-xs min-w-[190px] pointer-events-none select-none"
        style={{ backgroundColor: "#F9FBFB" }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: data.color }}
          />
          <span className="font-bold text-[#1B2B30] text-[13px]">{data.name}</span>
        </div>
        <p className="text-[11px] text-[#5B7077] mb-2 leading-tight">{data.description}</p>
        <div className="space-y-1.5 pt-2 border-t border-[#CFDDE0]">
          <div className="flex justify-between items-center text-[11.5px]">
            <span className="text-[#5B7077]">Units Dispensed:</span>
            <strong className="text-[#1B2B30] font-bold">{data.units?.toLocaleString()} units</strong>
          </div>
          <div className="flex justify-between items-center text-[11.5px]">
            <span className="text-[#5B7077]">Channel Share:</span>
            <strong className="text-[#1F4E5A] font-bold">{data.percentage}%</strong>
          </div>
          <div className="flex justify-between items-center text-[11.5px]">
            <span className="text-[#5B7077]">Total Price:</span>
            <strong className="text-[#1B2B30] font-bold">{formatPeso(data.cost)}</strong>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function MonthlyDispensingDistributionChart({
  data = { channels: [], totalUnits: 0, totalCost: 0 },
  monthName = "Month",
  year = new Date().getFullYear(),
}) {
  const { channels = [], totalUnits = 0, totalCost = 0 } = data;

  const chartData = useMemo(() => {
    return (channels || []).map((c) => ({
      ...c,
      value: c.units,
    }));
  }, [channels]);

  if (!totalUnits || totalUnits === 0) {
    return (
      <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-6 shadow-xs flex flex-col items-center justify-center min-h-[260px] text-center">
        <div className="h-11 w-11 rounded-full bg-[#E5EFF1] flex items-center justify-center text-[#5B7077] mb-2.5">
          <PieChartIcon className="h-5 w-5" />
        </div>
        <h4 className="text-sm font-bold text-[#1B2B30]">No Dispensing Activity Recorded</h4>
        <p className="text-xs text-[#5B7077] mt-1 max-w-[360px]">
          No medicines were requested by barangays, dispensed to walk-in patients, or allocated to other programs for {monthName} {year}.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-5 shadow-xs transition-all">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-[#CFDDE0]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[#1B2B30]">
              Dispensing Channels Distribution
            </h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E8F5F1] text-[#2D7A5D] border border-[#4C9F80]/30">
              {monthName} {year}
            </span>
          </div>
          <p className="text-xs text-[#5B7077] mt-0.5">
            Breakdown across Medicine Requests, Walk-in Consultations, and Special Programs
          </p>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-xs text-[#5B7077]">Total Outflow Dispensed</div>
          <div className="text-base font-bold text-[#1B2B30]">
            {totalUnits.toLocaleString()} units{" "}
            <span className="text-xs font-semibold text-[#2D7A5D]">({formatPeso(totalCost)})</span>
          </div>
        </div>
      </div>

      {/* Main Content: Donut Chart on Left, Detail Cards on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center pt-4">
        {/* Left: Recharts Donut */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center h-[240px] relative">
          {/* Donut Center Display: positioned strictly at z-0 behind the chart and tooltip */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
            <span className="text-[10px] font-semibold tracking-wider text-[#5B7077] uppercase">
              Total Outflow
            </span>
            <span className="text-xl font-black text-[#1B2B30] my-0.5">
              {totalUnits.toLocaleString()}
            </span>
            <span className="text-[10px] font-semibold text-[#2D7A5D] bg-[#E8F5F1] px-2 py-0.5 rounded-full border border-[#4C9F80]/30">
              100% Allocated
            </span>
          </div>

          <div className="w-full h-full relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  content={<CustomTooltip />}
                  wrapperStyle={{ zIndex: 100, pointerEvents: "none" }}
                />
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={92}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${entry.id || index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Channels Detail Cards */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          {channels.map((channel) => {
            const Icon = CHANNEL_ICONS[channel.id] || Layers;
            return (
              <div
                key={channel.id}
                className="rounded-xl border border-[#CFDDE0] bg-[#F4F8F8] p-3.5 hover:border-[#1F4E5A]/30 hover:bg-[#F9FBFB] transition-all shadow-2xs"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
                      style={{ backgroundColor: channel.color }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#1B2B30] leading-tight">
                        {channel.name}
                      </h4>
                      <p className="text-[11px] text-[#5B7077] leading-tight">
                        {channel.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-[#1B2B30]">
                      {channel.percentage}%
                    </span>
                    <div className="text-[11px] font-medium text-[#5B7077]">
                      {channel.units.toLocaleString()} units
                    </div>
                  </div>
                </div>

                {/* Visual Progress Bar */}
                <div className="w-full bg-[#CFDDE0] rounded-full h-2 overflow-hidden mb-1.5">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${channel.percentage}%`,
                      backgroundColor: channel.color,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#5B7077] pt-1 border-t border-[#CFDDE0]">
                  <span>Total Price:</span>
                  <strong className="text-[#1B2B30] font-semibold">
                    {formatPeso(channel.cost)}
                  </strong>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
