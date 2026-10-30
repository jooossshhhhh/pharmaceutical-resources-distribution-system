import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Building2, Filter, RotateCcw } from "lucide-react";
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
  onManageFacilities = null,
}) {
  const navigate = useNavigate();
  const [metricFilter, setMetricFilter] = useState("all"); // 'all' | 'demand' | 'review' | 'healthy'

  const mappedCount = (Array.isArray(facilities) ? facilities : []).filter((facility) => {
    const latitude = Number(facility.latitude);
    const longitude = Number(facility.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude);
  }).length;

  const healthyCount = useMemo(() => {
    const list = Array.isArray(facilities) ? facilities : [];
    return list.filter((f) => {
      const status = (stockStatusByFacility || {})[f.id] || "HEALTHY";
      return status === "HEALTHY" || status === "MONITOR";
    }).length;
  }, [facilities, stockStatusByFacility]);

  const mapHeightClass = mapClassName || (compact ? "min-h-80 md:min-h-72" : "min-h-72");

  const handleMetricClick = (filterKey) => {
    if (metricFilter === filterKey) {
      setMetricFilter("all");
    } else {
      setMetricFilter(filterKey);
    }
  };

  const filterLabel =
    metricFilter === "review"
      ? "Stock Areas to Review"
      : metricFilter === "healthy"
        ? "Healthy Facilities"
        : metricFilter === "demand"
          ? "Demand Areas"
          : "";

  const filterColor =
    metricFilter === "review"
      ? "text-[#8F3F2B]"
      : metricFilter === "healthy"
        ? "text-[#226048]"
        : "text-[#34769B]";

  return (
    <section className={`overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#CFDDE0] bg-white px-5 py-3.5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#1F4E5A]">
            {eyebrow}
          </p>
          <h2 className="mt-0.5 text-base font-black text-[#1B2B30]">
            {title}
          </h2>
          <p className="mt-0.5 text-xs font-medium text-[#5B7077]">
            {description}
          </p>
        </div>

        {/* Active Filter Pill / Reset Button */}
        {metricFilter !== "all" && (
          <div className="flex items-center gap-2 rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3 py-1.5 text-xs shadow-xs">
            <span className="flex items-center gap-1.5 font-bold text-[#1B2B30]">
              <Filter className="h-3.5 w-3.5 text-[#1F4E5A]" />
              <span>
                Filtered by:{" "}
                <strong className={filterColor}>
                  {filterLabel}
                </strong>
              </span>
            </span>
            <button
              type="button"
              onClick={() => setMetricFilter("all")}
              className="flex items-center gap-1 rounded bg-white px-2 py-0.5 text-xs font-black text-[#1B2B30] shadow-xs border border-[#CFDDE0] hover:bg-[#E5EFF1] transition"
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
            ? "grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_205px]"
            : "grid gap-3 p-4"
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
          <div className="flex flex-col gap-2.5 h-full">
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
              label="Healthy Stock"
              value={healthyCount}
              tone="green"
              isActive={metricFilter === "healthy"}
              onClick={() => handleMetricClick("healthy")}
              helperText="Normal stock levels"
            />
            <ForecastMetric
              compact={compact}
              label="Areas to Review"
              value={lowStockCount}
              tone="orange"
              isActive={metricFilter === "review"}
              onClick={() => handleMetricClick("review")}
              hasLiveAlert={lowStockCount > 0}
              helperText="Low or critical stock"
            />

            <button
              type="button"
              onClick={() => (onManageFacilities ? onManageFacilities() : navigate("/facilities"))}
              className="mt-auto flex items-center justify-between gap-2 rounded-xl border border-[#CFDDE0] bg-white px-3.5 py-3 text-xs font-black text-[#1F4E5A] shadow-xs hover:bg-[#E5EFF1] hover:border-[#1F4E5A]/40 transition group cursor-pointer"
              title="Open full facilities directory"
            >
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#34769B]" />
                <span>Facility Directory</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-[#5B7077] group-hover:translate-x-0.5 transition-transform" />
            </button>
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
      bg: "bg-[#E8F5F1] hover:bg-[#D5EFE7] text-[#1F4E5A] border border-[#4C9F80]/30",
      activeRing: "ring-2 ring-[#1F4E5A] bg-[#D5EFE7] border-[#4C9F80] shadow-xs",
      pill: "bg-[#1F4E5A] text-white",
    },
    green: {
      bg: "bg-[#E2F3EC] hover:bg-[#D0EBDF] text-[#226048] border border-[#4C9F80]/30",
      activeRing: "ring-2 ring-[#4C9F80] bg-[#D0EBDF] border-[#4C9F80] shadow-xs",
      pill: "bg-[#4C9F80] text-white",
    },
    orange: {
      bg: "bg-[#FBE9E3] hover:bg-[#F7D8CE] text-[#8F3F2B] border border-[#D9826B]/30",
      activeRing: "ring-2 ring-[#D9826B] bg-[#F7D8CE] border-[#D9826B] shadow-xs",
      pill: "bg-[#8F3F2B] text-white",
    },
  }[tone] || {
    bg: "bg-[#F9FBFB] hover:bg-[#E5EFF1] text-[#1B2B30] border border-[#CFDDE0]",
    activeRing: "ring-2 ring-[#1F4E5A] bg-[#E5EFF1]",
    pill: "bg-[#5B7077] text-white",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full text-left rounded-xl border transition-all duration-200 cursor-pointer ${
        compact ? "px-3 py-2.5" : "px-3.5 py-3"
      } ${toneClasses.bg} ${isActive ? toneClasses.activeRing : "hover:border-[#CFDDE0]"}`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="text-2xl font-black tracking-tight">
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
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${toneClasses.pill}`}>
              Active
            </span>
          )}
        </div>
      </div>

      <p className="mt-1 text-xs font-black uppercase tracking-wide opacity-90">{label}</p>
      {helperText && !compact && (
        <p className="mt-0.5 text-[10.5px] font-semibold opacity-70 group-hover:opacity-100 transition-opacity">
          {isActive ? "Click to clear filter" : helperText}
        </p>
      )}
    </button>
  );
}
