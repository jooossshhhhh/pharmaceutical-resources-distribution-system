import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import {
  AlertCircle,
  ArrowRightLeft,
  Boxes,
  Building2,
  CheckCircle2,
  Eye,
  MapPin,
  X,
} from "lucide-react";

import "leaflet/dist/leaflet.css";

import { formatFacilityType, formatStatus } from "@shared/utils/facilityFormat";
import {
  NAGA_BOUNDS_NORTH_EAST,
  NAGA_BOUNDS_SOUTH_WEST,
  NAGA_CENTER,
} from "@shared/utils/nagaMap";
import {
  formatNumber,
  getFacilityStockTone,
  getStockStatus,
} from "@shared/utils/dashboardUtils";

const MIN_ZOOM = 12;
const MAX_ZOOM = 18;

const STOCK_TIERS = [
  { key: "CRITICAL", label: "Critical", color: "#ef4444" },
  { key: "LOW", label: "Low Stock", color: "#f97316" },
  { key: "WATCH", label: "Monitor Stock", color: "#f59e0b" },
  { key: "HEALTHY", label: "Healthy", color: "#00a36c" },
];

const DEMAND_TIERS = [
  { key: "none", label: "No demand", color: "#cbd5e1" },
  { key: "low", label: "1 – 99", color: "#00a36c" },
  { key: "medium", label: "100 – 499", color: "#f59e0b" },
  { key: "high", label: "500+", color: "#ef4444" },
];

import { isChoFacility } from "@shared/utils/facilityUtils";

export { isChoFacility };

export const BASEMAP_MODES = [
  {
    id: "light",
    label: "Canvas",
    title: "Minimal Light Gray Canvas",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M9 20l-5.447-2.724A2 2 0 012.5 15.485V4.515a1 1 0 011.447-.894L9 6m0 14l6 3m-6-3V6m6 17l5.447-2.724A2 2 0 0021.5 18.485V7.515a1 1 0 00-1.447-.894L15 9m0 14V9m0 0L9 6" />
      </svg>
    ),
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
    maxNativeZoom: 16,
  },
  {
    id: "streets",
    label: "Streets",
    title: "OpenStreetMap Roads & Streets",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
    maxNativeZoom: 19,
    subdomains: ["a", "b", "c"],
  },
  {
    id: "satellite",
    label: "Satellite",
    title: "High-Resolution Aerial Satellite Imagery",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.6 9h16.8M3.6 15h16.8M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9z" />
      </svg>
    ),
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, GIS User Community",
    maxNativeZoom: 18,
  },
  {
    id: "terrain",
    label: "Terrain",
    title: "Topographic Relief & Elevation Contours",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
      </svg>
    ),
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, USGS, FAO, NPS, NRCAN",
    maxNativeZoom: 18,
  },
];

