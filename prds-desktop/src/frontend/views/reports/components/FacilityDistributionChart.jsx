import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-[#d8dadc] p-2 rounded-lg shadow-md text-xs">
        <div className="font-bold text-[#0d1117]">{data.name}</div>
        <div className="text-emerald-700 font-semibold mt-0.5">
          {data.value?.toLocaleString()} units ({data.percentage}%)
        </div>
      </div>
    );
  }
  return null;
};

export default function FacilityDistributionChart({ data = [] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white border border-[#d8dadc] rounded-xl p-5 shadow-xs flex flex-col items-center justify-center min-h-[260px] text-center">
        <p className="text-xs font-semibold text-[#0d1117]">No Distribution Data</p>
        <p className="text-[11.5px] text-[#42474e] mt-1">
          No medicines were distributed on this date.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#d8dadc] rounded-xl p-4.5 shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-[#0d1117]">
          Medicines Given by Health Center
        </h3>
        <span className="text-[11px] font-medium text-[#42474e]">
          CHO vs. Barangays
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3 h-[210px]">
        <div className="h-full w-full sm:w-1/2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<CustomTooltip />} />
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="w-full sm:w-1/2 flex flex-col gap-1.5 overflow-y-auto max-h-[190px] pr-1 text-xs">
          {data.map((item, idx) => (
            <div key={`legend-${idx}`} className="flex items-center justify-between text-[11.5px]">
              <div className="flex items-center gap-1.5 truncate max-w-[130px]">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[#0d1117] truncate font-medium">{item.name}</span>
              </div>
              <span className="font-semibold text-[#42474e] shrink-0">
                {item.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
