import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatPeso } from "@shared/utils/reportUtils";

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-[#d8dadc] p-2.5 rounded-lg shadow-md text-xs">
        <div className="font-bold text-[#0d1117]">Day {label}</div>
        <div className="text-[#00a36c] font-semibold mt-0.5">
          Units Dispensed: {data.units?.toLocaleString()}
        </div>
        <div className="text-[#42474e] mt-0.5">
          Cost: {formatPeso(data.cost)}
        </div>
      </div>
    );
  }
  return null;
};

export default function DailyTrendChart({ data = [], monthName = "This Month" }) {
  const totalUnitsInMonth = data.reduce((sum, d) => sum + (d.units || 0), 0);

  return (
    <div className="bg-white border border-[#d8dadc] rounded-xl p-4.5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-1">
        <div>
          <h3 className="text-sm font-bold text-[#0d1117]">
            Daily Dispensing {monthName}
          </h3>
          <p className="text-[11.5px] text-[#42474e]">
            Quantities of medicines given out each day of the month
          </p>
        </div>
        <div className="text-xs font-semibold text-[#00a36c]">
          Month Total: {totalUnitsInMonth.toLocaleString()} Units
        </div>
      </div>

      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="dispensingTrendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00a36c" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#00a36c" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="formattedDay"
              tick={{ fontSize: 11, fill: "#42474e" }}
              axisLine={{ stroke: "#d8dadc" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#42474e" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="units"
              stroke="#00a36c"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#dispensingTrendGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
