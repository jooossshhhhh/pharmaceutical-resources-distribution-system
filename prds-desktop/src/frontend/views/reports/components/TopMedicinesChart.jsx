import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatPeso } from "@shared/utils/reportUtils";

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-[#d8dadc] p-2.5 rounded-lg shadow-md text-xs">
        <div className="font-bold text-[#0d1117]">{data.name}</div>
        <div className="text-[#00a36c] font-semibold mt-1">
          Quantity: {data.quantity?.toLocaleString()} units
        </div>
        <div className="text-[#42474e] mt-0.5">
          Total Cost: {formatPeso(data.cost)}
        </div>
      </div>
    );
  }
  return null;
};

export default function TopMedicinesChart({ data = [] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white border border-[#d8dadc] rounded-xl p-5 shadow-xs flex flex-col items-center justify-center min-h-[260px] text-center">
        <p className="text-xs font-semibold text-[#0d1117]">No Medicines Dispensed</p>
        <p className="text-[11.5px] text-[#42474e] mt-1">
          No dispensing records recorded for this selected date.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#d8dadc] rounded-xl p-4.5 shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#0d1117]">
          Top Medicines Dispensed Today
        </h3>
        <span className="text-[11px] font-medium text-[#42474e]">
          By quantity & cost
        </span>
      </div>

      <div className="h-[210px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              tick={{ fontSize: 11, fill: "#0d1117" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="quantity"
              fill="#00a36c"
              radius={[0, 6, 6, 0]}
              barSize={18}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === 0 ? "#00a36c" : "#10b981"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
