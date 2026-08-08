import { groupDispensingByMonth } from "../dashboardUtils";
import EmptyState from "./EmptyState";

const buildPath = (values, width, height, maxValue) => {
  const horizontalStep = width / (values.length - 1);

  return values
    .map((value, index) => {
      const x = index * horizontalStep;
      const y = height - (value / maxValue) * height;

      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
};

export default function MonthlyDispensingChart({ rows = [] }) {
  const chartRows = Object.entries(groupDispensingByMonth(rows)).map(
    ([label, value]) => ({ label, value })
  );

  if (chartRows.length === 0) {
    return (
      <EmptyState
        title="No dispensing data yet"
        hint="Dispensing transactions will appear here by month."
      />
    );
  }

  const width = 640;
  const height = 170;
  const maxValue = Math.max(...chartRows.map((row) => row.value), 1);
  const dispensedPath = buildPath(
    chartRows.map((row) => row.value),
    width,
    height,
    maxValue
  );

  return (
    <div className="w-full">
      <div className="relative h-56 overflow-hidden">
        <div className="absolute inset-0 grid grid-rows-4 border-b border-l border-dashed border-neutral-200">
          {[maxValue, maxValue * 0.75, maxValue * 0.5, maxValue * 0.25].map(
            (label, index) => (
              <div key={index} className="relative border-t border-dashed border-neutral-100">
                <span className="absolute -left-1 top-0 -translate-y-1/2 text-xs font-medium text-neutral-400">
                  {Math.round(label)}
                </span>
              </div>
            )
          )}
        </div>

        <svg
          aria-label="Monthly medicine dispensing trend"
          className="absolute bottom-7 left-9 right-0 h-[170px] w-[calc(100%-2.25rem)] overflow-visible"
          preserveAspectRatio="none"
          viewBox={`0 0 ${width} ${height}`}
        >
          <path
            d={`${dispensedPath} L ${width} ${height} L 0 ${height} Z`}
            fill="url(#dispensedFill)"
            opacity="0.5"
          />
          <path d={dispensedPath} fill="none" stroke="#0f9f94" strokeWidth="4" />
          <defs>
            <linearGradient id="dispensedFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0f9f94" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0f9f94" stopOpacity="0.02" />
            </linearGradient>
          </defs>
        </svg>

        <div
          className="absolute bottom-0 left-9 right-0 grid text-xs font-medium text-neutral-400"
          style={{ gridTemplateColumns: `repeat(${chartRows.length}, minmax(0, 1fr))` }}
        >
          {chartRows.map((row) => (
            <span key={row.label}>{row.label}</span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex justify-center gap-6 text-xs font-semibold">
        <span className="flex items-center gap-1 text-teal-600">
          <span className="h-1.5 w-4 rounded-full bg-teal-600" />
          Dispensed
        </span>
      </div>
    </div>
  );
}