const createFacilityIcon = (
  color,
  highlighted = false,
  isDark = false,
  isChoHub = false,
  isPulsing = false,
  pulseColor = "rgba(239, 68, 68, 0.65)"
) => {
  if (isChoHub) {
    const highlightStyle = highlighted
      ? "outline:3px solid #065f46;outline-offset:2px;"
      : "";
    const shadowStyle = isDark
      ? "box-shadow:0 0 0 2px rgba(0,0,0,0.8), 0 4px 14px rgba(0,0,0,0.9);"
      : "box-shadow:0 3px 12px rgba(0, 163, 108, 0.5), 0 1px 3px rgba(0,0,0,0.25);";

    return L.divIcon({
      className: "prds-map-marker-hub",
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;width:48px;height:52px;">
          ${
            isPulsing
              ? `<span class="prds-radar-pulse" style="position:absolute;width:34px;height:34px;border-radius:9999px;background:${pulseColor};animation:prds-radar-ring 2s cubic-bezier(0.2,0,0.4,1) infinite;top:0;left:7px;pointer-events:none;"></span>`
              : ""
          }
          <span style="position:relative;display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:9999px;background:linear-gradient(135deg, #059669 0%, #047857 100%);border:2.5px solid #ffffff;${shadowStyle}${highlightStyle}">
            <svg style="width:18px;height:18px;fill:#ffffff;" viewBox="0 0 24 24">
              <path d="M19 10.5h-5.5V5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v5.5H5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5h5.5V19c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-5.5H19c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5z"/>
            </svg>
          </span>
          <span style="display:inline-block;margin-top:2px;font-size:8px;font-weight:900;letter-spacing:0.06em;background:#064e3b;color:#ecfdf5;padding:1px 5px;border-radius:9999px;border:1px solid #10b981;box-shadow:0 2px 4px rgba(0,0,0,0.3);white-space:nowrap;line-height:1.2;">
            CHO HUB
          </span>
        </div>
      `,
      iconSize: [48, 52],
      iconAnchor: [24, 17],
      popupAnchor: [0, -22],
    });
  }

  const highlightStyle = highlighted
    ? "outline:3px solid rgba(13,17,23,0.85);outline-offset:2px;"
    : "";
  const shadowStyle = isDark
    ? "box-shadow:0 0 0 2px rgba(0,0,0,0.65), 0 3px 10px rgba(0,0,0,0.85);"
    : "box-shadow:0 2px 8px rgba(13,17,23,0.4);";

  return L.divIcon({
    className: "prds-map-marker",
    html: `
      <div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
        ${
          isPulsing
            ? `<span class="prds-radar-pulse" style="position:absolute;width:24px;height:24px;border-radius:9999px;background:${pulseColor};animation:prds-radar-ring 2s cubic-bezier(0.2,0,0.4,1) infinite;top:0;left:0;pointer-events:none;"></span>`
            : ""
        }
        <span style="position:relative;display:flex;width:22px;height:22px;align-items:center;justify-content:center;border-radius:9999px;background:${color};border:2px solid #ffffff;${shadowStyle}${highlightStyle}">
          <span style="width:7px;height:7px;border-radius:9999px;background:#0d1117;"></span>
        </span>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
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
    <div className="rounded-lg border border-[#d8dadc] bg-white/95 p-2 shadow-md backdrop-blur-sm">
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
    <div className="rounded-xl border border-white/70 bg-white/85 px-3 py-2 shadow-lg shadow-neutral-900/10 backdrop-blur-md">
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
  metricFilter = "all",
  onMetricFilterChange = null,
  className = "h-72",
  fitToCoverage = false,
  showExpand = true,
  onExitFullscreen,
  onSelectFacility,
  focusPosition = null,
  initialBasemap = "light",
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [hiddenStatuses, setHiddenStatuses] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hiddenDemandKeys, setHiddenDemandKeys] = useState([]);
  const [colorMode, setColorMode] = useState("stock");
  const [basemapId, setBasemapId] = useState(initialBasemap);
  const [inspectorFacility, setInspectorFacility] = useState(null);
  const mapRef = useRef(null);
  const isPreview = controlsMode === "preview";

  const activeBasemap = useMemo(
    () => BASEMAP_MODES.find((m) => m.id === basemapId) || BASEMAP_MODES[0],
    [basemapId]
  );
  const isDark = basemapId === "satellite";

  // Automatically align color mode with active metric filter
  useEffect(() => {
    if (metricFilter === "demand") {
      setColorMode("demand");
    } else if (metricFilter === "review") {
      setColorMode("stock");
    }
  }, [metricFilter]);

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

  const hasDemand = Boolean(
    demandByFacility && typeof demandByFacility === "object" && Object.keys(demandByFacility).length > 0
  );

  const pinnedFacilities = useMemo(
    () =>
      (Array.isArray(facilities) ? facilities : []).filter((facility) => {
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

      // Metric card filter
      if (metricFilter === "demand") {
        const demand = (demandByFacility || {})[facility.id] ?? 0;
        if (demand <= 0) return false;
      } else if (metricFilter === "review") {
        const status = (stockStatusByFacility || {})[facility.id] || "HEALTHY";
        if (status !== "CRITICAL" && status !== "LOW") return false;
      }

      if (colorMode === "demand") {
        const tierKey = demandTierFor((demandByFacility || {})[facility.id] ?? 0).key;
        return !hiddenDemandKeys.includes(tierKey);
      }

      const status = (stockStatusByFacility || {})[facility.id] || "HEALTHY";
      return !hiddenStatuses.includes(status);
    });
  }, [
    colorMode,
    demandByFacility,
    hiddenDemandKeys,
    hiddenStatuses,
    metricFilter,
    pinnedFacilities,
    query,
    stockStatusByFacility,
  ]);

  const fitPositions = useMemo(
    () =>
      visibleFacilities.map((facility) => [
        Number(facility.latitude),
        Number(facility.longitude),
      ]),
    [visibleFacilities]
  );

  const statusCounts = useMemo(() => {
    const counts = { CRITICAL: 0, LOW: 0, WATCH: 0, HEALTHY: 0 };
    pinnedFacilities.forEach((facility) => {
      const status = (stockStatusByFacility || {})[facility.id] || "HEALTHY";
      if (counts[status] !== undefined) counts[status] += 1;
    });
    return counts;
  }, [pinnedFacilities, stockStatusByFacility]);

  const demandCounts = useMemo(() => {
    const counts = { none: 0, low: 0, medium: 0, high: 0 };
    pinnedFacilities.forEach((facility) => {
      const tierKey = demandTierFor((demandByFacility || {})[facility.id] ?? 0).key;
      counts[tierKey] += 1;
    });
    return counts;
  }, [demandByFacility, pinnedFacilities]);

  const stockAlertsByFacility = useMemo(() => {
    if (!Array.isArray(inventoryRows)) return {};

    return inventoryRows.reduce((acc, row) => {
      const quantity = Number(row?.quantity || 0);
      const threshold = Number(row?.threshold || 0);
      const isAlert =
        row?.is_below_threshold ||
        quantity <= threshold ||
        ["CRITICAL", "LOW"].includes(getStockStatus(row));

      if (!isAlert) return acc;

      const facilityId = row?.facility_id;
      if (!facilityId) return acc;

      if (!acc[facilityId]) acc[facilityId] = [];
      acc[facilityId].push(row);
      return acc;
    }, {});
  }, [inventoryRows]);

  const toggleStatus = (key) => {
    setHiddenStatuses((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );
  };

  const toggleDemandTier = (key) => {
    setHiddenDemandKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );
  };

  const resetView = () => {
    mapRef.current?.flyTo(NAGA_CENTER, 13);
  };

  return (
    <div className="relative isolate h-full">
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
        className={`z-0 w-full bg-[#eef1f4] ${className} rounded-xl border border-[#d8dadc]`}
      >
        <TileLayer
          key={activeBasemap.id}
          attribution={activeBasemap.attribution}
          eventHandlers={{
            tileerror: (event) => {
              event.tile.style.display = "none";
            },
          }}
          maxNativeZoom={activeBasemap.maxNativeZoom || 18}
          maxZoom={MAX_ZOOM}
          subdomains={activeBasemap.subdomains || ["a", "b", "c"]}
          url={activeBasemap.url}
        />
        <ZoomControl position="bottomright" />
        <FitBounds fitToCoverage={fitToCoverage} positions={fitPositions} />
        <FlyToFacility focus={focusPosition} />

        {visibleFacilities.map((facility) => {
          const status = (stockStatusByFacility || {})[facility.id] || "HEALTHY";
          const demand = (demandByFacility || {})[facility.id] ?? 0;
          const color = STOCK_TIERS.find((tier) => tier.key === status)?.color || "#00a36c";
          const tone = getFacilityStockTone(status);
          const isSelected = inspectorFacility?.id === facility.id;
          const highlighted = isSelected || highlightedIds.has(facility.id);
          const alerts = (stockAlertsByFacility || {})[facility.id] || [];
          const isHub = isChoFacility(facility);
          const isPulsing = status === "CRITICAL" || status === "LOW";
          const pulseColor = status === "CRITICAL" ? "rgba(239, 68, 68, 0.65)" : "rgba(249, 115, 22, 0.65)";

          return (
            <Marker
              key={facility.id}
              position={[Number(facility.latitude), Number(facility.longitude)]}
              icon={createFacilityIcon(color, highlighted, isDark, isHub, isPulsing, pulseColor)}
              eventHandlers={{
                click: () => {
                  setInspectorFacility(facility);
                },
              }}
            >
              <Tooltip direction="top" offset={[0, isHub ? -18 : -6]} opacity={1}>
                <div>
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-black text-[#0d1117]">{facility.facility_name}</p>
                    {isHub && (
                      <span className="rounded bg-emerald-100 px-1 text-[9px] font-black text-emerald-800">
                        HUB
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-semibold text-neutral-500">
                    {colorMode === "demand"
                      ? `${formatNumber(demand)} expected use`
                      : `${status} stock`}
                  </p>
                </div>
              </Tooltip>
              <Popup className="prds-map-popup">
                <div className="min-w-44 text-sm">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-black text-[#0d1117]">{facility.facility_name}</p>
                    {isHub && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-800">
                        CHO HUB
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-neutral-500">
                    {facility.facility_code} · {formatFacilityType(facility.facility_type)}
                  </p>
                  {facility.address && (
                    <p className="mt-1 text-xs font-medium text-neutral-600">{facility.address}</p>
                  )}
                  <p className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-black ${tone.className}`}>
                      {status} stock
                    </span>
                    <span className="text-xs font-semibold text-neutral-400">
                      {formatStatus(facility.status)}
                    </span>
                  </p>

                  {stockAlertsByFacility != null && (
                    <div className="mt-2 border-t border-neutral-100 pt-1.5">
                      {alerts.length > 0 ? (
                        <>
                          <p className="text-[11px] font-black uppercase tracking-wide text-red-600">
                            Low / out of stock ({alerts.length})
                          </p>
                          <ul className="mt-1 space-y-1">
                            {alerts.slice(0, 3).map((alert) => {
                              const medicine = alert.medicine;
                              const name = [medicine?.generic_name, medicine?.dosage]
                                .filter(Boolean)
                                .join(" ");

                              return (
                                <li key={alert.id || alert.batch_number || name} className="flex items-center justify-between gap-2 text-xs">
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
                          {alerts.length > 3 && (
                            <p className="mt-1 text-[11px] font-bold text-neutral-400">
                              +{alerts.length - 3} more
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[11px] font-bold text-emerald-600">No stock alerts</p>
                      )}
                    </div>
                  )}

                  <div className="mt-2.5 flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setInspectorFacility(facility)}
                      className="w-full rounded-lg bg-emerald-700 py-1.5 text-xs font-black text-white transition hover:bg-emerald-800 flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Quick Inspect
                    </button>
                    {onSelectFacility && (
                      <button
                        type="button"
                        onClick={() => onSelectFacility(facility)}
                        className="w-full rounded-lg bg-neutral-100 py-1.5 text-xs font-black text-neutral-700 transition hover:bg-neutral-200"
                      >
                        Facility Profile
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Empty State Overlay */}
      {visibleFacilities.length === 0 && (
        <div className="absolute inset-x-4 top-20 z-[1150] mx-auto max-w-sm rounded-xl border border-neutral-200 bg-white/95 p-4 text-center shadow-lg backdrop-blur-md">
          <p className="text-xs font-black text-neutral-700">No matching facilities</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {metricFilter === "review"
              ? "No facilities currently have low or critical stock alerts."
              : metricFilter === "demand"
                ? "No facilities currently have recorded demand forecasts."
                : "Try adjusting your search or legend filter."}
          </p>
          {metricFilter !== "all" && onMetricFilterChange && (
            <button
              type="button"
              onClick={() => onMetricFilterChange("all")}
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
            >
              Show all facilities
            </button>
          )}
        </div>
      )}

      {/* Floating Facility Search */}
      {!isPreview && (
        <div className="absolute left-3 top-3 z-[1200] w-52">
          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search facility..."
              className="h-9 w-full rounded-lg border border-neutral-200 bg-white/95 pl-3 pr-8 text-xs font-semibold text-neutral-800 shadow-md outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 backdrop-blur-sm"
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

      {/* Floating Controls Overlay (Basemap Switcher + Actions) */}
      <div className="absolute right-3 top-3 z-[1200] flex flex-wrap items-center justify-end gap-1.5">
        {/* Basemap Mode Selector */}
        <div className="flex items-center rounded-lg border border-[#d8dadc] bg-white/95 p-0.5 shadow-md backdrop-blur-sm">
          {BASEMAP_MODES.map((mode) => {
            const isActive = basemapId === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setBasemapId(mode.id)}
                title={mode.title}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-black transition ${
                  isActive
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-black"
                }`}
              >
                <span className="shrink-0">{mode.icon}</span>
                <span className="hidden md:inline">{mode.label}</span>
              </button>
            );
          })}
        </div>

        {!isPreview && hasDemand && (
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
          title="Reset view to center"
          className="rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-black text-neutral-700 shadow-md backdrop-blur-sm transition hover:bg-neutral-50"
        >
          Reset
        </button>

        {onExitFullscreen ? (
          <button
            type="button"
            onClick={onExitFullscreen}
            title="Close full screen view"
            aria-label="Close full screen view"
            className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-white/95 text-neutral-700 shadow-md backdrop-blur-sm transition hover:bg-neutral-50"
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
              className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-white/95 text-neutral-700 shadow-md backdrop-blur-sm transition hover:bg-neutral-50"
            >
              <MaximizeIcon />
            </button>
          )
        )}
      </div>

      {/* Legend */}
      <div className={`absolute z-[1100] ${isPreview ? "bottom-2 left-2" : "bottom-3 left-3"}`}>
        {isPreview ? (
          <PreviewLegend counts={statusCounts} />
        ) : (
          <ToggleLegend
            title={colorMode === "demand" ? "Expected use" : "Stock status"}
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

      {/* Slide-over Facility Quick-Inspector Drawer */}
      {inspectorFacility && (
        <aside
          aria-label="Facility quick inspector"
          className="absolute right-3 top-14 bottom-3 z-[1250] flex w-80 max-w-[calc(100%-24px)] flex-col rounded-xl border border-neutral-200/90 bg-white/95 shadow-2xl backdrop-blur-md transition-all duration-300"
        >
          {/* Header */}
          <div className="relative border-b border-neutral-100 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 pr-6">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
                    {inspectorFacility.facility_code}
                  </span>
                  {isChoFacility(inspectorFacility) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                      <Building2 className="h-3 w-3" />
                      CHO HUB
                    </span>
                  )}
                </div>
                <h3 className="mt-1 text-sm font-black text-[#0d1117] leading-snug truncate" title={inspectorFacility.facility_name}>
                  {inspectorFacility.facility_name}
                </h3>
                <p className="mt-0.5 text-[11px] font-semibold text-neutral-500">
                  {formatFacilityType(inspectorFacility.facility_type)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectorFacility(null)}
                aria-label="Close inspector"
                className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
            {/* Location */}
            <div className="rounded-lg bg-neutral-50 p-2.5 text-xs">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-700">
                    {inspectorFacility.address || "City of Naga, Cebu"}
                  </p>
                  <p className="text-[10px] font-mono text-neutral-400 mt-0.5">
                    {Number(inspectorFacility.latitude).toFixed(4)}, {Number(inspectorFacility.longitude).toFixed(4)}
                  </p>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-neutral-100 p-2.5">
                <p className="text-[10px] font-black uppercase text-neutral-400">Stock Status</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor:
                        STOCK_TIERS.find(
                          (t) => t.key === ((stockStatusByFacility || {})[inspectorFacility.id] || "HEALTHY")
                        )?.color || "#00a36c",
                    }}
                  />
                  <span className="text-xs font-black text-neutral-800">
                    {(stockStatusByFacility || {})[inspectorFacility.id] || "HEALTHY"}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-neutral-100 p-2.5">
                <p className="text-[10px] font-black uppercase text-neutral-400">Expected Demand</p>
                <p className="mt-1 text-xs font-black text-neutral-800">
                  {formatNumber((demandByFacility || {})[inspectorFacility.id] ?? 0)} units
                </p>
              </div>
            </div>

            {/* Stock Alerts Breakdown */}
            <div>
              <div className="flex items-center justify-between pb-1.5">
                <p className="text-[11px] font-black uppercase tracking-wide text-neutral-600">
                  Stock Review Items
                </p>
                {((stockAlertsByFacility || {})[inspectorFacility.id] || []).length > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">
                    {((stockAlertsByFacility || {})[inspectorFacility.id] || []).length} alert{((stockAlertsByFacility || {})[inspectorFacility.id] || []).length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {((stockAlertsByFacility || {})[inspectorFacility.id] || []).length > 0 ? (
                <div className="space-y-2">
                  {((stockAlertsByFacility || {})[inspectorFacility.id] || []).map((alert) => {
                    const med = alert.medicine;
                    const name = med?.generic_name || "Stock item";
                    const dosage = med?.dosage || "";
                    const brand = med?.brand_name ? `(${med.brand_name})` : "";
                    const qty = Number(alert.quantity || 0);
                    const thresh = Number(alert.threshold || 0);
                    const isCrit = qty === 0 || qty <= Math.max(1, Math.floor(thresh * 0.25));

                    return (
                      <div
                        key={alert.id || alert.batch_number || `${alert.medicine_id}-${qty}`}
                        className="rounded-lg border border-red-100 bg-red-50/50 p-2.5 text-xs"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <p className="font-bold text-neutral-800 truncate" title={`${name} ${dosage} ${brand}`}>
                            {name} <span className="font-normal text-neutral-500">{dosage}</span>
                          </p>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${isCrit ? "bg-red-600 text-white" : "bg-orange-500 text-white"}`}>
                            {isCrit ? "CRITICAL" : "LOW"}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-neutral-600">
                          <span>Qty: <strong className="text-red-700">{qty}</strong> / Min: {thresh}</span>
                          {alert.batch_number && (
                            <span className="text-neutral-400 font-mono text-[10px]">
                              #{alert.batch_number}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-center">
                  <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-600" />
                  <p className="mt-1 text-xs font-bold text-emerald-800">
                    Optimal Stock Health
                  </p>
                  <p className="mt-0.5 text-[11px] text-emerald-600">
                    All monitored items are within healthy operating thresholds.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions Footer */}
          <div className="border-t border-neutral-100 bg-neutral-50/70 p-3 space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  navigate("/inventory", {
                    state: {
                      facilityId: inspectorFacility.id,
                      facilityName: inspectorFacility.facility_name,
                    },
                  });
                }}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs font-black text-neutral-700 shadow-xs transition hover:bg-neutral-100"
              >
                <Boxes className="h-3.5 w-3.5 text-emerald-700" />
                Inventory
              </button>
              <button
                type="button"
                onClick={() => {
                  navigate("/transfers", {
                    state: {
                      destFacilityId: inspectorFacility.id,
                      facilityName: inspectorFacility.facility_name,
                    },
                  });
                }}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-xs font-black text-neutral-700 shadow-xs transition hover:bg-neutral-100"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 text-blue-700" />
                Transfer
              </button>
            </div>

            {onSelectFacility && (
              <button
                type="button"
                onClick={() => {
                  onSelectFacility(inspectorFacility);
                }}
                className="w-full rounded-lg bg-emerald-700 py-2 text-xs font-black text-white shadow-xs transition hover:bg-emerald-800"
              >
                Open Facility Details
              </button>
            )}
          </div>
        </aside>
      )}

      {isFullscreen &&
        createPortal(
          <div className="fixed inset-0 z-[2000] flex flex-col bg-white">
            <div className="border-b border-neutral-100 px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                  City of Naga
                </p>
                <h2 className="text-base font-black text-[#0d1117]">Facility & Stock Map</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200"
              >
                Close Fullscreen
              </button>
            </div>
            <div className="min-h-0 flex-1 p-4">
              <FacilityMap
                facilities={facilities}
                stockStatusByFacility={stockStatusByFacility}
                inventoryRows={inventoryRows}
                demandByFacility={demandByFacility}
                metricFilter={metricFilter}
                onMetricFilterChange={onMetricFilterChange}
                className="h-full"
                initialBasemap={basemapId}
                onExitFullscreen={() => setIsFullscreen(false)}
                onSelectFacility={onSelectFacility}
                focusPosition={focusPosition}
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
