import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";

import { formatFacilityType, formatStatus } from "../../facilities/facilityFormat";
import {
  NAGA_BOUNDS_NORTH_EAST,
  NAGA_BOUNDS_SOUTH_WEST,
  NAGA_CENTER,
} from "../../../utils/nagaMap";
import { formatNumber, getFacilityStockTone } from "../dashboardUtils";

const MIN_ZOOM = 12;
const MAX_ZOOM = 18;

const STOCK_TIERS = [
  { key: "CRITICAL", label: "Critical", color: "#ef4444" },
  { key: "LOW", label: "Low", color: "#f97316" },
  { key: "WATCH", label: "Watch", color: "#f59e0b" },
  { key: "HEALTHY", label: "Healthy", color: "#00a36c" },
];

const DEMAND_TIERS = [
  { key: "none", label: "No demand", color: "#cbd5e1" },
  { key: "low", label: "1 – 99", color: "#00a36c" },
  { key: "medium", label: "100 – 499", color: "#f59e0b" },
  { key: "high", label: "500+", color: "#ef4444" },
];

const createFacilityIcon = (color, highlighted = false) => {
  const highlightStyle = highlighted
    ? "outline:3px solid rgba(13,17,23,0.85);outline-offset:2px;"
    : "";

  return L.divIcon({
    className: "prds-map-marker",
    html: `
      <span style="display:flex;width:22px;height:22px;align-items:center;justify-content:center;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 2px 8px rgba(13,17,23,0.4);${highlightStyle}">
        <span style="width:7px;height:7px;border-radius:9999px;background:#0d1117;"></span>
      </span>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  });
};

const demandTierFor = (demand) => {
  if (!demand || demand <= 0) return DEMAND_TIERS[0];
  if (demand < 100) return DEMAND_TIERS[1];
  if (demand < 500) return DEMAND_TIERS[2];
  return DEMAND_TIERS[3];
};

const matchesQuery = (facility, needle) =>
  [facility.facility_name, facility.facility_code, facility.address]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(needle));

function FitBounds({ fitToCoverage = false, positions }) {
  const map = useMap();

  useEffect(() => {
    if (fitToCoverage) {
      map.fitBounds(
        L.latLngBounds(NAGA_BOUNDS_SOUTH_WEST, NAGA_BOUNDS_NORTH_EAST),
        { padding: [24, 24], maxZoom: 12 }
      );
      return;
    }

    const bounds = positions.length > 0 ? L.latLngBounds(positions) : null;

    if (bounds) {
      const paddedBounds = bounds.pad(0.18);
      map.fitBounds(paddedBounds, { padding: [32, 32], maxZoom: 14 });
      return;
    }

    map.fitBounds(
      L.latLngBounds(NAGA_BOUNDS_SOUTH_WEST, NAGA_BOUNDS_NORTH_EAST),
      { padding: [16, 16], maxZoom: 13 }
    );
  }, [fitToCoverage, map, positions]);

  return null;
}

function FlyToFacility({ focus }) {
  const map = useMap();

  useEffect(() => {
    if (!focus) return;

    const latitude = Number(focus.latitude);
    const longitude = Number(focus.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    map.flyTo([latitude, longitude], 15, { duration: 0.9 });
  }, [map, focus]);

  return null;
}

function ToggleLegend({ tiers, activeKeys, counts, onToggle, title }) {
  return (
    <div className="rounded-lg border border-[#d8dadc] bg-white/95 p-2 shadow-md">
      <p className="px-0.5 pb-1 text-[10px] font-black uppercase tracking-wide text-neutral-500">
        {title}
      </p>
      <ul className="grid gap-0.5">
        {tiers.map((tier) => {
          const active = activeKeys.includes(tier.key);
          const count = counts[tier.key] || 0;

          return (
            <li key={tier.key}>
              <button
                type="button"
                onClick={() => onToggle(tier.key)}
                title={active ? `Hide ${tier.label}` : `Show ${tier.label}`}
                className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] font-bold transition ${
                  active ? "text-[#0d1117]" : "text-neutral-400"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow"
                  style={{ background: tier.color, opacity: active ? 1 : 0.35 }}
                />
                <span className="flex-1">{tier.label}</span>
                <span
                  className={`rounded-full px-1.5 text-[10px] font-black ${
                    active ? "bg-neutral-100 text-neutral-600" : "bg-neutral-50 text-neutral-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PreviewLegend({ counts }) {
  return (
    <div className="rounded-xl border border-white/70 bg-white/75 px-3 py-2 shadow-lg shadow-neutral-900/10 backdrop-blur-md">
      <p className="px-0.5 pb-1 text-[10px] font-black uppercase tracking-wide text-neutral-500">
        Stock status
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {STOCK_TIERS.map((tier) => (
          <span
            key={tier.key}
            className="inline-flex items-center gap-1.5 text-[11px] font-black text-neutral-700"
          >
            <span
              className="h-2.5 w-2.5 rounded-full border border-white shadow-sm"
              style={{ backgroundColor: tier.color }}
            />
            {tier.label}
            <span className="rounded-full bg-white/80 px-1.5 text-[10px] font-black text-neutral-500">
              {counts[tier.key] || 0}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function MaximizeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export default function FacilityMap({
  controlsMode = "full",
  facilities = [],
  stockStatusByFacility = {},
  inventoryRows = null,
  demandByFacility = {},
  className = "h-72",
  fitToCoverage = false,
  showExpand = true,
  onExitFullscreen,
  onSelectFacility,
  focusPosition = null,
}) {
  const [query, setQuery] = useState("");
  const [hiddenStatuses, setHiddenStatuses] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hiddenDemandKeys, setHiddenDemandKeys] = useState([]);
  const [colorMode, setColorMode] = useState("stock");
  const mapRef = useRef(null);
  const isPreview = controlsMode === "preview";

  useEffect(() => {
    if (!isFullscreen) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  const hasDemand = Object.keys(demandByFacility).length > 0;

  const pinnedFacilities = useMemo(
    () =>
      facilities.filter((facility) => {
        const latitude = Number(facility.latitude);
        const longitude = Number(facility.longitude);
        return Number.isFinite(latitude) && Number.isFinite(longitude);
      }),
    [facilities]
  );

  const queryMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return pinnedFacilities.filter((facility) => matchesQuery(facility, needle));
  }, [pinnedFacilities, query]);

  const highlightedIds = useMemo(() => new Set(queryMatches.map((facility) => facility.id)), [queryMatches]);

  const visibleFacilities = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return pinnedFacilities.filter((facility) => {
      if (needle && !matchesQuery(facility, needle)) return false;

      if (colorMode === "demand") {
        const tierKey = demandTierFor(demandByFacility[facility.id] || 0).key;
        return !hiddenDemandKeys.includes(tierKey);
      }

      const status = stockStatusByFacility[facility.id] || "HEALTHY";
      return !hiddenStatuses.includes(status);
    });
  }, [
    pinnedFacilities,
    query,
    hiddenDemandKeys,
    hiddenStatuses,
    colorMode,
    demandByFacility,
    stockStatusByFacility,
  ]);

  const fitPositions = useMemo(
    () =>
      (queryMatches.length > 0 ? queryMatches : pinnedFacilities).map((facility) => [
        Number(facility.latitude),
        Number(facility.longitude),
      ]),
    [queryMatches, pinnedFacilities]
  );

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(STOCK_TIERS.map((tier) => [tier.key, 0]));
    pinnedFacilities.forEach((facility) => {
      const status = stockStatusByFacility[facility.id] || "HEALTHY";
      counts[status] += 1;
    });
    return counts;
  }, [pinnedFacilities, stockStatusByFacility]);

  const demandCounts = useMemo(() => {
    const counts = Object.fromEntries(DEMAND_TIERS.map((tier) => [tier.key, 0]));
    pinnedFacilities.forEach((facility) => {
      const tierKey = demandTierFor(demandByFacility[facility.id] || 0).key;
      counts[tierKey] += 1;
    });
    return counts;
  }, [pinnedFacilities, demandByFacility]);

  const stockAlertsByFacility = useMemo(() => {
    if (inventoryRows == null) return null;

    const alertsByFacility = {};
    inventoryRows.forEach((row) => {
      const facilityId = row.facility_id;
      if (!facilityId) return;

      const quantity = Number(row.quantity || 0);
      const threshold = Number(row.threshold || 0);
      if (quantity <= threshold) {
        if (!alertsByFacility[facilityId]) {
          alertsByFacility[facilityId] = [];
        }
        alertsByFacility[facilityId].push(row);
      }
    });
    return alertsByFacility;
  }, [inventoryRows]);

  const toggleStatus = (key) => {
    setHiddenStatuses((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const toggleDemandTier = (key) => {
    setHiddenDemandKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const resetView = () => {
    mapRef.current?.flyTo(NAGA_CENTER, 13);
  };

  return (
    <div className="relative h-full">
      <MapContainer
        ref={mapRef}
        center={NAGA_CENTER}
        zoom={MIN_ZOOM}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        maxBounds={L.latLngBounds(NAGA_BOUNDS_SOUTH_WEST, NAGA_BOUNDS_NORTH_EAST)}
        maxBoundsViscosity={1}
        scrollWheelZoom={isPreview}
        zoomControl={false}
        className={`z-0 w-full ${className} rounded-xl border border-[#d8dadc]`}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png"
        />
        <ZoomControl position="bottomright" />
        <FitBounds fitToCoverage={fitToCoverage} positions={fitPositions} />
        <FlyToFacility focus={focusPosition} />

        {visibleFacilities.map((facility) => {
          const status = stockStatusByFacility[facility.id] || "HEALTHY";
          const demand = demandByFacility[facility.id] || 0;
          const color = STOCK_TIERS.find((tier) => tier.key === status)?.color || "#00a36c";
          const tone = getFacilityStockTone(status);
          const highlighted = highlightedIds.has(facility.id);
          const alerts = stockAlertsByFacility?.[facility.id] || [];

          return (
            <Marker
              key={facility.id}
              position={[Number(facility.latitude), Number(facility.longitude)]}
              icon={createFacilityIcon(color, highlighted)}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                <div>
                  <p className="text-xs font-black text-[#0d1117]">{facility.facility_name}</p>
                  <p className="text-[11px] font-semibold text-neutral-500">
                    {colorMode === "demand"
                      ? `${formatNumber(demand)} forecasted demand`
                      : `${status} stock`}
                  </p>
                </div>
              </Tooltip>
              <Popup className="prds-map-popup">
                <div className="min-w-40 text-sm">
                  <p className="font-black text-[#0d1117]">{facility.facility_name}</p>
                  <p className="text-xs font-semibold text-neutral-500">
                    {facility.facility_code} · {formatFacilityType(facility.facility_type)}
                  </p>
                  {facility.address && (
                    <p className="mt-1 text-xs font-medium text-neutral-600">{facility.address}</p>
                  )}
                  <p className="mt-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-black ${tone.className}`}>
                      {status} stock
                    </span>
                    <span className="ml-1.5 text-xs font-semibold text-neutral-400">
                      {formatStatus(facility.status)}
                    </span>
                  </p>

                  {stockAlertsByFacility != null && (
                    <div className="mt-2 border-t border-neutral-100 pt-1.5">
                      {alerts.length > 0 ? (
                        <>
                          <p className="text-[11px] font-black uppercase tracking-wide text-red-600">
                            Low / out of stock
                          </p>
                          <ul className="mt-1 space-y-1">
                            {alerts.slice(0, 4).map((alert) => {
                              const medicine = alert.medicine;
                              const name = [medicine?.generic_name, medicine?.dosage]
                                .filter(Boolean)
                                .join(" ");

                              return (
                                <li key={alert.id} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="min-w-0 truncate font-semibold text-neutral-700">
                                    {name || "Stock item"}
                                  </span>
                                  <span className="shrink-0 font-black text-red-600">
                                    {Number(alert.quantity)} / {Number(alert.threshold)}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                          {alerts.length > 4 && (
                            <p className="mt-1 text-[11px] font-bold text-neutral-400">
                              +{alerts.length - 4} more
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[11px] font-bold text-emerald-600">No stock alerts</p>
                      )}
                    </div>
                  )}

                  {onSelectFacility && (
                    <button
                      type="button"
                      onClick={() => onSelectFacility(facility)}
                      className="mt-2 w-full rounded-lg bg-emerald-50 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                    >
                      View details
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {!isPreview && (
        <div className="absolute left-3 top-3 z-[1200] w-52">
          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search facility..."
              className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-3 pr-8 text-xs font-semibold text-neutral-800 shadow-md outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear facility search"
                className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
              >
                <ClearIcon />
              </button>
            )}
          </div>
          {query.trim() && queryMatches.length === 0 && (
            <p className="mt-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[11px] font-bold text-neutral-500 shadow-md">
              No matching facilities.
            </p>
          )}
        </div>
      )}

      {!isPreview && (
        <div className="absolute right-3 top-3 z-[1200] flex flex-wrap justify-end gap-1.5">
        {hasDemand && (
          <button
            type="button"
            onClick={() => setColorMode((current) => (current === "stock" ? "demand" : "stock"))}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-black transition ${
              colorMode === "demand"
                ? "bg-emerald-600 text-white"
                : "bg-white text-neutral-700 shadow-md hover:bg-neutral-50"
            }`}
          >
            {colorMode === "demand" ? "Demand" : "Stock"}
          </button>
        )}
        <button
          type="button"
          onClick={resetView}
          title="Reset view"
          className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-black text-neutral-700 shadow-md transition hover:bg-neutral-50"
        >
          Reset
        </button>
        {onExitFullscreen ? (
          <button
            type="button"
            onClick={onExitFullscreen}
            title="Close full screen view"
            aria-label="Close full screen view"
            className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-white text-neutral-700 shadow-md transition hover:bg-neutral-50"
          >
            <MinimizeIcon />
          </button>
        ) : (
          showExpand && (
            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              title="View full size"
              aria-label="View map full size"
              className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-white text-neutral-700 shadow-md transition hover:bg-neutral-50"
            >
              <MaximizeIcon />
            </button>
          )
        )}
        </div>
      )}

      <div className={`absolute z-[1100] ${isPreview ? "bottom-2 left-2" : "bottom-3 left-3"}`}>
        {isPreview ? (
          <PreviewLegend counts={statusCounts} />
        ) : (
          <ToggleLegend
            title={colorMode === "demand" ? "Forecast demand" : "Stock status"}
            tiers={colorMode === "demand" ? DEMAND_TIERS : STOCK_TIERS}
            activeKeys={
              colorMode === "demand"
                ? DEMAND_TIERS.map((tier) => tier.key).filter((key) => !hiddenDemandKeys.includes(key))
                : STOCK_TIERS.map((tier) => tier.key).filter((key) => !hiddenStatuses.includes(key))
            }
            counts={colorMode === "demand" ? demandCounts : statusCounts}
            onToggle={colorMode === "demand" ? toggleDemandTier : toggleStatus}
          />
        )}
      </div>

      {isFullscreen && (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-white">
          <div className="border-b border-neutral-100 px-5 py-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
              City of Naga
            </p>
            <h2 className="text-base font-black text-[#0d1117]">Facility & Stock Map</h2>
          </div>
          <div className="min-h-0 flex-1 p-4">
            <FacilityMap
              facilities={facilities}
              stockStatusByFacility={stockStatusByFacility}
              inventoryRows={inventoryRows}
              demandByFacility={demandByFacility}
              className="h-full"
              onExitFullscreen={() => setIsFullscreen(false)}
              onSelectFacility={onSelectFacility}
              focusPosition={focusPosition}
            />
          </div>
        </div>
      )}
    </div>
  );
}
