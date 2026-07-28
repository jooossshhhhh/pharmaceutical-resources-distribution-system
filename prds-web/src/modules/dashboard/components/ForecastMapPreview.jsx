const fallbackPins = [
  { key: "north", x: 46, y: 20 },
  { key: "central", x: 55, y: 39 },
  { key: "east", x: 68, y: 53 },
  { key: "south", x: 50, y: 73 },
  { key: "coastal", x: 34, y: 58 },
  { key: "west", x: 28, y: 36 },
];

const getPinPosition = (facility, index) => {
  if (Number.isFinite(Number(facility.latitude)) && Number.isFinite(Number(facility.longitude))) {
    const latitude = Number(facility.latitude);
    const longitude = Number(facility.longitude);

    return {
      x: Math.min(78, Math.max(22, ((longitude - 123.72) / 0.08) * 56 + 22)),
      y: Math.min(82, Math.max(16, 82 - ((latitude - 10.16) / 0.08) * 66)),
    };
  }

  return fallbackPins[index % fallbackPins.length];
};

export default function ForecastMapPreview({
  compact = false,
  facilities = [],
  forecastTotal = 0,
  lowStockCount = 0,
  onOpenForecasting,
}) {
  const pins = facilities.slice(0, 8).map((facility, index) => ({
    ...facility,
    ...getPinPosition(facility, index),
  }));

  return (
    <section className="overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-neutral-200/50">
      <div className={`flex items-start justify-between gap-4 border-b border-neutral-100 ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
            Forecasting Overview
          </p>
          <h2 className="mt-1 text-base font-black text-[#0d1117]">
            City of Naga Health Center Coverage
          </h2>
          <p className={`${compact ? "mt-0.5 text-xs" : "mt-1 text-sm"} font-medium text-neutral-500`}>
            Initial sketch map for facility demand and stock monitoring.
          </p>
        </div>
        {onOpenForecasting && (
          <button
            type="button"
            onClick={onOpenForecasting}
            className="rounded-lg bg-[#0d1117] px-3 py-2 text-xs font-black text-white transition hover:bg-neutral-800"
          >
            Full View
          </button>
        )}
      </div>

      <div className={`grid gap-4 ${compact ? "p-4 lg:grid-cols-[minmax(0,1fr)_150px]" : "p-5 lg:grid-cols-[minmax(0,1fr)_180px]"}`}>
        <div className={`relative overflow-hidden rounded-xl border border-[#d8dadc] bg-[#f8f9ff] ${compact ? "min-h-56" : "min-h-72"}`}>
          <svg
            aria-label="Sketch map of City of Naga, Cebu facility coverage"
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            <path
              d="M31 12 C48 8 68 17 75 33 C85 55 72 80 52 88 C34 95 18 81 17 62 C15 43 17 20 31 12Z"
              fill="#eff4ff"
              stroke="#d8dadc"
              strokeWidth="1.2"
            />
            <path
              d="M29 30 C43 26 58 28 70 35 M25 50 C43 45 58 48 76 59 M36 18 C42 34 44 58 41 84 M58 19 C54 38 55 62 63 82"
              fill="none"
              stroke="#d8dadc"
              strokeDasharray="2 3"
              strokeWidth="0.9"
            />
            <path
              d="M24 73 C38 66 53 66 70 74"
              fill="none"
              stroke="#6be9c2"
              strokeLinecap="round"
              strokeWidth="2.5"
            />
          </svg>

          {pins.map((facility, index) => {
            const isLowStock = index < lowStockCount;

            return (
              <button
                key={facility.id || facility.facility_code || index}
                type="button"
                className="group absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${facility.x}%`, top: `${facility.y}%` }}
                title={facility.facility_name}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 border-white shadow-md ${
                    isLowStock ? "bg-orange-500" : "bg-[#6be9c2]"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0d1117]" />
                </span>
                <span className="pointer-events-none absolute left-1/2 top-6 z-10 hidden w-44 -translate-x-1/2 rounded-lg border border-[#d8dadc] bg-white px-3 py-2 text-left text-xs font-bold text-[#0d1117] shadow-xl group-hover:block">
                  {facility.facility_name}
                  <span className="mt-0.5 block font-medium text-neutral-500">
                    {facility.facility_code || "Facility"}
                  </span>
                </span>
              </button>
            );
          })}

          <div className="absolute bottom-3 left-3 rounded-lg border border-white/70 bg-white/90 px-3 py-2 text-xs font-bold text-[#42474e] shadow-sm">
            City of Naga, Cebu
          </div>
        </div>

        <div className={`grid ${compact ? "gap-2" : "gap-3"}`}>
          <ForecastMetric compact={compact} label="Mapped Facilities" value={facilities.length} tone="emerald" />
          <ForecastMetric compact={compact} label="Forecasted Demand" value={forecastTotal} tone="blue" />
          <ForecastMetric compact={compact} label="Stock Watch Areas" value={lowStockCount} tone="orange" />
        </div>
      </div>
    </section>
  );
}

function ForecastMetric({ compact = false, label, value, tone }) {
  const toneClass =
    tone === "orange"
      ? "bg-orange-50 text-orange-700"
      : tone === "blue"
        ? "bg-blue-50 text-blue-700"
        : "bg-emerald-50 text-emerald-700";

  return (
    <div className={`rounded-xl ${compact ? "px-3 py-2.5" : "px-4 py-3"} ${toneClass}`}>
      <p className={`${compact ? "text-xl" : "text-2xl"} font-black`}>
        {Number(value || 0).toLocaleString()}
      </p>
      <p className="mt-1 text-xs font-black uppercase tracking-wide">{label}</p>
    </div>
  );
}
