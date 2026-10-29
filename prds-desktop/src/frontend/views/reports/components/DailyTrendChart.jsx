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
      <div className="bg-[#F9FBFB] border border-[#CFDDE0] p-2.5 rounded-lg shadow-md text-xs">
        <div className="font-bold text-[#1B2B30]">Day {label}</div>
        <div className="text-[#1F4E5A] font-semibold mt-0.5">
          Units Dispensed: {data.units?.toLocaleString()}
        </div>
        <div className="text-[#5B7077] mt-0.5">
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
    <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-4.5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-1">
        <div>
          <h3 className="text-sm font-bold text-[#1B2B30]">
            Daily Dispensing {monthName}
          </h3>
          <p className="text-[11.5px] text-[#5B7077]">
            Quantities of medicines given out each day of the month
          </p>
        </div>
        <div className="text-xs font-semibold text-[#1F4E5A]">
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
                <stop offset="5%" stopColor="#4C9F80" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#4C9F80" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="formattedDay"
              tick={{ fontSize: 11, fill: "#5B7077" }}
              axisLine={{ stroke: "#CFDDE0" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#5B7077" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="units"
              stroke="#4C9F80"
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
