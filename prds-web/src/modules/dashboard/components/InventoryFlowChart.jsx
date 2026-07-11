const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];

const defaultReceived = [4200, 3900, 5000, 4800, 5400, 6300, 5800];
const defaultDispensed = [3800, 3600, 4700, 4300, 5100, 5800, 4900];

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

export default function InventoryFlowChart({ received = defaultReceived, dispensed = defaultDispensed }) {
  const width = 640;
  const height = 170;
  const maxValue = Math.max(...received, ...dispensed, 8000);
  const receivedPath = buildPath(received, width, height, maxValue);
  const dispensedPath = buildPath(dispensed, width, height, maxValue);

  return (
    <div className="w-full">
      <div className="relative h-56 overflow-hidden">
        <div className="absolute inset-0 grid grid-rows-4 border-b border-l border-dashed border-neutral-200">
          {[8000, 6000, 4000, 2000].map((label) => (
            <div key={label} className="relative border-t border-dashed border-neutral-100">
              <span className="absolute -left-1 top-0 -translate-y-1/2 text-xs font-medium text-neutral-400">
                {label}
              </span>
            </div>
          ))}
        </div>

        <svg
          aria-label="Inventory flow received versus dispensed"
          className="absolute bottom-7 left-9 right-0 h-[170px] w-[calc(100%-2.25rem)] overflow-visible"
          preserveAspectRatio="none"
          viewBox={`0 0 ${width} ${height}`}
        >
          <path
            d={`${receivedPath} L ${width} ${height} L 0 ${height} Z`}
            fill="url(#receivedFill)"
            opacity="0.5"
          />
          <path d={dispensedPath} fill="none" stroke="#f59e0b" strokeWidth="4" />
          <path d={receivedPath} fill="none" stroke="#0f9f94" strokeWidth="4" />
          <defs>
            <linearGradient id="receivedFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0f9f94" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0f9f94" stopOpacity="0.02" />
            </linearGradient>
          </defs>
        </svg>

        <div className="absolute bottom-0 left-9 right-0 grid grid-cols-7 text-xs font-medium text-neutral-400">
          {months.map((month) => (
            <span key={month}>{month}</span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex justify-center gap-6 text-xs font-semibold">
        <span className="flex items-center gap-1 text-orange-500">
          <span className="h-1.5 w-4 rounded-full bg-orange-500" />
          Dispensed
        </span>
        <span className="flex items-center gap-1 text-teal-600">
          <span className="h-1.5 w-4 rounded-full bg-teal-600" />
          Received
        </span>
      </div>
    </div>
  );
}
