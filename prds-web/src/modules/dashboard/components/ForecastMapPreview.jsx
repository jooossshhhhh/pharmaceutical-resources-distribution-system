import FacilityMap from "./FacilityMap";

export default function ForecastMapPreview({
  className = "",
  compact = false,
  description = "Live map of facility locations and stock monitoring.",
  eyebrow = "Forecasting Overview",
  facilities = [],
  forecastTotal = 0,
  lowStockCount = 0,
  stockStatusByFacility = {},
  inventoryRows = null,
  demandByFacility = {},
  previewMode = false,
  showExpand = true,
  title = "City of Naga Health Center Coverage",
}) {
  const mappedCount = facilities.filter((facility) => {
    const latitude = Number(facility.latitude);
    const longitude = Number(facility.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude);
  }).length;

  return (
    <section className={`overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-neutral-200/50 ${className}`}>
      <div className={`flex items-start justify-between gap-4 border-b border-neutral-100 ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-base font-black text-[#0d1117]">
            {title}
          </h2>
          <p className={`${compact ? "mt-0.5 text-xs" : "mt-1 text-sm"} font-medium text-neutral-500`}>
            {description}
          </p>
        </div>
      </div>

      <div className={`grid gap-3 ${compact ? "p-3 md:grid-cols-[minmax(0,1fr)_132px]" : "p-5 lg:grid-cols-[minmax(0,1fr)_180px]"}`}>
        <FacilityMap
          controlsMode={previewMode ? "preview" : "full"}
          facilities={facilities}
          stockStatusByFacility={stockStatusByFacility}
          inventoryRows={inventoryRows}
          demandByFacility={demandByFacility}
          showExpand={showExpand}
          className={compact ? "min-h-72 md:min-h-64" : "min-h-72"}
        />

        <div className={`${compact ? "flex flex-col justify-between gap-2" : "grid gap-3"}`}>
          <ForecastMetric compact={compact} label="Mapped Facilities" value={mappedCount} tone="emerald" />
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
