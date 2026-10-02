import { useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
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
  fitToCoverage = false,
  mapClassName = "",
  previewMode = false,
  showExpand = true,
  showMetrics = true,
  title = "City of Naga Health Center Coverage",
}) {
  const [metricFilter, setMetricFilter] = useState("all"); // 'all' | 'demand' | 'review'

  const mappedCount = (Array.isArray(facilities) ? facilities : []).filter((facility) => {
    const latitude = Number(facility.latitude);
    const longitude = Number(facility.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude);
  }).length;

  const mapHeightClass = mapClassName || (compact ? "min-h-80 md:min-h-72" : "min-h-72");

  const handleMetricClick = (filterKey) => {
    if (metricFilter === filterKey) {
      setMetricFilter("all");
    } else {
      setMetricFilter(filterKey);
    }
  };

  return (
    <section className={`overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-neutral-200/50 ${className}`}>
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b border-neutral-100 ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
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

        {/* Active Filter Pill / Reset Button */}
        {metricFilter !== "all" && (
          <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs shadow-xs">
            <span className="flex items-center gap-1.5 font-bold text-neutral-700">
              <Filter className="h-3.5 w-3.5 text-emerald-700" />
              <span>
                Filtered by:{" "}
                <strong className="text-emerald-800">
                  {metricFilter === "demand" ? "Expected Demand" : "Stock Review"}
                </strong>
              </span>
            </span>
            <button
              type="button"
              onClick={() => setMetricFilter("all")}
              className="flex items-center gap-1 rounded bg-white px-2 py-0.5 font-black text-neutral-700 shadow-xs hover:bg-neutral-100 hover:text-black transition"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
        )}
      </div>

      <div
        className={
          showMetrics
            ? `grid gap-3 ${compact ? "p-3 md:grid-cols-[minmax(0,1fr)_140px]" : "p-5 lg:grid-cols-[minmax(0,1fr)_190px]"}`
            : "grid gap-3 p-3"
        }
      >
        <FacilityMap
          controlsMode={previewMode ? "preview" : "full"}
          facilities={facilities}
          fitToCoverage={fitToCoverage}
          stockStatusByFacility={stockStatusByFacility}
          inventoryRows={inventoryRows}
          demandByFacility={demandByFacility}
          showExpand={showExpand}
          metricFilter={metricFilter}
          onMetricFilterChange={setMetricFilter}
          className={mapHeightClass}
        />

        {showMetrics && (
          <div className={`${compact ? "flex flex-col justify-between gap-2" : "grid gap-3"}`}>
            <ForecastMetric
              compact={compact}
              label="Mapped Facilities"
              value={mappedCount}
              tone="emerald"
              isActive={metricFilter === "all"}
              onClick={() => handleMetricClick("all")}
              helperText="All health stations"
            />
            <ForecastMetric
              compact={compact}
              label="Expected Use"
              value={forecastTotal}
              tone="blue"
              isActive={metricFilter === "demand"}
              onClick={() => handleMetricClick("demand")}
              helperText="Filter demand centers"
            />
            <ForecastMetric
              compact={compact}
              label="Stock Areas to Review"
              value={lowStockCount}
              tone="orange"
              isActive={metricFilter === "review"}
              onClick={() => handleMetricClick("review")}
              hasLiveAlert={lowStockCount > 0}
              helperText="Filter low/critical stock"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function ForecastMetric({
  compact = false,
  label,
  value,
  tone,
  isActive = false,
  onClick,
  hasLiveAlert = false,
  helperText,
}) {
  const toneClasses = {
    emerald: {
      bg: "bg-emerald-50 hover:bg-emerald-100/70 text-emerald-800 border-emerald-100",
      activeRing: "ring-2 ring-emerald-600 bg-emerald-100/80 border-emerald-300 shadow-sm",
      pill: "bg-emerald-200/90 text-emerald-900",
    },
    blue: {
      bg: "bg-blue-50 hover:bg-blue-100/70 text-blue-800 border-blue-100",
      activeRing: "ring-2 ring-blue-600 bg-blue-100/80 border-blue-300 shadow-sm",
      pill: "bg-blue-200/90 text-blue-900",
    },
    orange: {
      bg: "bg-orange-50 hover:bg-orange-100/70 text-orange-800 border-orange-100",
      activeRing: "ring-2 ring-orange-600 bg-orange-100/80 border-orange-300 shadow-sm",
      pill: "bg-orange-200/90 text-orange-900",
    },
  }[tone] || {
    bg: "bg-neutral-50 hover:bg-neutral-100 text-neutral-800 border-neutral-100",
    activeRing: "ring-2 ring-neutral-600",
    pill: "bg-neutral-200 text-neutral-800",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full text-left rounded-xl border transition-all duration-200 cursor-pointer ${
        compact ? "px-3 py-2.5" : "px-4 py-3"
      } ${toneClasses.bg} ${isActive ? toneClasses.activeRing : "hover:border-neutral-200/70"}`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className={`${compact ? "text-xl" : "text-2xl"} font-black tracking-tight`}>
          {Number(value || 0).toLocaleString()}
        </p>
        <div className="flex items-center gap-1.5">
          {hasLiveAlert && (
            <span className="relative flex h-2.5 w-2.5" title="Immediate attention required">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
          )}
          {isActive && (
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${toneClasses.pill}`}>
              Active
            </span>
          )}
        </div>
      </div>

      <p className="mt-1 text-xs font-black uppercase tracking-wide opacity-90">{label}</p>
      {helperText && !compact && (
        <p className="mt-0.5 text-[10px] font-semibold opacity-65 group-hover:opacity-95 transition-opacity">
          {isActive ? "Click to clear filter" : helperText}
        </p>
      )}
    </button>
  );
}

