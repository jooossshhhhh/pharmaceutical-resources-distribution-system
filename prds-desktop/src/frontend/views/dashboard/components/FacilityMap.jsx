import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import { Boxes } from "lucide-react";

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
  { key: "CRITICAL", label: "Critical", color: "#D9826B" },
  { key: "LOW", label: "Low Stock", color: "#dc8939" },
  { key: "WATCH", label: "Monitor Stock", color: "#f3f029" },
  { key: "HEALTHY", label: "Healthy", color: "#4C9F80" },
];

const DEMAND_TIERS = [
  { key: "none", label: "No demand", color: "#cbd5e1" },
  { key: "low", label: "1 – 99", color: "#4C9F80" },
  { key: "medium", label: "100 – 499", color: "#dc8939" },
  { key: "high", label: "500+", color: "#D9826B" },
];

import { isChoFacility } from "@shared/utils/facilityUtils";
import { isTauriEnvironment } from "@backend/database/sqliteClient";

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

function MapAutoResizer() {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener("resize", handleResize);
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [map]);

  return null;
}

function FitBounds({ fitToCoverage = false, positions }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();

    if (fitToCoverage) {
      map.fitBounds(
        L.latLngBounds(NAGA_BOUNDS_SOUTH_WEST, NAGA_BOUNDS_NORTH_EAST),
        { paddingTopLeft: [40, 72], paddingBottomRight: [40, 40], maxZoom: 12 }
      );
      return;
    }

    const bounds = positions.length > 0 ? L.latLngBounds(positions) : null;

    if (bounds) {
      const paddedBounds = bounds.pad(0.18);
      map.fitBounds(paddedBounds, {
        paddingTopLeft: [48, 72],
        paddingBottomRight: [48, 48],
        maxZoom: 14,
      });
      return;
    }

    map.fitBounds(
      L.latLngBounds(NAGA_BOUNDS_SOUTH_WEST, NAGA_BOUNDS_NORTH_EAST),
      { paddingTopLeft: [40, 72], paddingBottomRight: [40, 40], maxZoom: 13 }
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
  const mapRef = useRef(null);
  const isPreview = controlsMode === "preview";
  const isDesktop = isTauriEnvironment();
  const [isTitlebarPinned, setIsTitlebarPinned] = useState(() => {
    if (!isTauriEnvironment()) return false;
    const saved = localStorage.getItem("prds-titlebar-pinned");
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    const handlePinChange = () => {
      const saved = localStorage.getItem("prds-titlebar-pinned");
      setIsTitlebarPinned(saved !== null ? saved === "true" : true);
    };
    window.addEventListener("storage", handlePinChange);
    window.addEventListener("prds-titlebar-pin-change", handlePinChange);
    return () => {
      window.removeEventListener("storage", handlePinChange);
      window.removeEventListener("prds-titlebar-pin-change", handlePinChange);
    };
  }, []);

  const activeBasemap = useMemo(
    () => BASEMAP_MODES.find((m) => m.id === basemapId) || BASEMAP_MODES[0],
    [basemapId]
  );
  const isDark = basemapId === "satellite";

  // Automatically align color mode with active metric filter
  useEffect(() => {
    if (metricFilter === "demand") {
      setColorMode("demand");
    } else if (metricFilter === "review" || metricFilter === "healthy") {
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
      } else if (metricFilter === "healthy") {
        const status = (stockStatusByFacility || {})[facility.id] || "HEALTHY";
        if (status !== "HEALTHY" && status !== "MONITOR") return false;
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
    if (mapRef.current) {
      if (fitPositions.length > 0) {
        const bounds = L.latLngBounds(fitPositions).pad(0.18);
        mapRef.current.fitBounds(bounds, {
          paddingTopLeft: [48, 72],
          paddingBottomRight: [48, 48],
          maxZoom: 14,
        });
      } else {
        mapRef.current.flyTo(NAGA_CENTER, 13);
      }
    }
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
        <MapAutoResizer />
        <FitBounds fitToCoverage={fitToCoverage} positions={fitPositions} />
        <FlyToFacility focus={focusPosition} />

        {visibleFacilities.map((facility) => {
          const status = (stockStatusByFacility || {})[facility.id] || "HEALTHY";
          const demand = (demandByFacility || {})[facility.id] ?? 0;
          const color = STOCK_TIERS.find((tier) => tier.key === status)?.color || "#4C9F80";
          const tone = getFacilityStockTone(status);
          const highlighted = highlightedIds.has(facility.id);
          const alerts = (stockAlertsByFacility || {})[facility.id] || [];
          const isHub = isChoFacility(facility);
          const isPulsing = status === "CRITICAL" || status === "LOW";
          const pulseColor = status === "CRITICAL" ? "rgba(217, 130, 107, 0.65)" : "rgba(220, 137, 57, 0.65)";

          return (
            <Marker
              key={facility.id}
              position={[Number(facility.latitude), Number(facility.longitude)]}
              icon={createFacilityIcon(color, highlighted, isDark, isHub, isPulsing, pulseColor)}
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
              <Popup className="prds-map-popup" maxWidth={260} minWidth={220} autoPan={true}>
                <div className="text-xs">
                  {/* Title & Badge */}
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-black text-xs text-[#1B2B30] leading-snug">
                          {facility.facility_name}
                        </p>
                        {isHub && (
                          <span className="rounded bg-[#E2F3EC] px-1.5 py-0.5 text-[9px] font-black text-[#226048]">
                            CHO HUB
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] font-semibold text-[#5B7077]">
                        {facility.facility_code} · {formatFacilityType(facility.facility_type)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${tone.className}`}>
                      {status}
                    </span>
                  </div>

                  {/* Quick KPI Strip */}
                  <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-lg bg-[#F9FBFB] border border-[#CFDDE0]/70 p-2 text-center">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#5B7077]">
                        Stock Health
                      </p>
                      <p className="text-xs font-black text-[#1B2B30] mt-0.5">
                        {status === "HEALTHY" ? "Optimal" : status === "LOW" ? "Low Stock" : "Critical"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#5B7077]">
                        Next Mo. Need
                      </p>
                      <p className="text-xs font-black text-[#1B2B30] mt-0.5">
                        {formatNumber(demand)} units
                      </p>
                    </div>
                  </div>

                  {/* Stock Alerts (Only if any items need replenishment) */}
                  {alerts.length > 0 && (
                    <div className="mt-2 rounded-lg border border-[#D9826B]/30 bg-[#FBE9E3]/60 p-2">
                      <p className="text-[10px] font-black uppercase text-[#8F3F2B] flex items-center justify-between">
                        <span>Low Stock Items</span>
                        <span>{alerts.length}</span>
                      </p>
                      <ul className="mt-1 space-y-1">
                        {alerts.slice(0, 2).map((alert) => {
                          const medicine = alert.medicine;
                          const name = [medicine?.generic_name, medicine?.dosage]
                            .filter(Boolean)
                            .join(" ");

                          return (
                            <li key={alert.id || alert.batch_number || name} className="flex items-center justify-between gap-1 text-[10.5px]">
                              <span className="min-w-0 truncate font-semibold text-[#1B2B30]">
                                {name || "Stock item"}
                              </span>
                              <span className="shrink-0 font-black text-[#8F3F2B]">
                                {Number(alert.quantity)} / {Number(alert.threshold)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      {alerts.length > 2 && (
                        <p className="mt-1 text-[9px] font-bold text-[#8F3F2B]/80">
                          +{alerts.length - 2} more item{alerts.length - 2 === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Action Link Button */}
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        navigate("/inventory", {
                          state: {
                            facilityId: facility.id,
                            facilityName: facility.facility_name,
                          },
                        });
                      }}
                      className="w-full rounded-lg bg-[#1F4E5A] hover:bg-[#163841] text-white py-1.5 text-xs font-black transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Boxes className="h-3.5 w-3.5 text-[#CFDDE0]" />
                      <span>View Facility Stock</span>
                    </button>
                    {onSelectFacility && (
                      <button
                        type="button"
                        onClick={() => onSelectFacility(facility)}
                        className="w-full rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] hover:bg-[#E5EFF1] text-[#1B2B30] py-1 text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        Facility Details
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
              : metricFilter === "healthy"
                ? "No facilities currently have healthy stock levels."
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

      {isFullscreen &&
        createPortal(
          <div
            className={`fixed inset-0 z-[2000] flex flex-col bg-white transition-[padding-top] duration-300 ease-in-out ${
              isDesktop && isTitlebarPinned ? "pt-10" : "pt-0"
            }`}
          >
            <div className="border-b border-[#CFDDE0] px-5 py-3 flex items-center justify-between bg-[#F9FBFB]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#1F4E5A]">
                  City of Naga
                </p>
                <h2 className="text-base font-black text-[#1B2B30]">Facility & Stock Map</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="rounded-lg bg-neutral-100 px-3.5 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200 transition active:scale-95"
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
