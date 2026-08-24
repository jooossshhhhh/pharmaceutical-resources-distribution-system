import { formatFacilityType, formatStatus } from "../facilityFormat";
import { formatNumber, getHealthMeta } from "../facilityUtils";

export function FacilityCard({ facility, isSelected, onView, onViewOnMap }) {
  const healthMeta = getHealthMeta(facility.stockHealth);
  const alertCount = facility.stockCounts.CRITICAL + facility.stockCounts.LOW;

  return (
    <article
      data-facility-id={facility.id}
      className={`group relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#6be9c2] hover:shadow-md ${
        isSelected
          ? "border-[#6be9c2] ring-2 ring-emerald-100"
          : "border-neutral-200"
      }`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${healthMeta.barClass}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pr-2">
          <h3 className="line-clamp-2 text-base font-black leading-snug text-black">
            {facility.facility_name}
          </h3>
          <p className="mt-0.5 text-sm font-medium text-neutral-500">
            {formatFacilityType(facility.facility_type)} - {facility.facility_code}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onViewOnMap}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition hover:border-[#6be9c2] hover:bg-[#ecfff8] hover:text-[#007a52]"
            aria-label={`View ${facility.facility_name} on map`}
            title="View on map"
          >
            <MapViewIcon />
          </button>
          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${facility.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
            {formatStatus(facility.status)}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm font-medium text-neutral-500">
        <InfoLine icon={<LocationIcon />} text={facility.address} />
        <InfoLine icon={<StockIcon />} text={`${facility.inventoryRows.length} inventory records`} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MetricTile value={formatNumber(facility.stockCounts.totalQuantity)} label="Units" />
        <MetricTile value={formatNumber(facility.requestRows.length)} label="Requests" />
        <MetricTile value={formatNumber(facility.patientCount)} label="Patients" />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs font-bold text-neutral-600">
          <span>Stock Condition</span>
          <span>{facility.healthPercent}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-neutral-100">
          <div
            className={`h-full rounded-full ${healthMeta.barClass}`}
            style={{ width: `${facility.healthPercent}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${healthMeta.badgeClass}`}>
            {healthMeta.label}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-black ${
              alertCount > 0
                ? "bg-red-50 text-red-600"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {alertCount > 0 ? `${alertCount} concerns` : "No concerns"}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={onView}
          className="h-10 w-full rounded-lg bg-[#e5fff4] text-sm font-black text-[#007a52] transition hover:bg-[#d7fbea]"
        >
          View Details
        </button>
      </div>
    </article>
  );
}

export function FacilityCardSkeleton() {
  return (
    <article className="animate-pulse rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="h-4 w-3/5 rounded bg-neutral-100" />
          <div className="mt-2 h-3 w-2/5 rounded bg-neutral-100" />
        </div>
        <div className="h-5 w-16 rounded-full bg-neutral-100" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded bg-neutral-100" />
        <div className="h-3 w-2/3 rounded bg-neutral-100" />
        <div className="h-3 w-1/2 rounded bg-neutral-100" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="h-14 rounded-lg bg-neutral-100" />
        <div className="h-14 rounded-lg bg-neutral-100" />
        <div className="h-14 rounded-lg bg-neutral-100" />
      </div>
      <div className="mt-4">
        <div className="h-3 w-24 rounded bg-neutral-100" />
        <div className="mt-2 h-1.5 rounded-full bg-neutral-100" />
        <div className="mt-2 h-4 w-20 rounded bg-neutral-100" />
      </div>
      <div className="mt-4 h-10 rounded-lg bg-neutral-100" />
    </article>
  );
}

function MetricTile({ value, label }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-3 text-center">
      <p className="text-base font-black text-black">{value}</p>
      <p className="text-xs font-medium text-neutral-500">{label}</p>
    </div>
  );
}

function InfoLine({ icon, text }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-neutral-400">{icon}</span>
      <span className="truncate">{text}</span>
    </div>
  );
}

function MapViewIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
      <path d="M9 3v15M15 6v15" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  );
}

function StockIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7Z" />
      <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
    </svg>
  );
}
