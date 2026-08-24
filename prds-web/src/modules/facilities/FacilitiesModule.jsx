import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";

import AdminShell from "../../components/layout/AdminShell";
import ModalShell from "../../components/ModalShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";
import {
  NAGA_BOUNDS_NORTH_EAST,
  NAGA_BOUNDS_SOUTH_WEST,
} from "../../utils/nagaMap";
import FacilityMap from "../dashboard/components/FacilityMap";
import { FacilityCard, FacilityCardSkeleton } from "./components/FacilityCard";
import { FacilityFormModal } from "./components/FacilityFormModal";
import { FacilityToolbar } from "./components/FacilityToolbar";
import { formatFacilityType, formatStatus } from "./facilityFormat";
import {
  buildFacilityView,
  filterFacilities,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  getExpiryMeta,
  getHealthMeta,
  getMedicineName,
  getRequestStatusMeta,
  getStockPercent,
  getStockStatus,
  sortFacilities,
} from "./facilityUtils";

const emptyForm = {
  facility_name: "",
  facility_code: "",
  facility_type: "HEALTH_CENTER",
  address: "",
  status: "ACTIVE",
  latitude: null,
  longitude: null,
};

export default function FacilitiesModule() {
  const { profile } = useAuth();
  const [facilities, setFacilities] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [patients, setPatients] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [sortDirection, setSortDirection] = useState("ASC");
  const [viewMode, setViewMode] = useState("list");
  const [mapFocus, setMapFocus] = useState(null);
  const gridRef = useRef(null);
  const sortFirstPositionsRef = useRef(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [facilityError, setFacilityError] = useState("");
  const [modalMode, setModalMode] = useState(null);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [editingFacility, setEditingFacility] = useState(null);
  const [formValues, setFormValues] = useState(emptyForm);

  const today = useMemo(() => formatDateTime(new Date()), []);

  const enrichedFacilities = useMemo(() => {
    return facilities.map((facility) =>
      buildFacilityView(facility, { inventory, requests, patients, forecasts })
    );
  }, [facilities, forecasts, inventory, patients, requests]);

  const filteredFacilities = useMemo(() => {
    return sortFacilities(
      filterFacilities(enrichedFacilities, { searchTerm, stockFilter }),
      sortDirection
    );
  }, [enrichedFacilities, searchTerm, sortDirection, stockFilter]);

  const captureSortPositions = () => {
    const positions = new Map();
    gridRef.current
      ?.querySelectorAll("[data-facility-id]")
      .forEach((element) => {
        positions.set(element.getAttribute("data-facility-id"), element.getBoundingClientRect());
      });
    sortFirstPositionsRef.current = positions;
  };

  const handleSortToggle = () => {
    captureSortPositions();
    setSortDirection((currentDirection) => (currentDirection === "ASC" ? "DESC" : "ASC"));
  };

  useLayoutEffect(() => {
    const firstPositions = sortFirstPositionsRef.current;
    if (firstPositions.size === 0) return;

    const elements = gridRef.current?.querySelectorAll("[data-facility-id]") || [];

    elements.forEach((element) => {
      const id = element.getAttribute("data-facility-id");
      const start = firstPositions.get(id);
      const end = element.getBoundingClientRect();

      if (!start) return;

      const deltaX = start.left - end.left;
      const deltaY = start.top - end.top;
      if (deltaX === 0 && deltaY === 0) return;

      element.style.transition = "none";
      element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

      requestAnimationFrame(() => {
        const onTransitionEnd = (event) => {
          if (event.target !== element) return;
          element.style.transition = "";
          element.style.transform = "";
          element.removeEventListener("transitionend", onTransitionEnd);
        };

        element.addEventListener("transitionend", onTransitionEnd);
        element.style.transition =
          "transform 350ms cubic-bezier(0.22, 1, 0.36, 1)";
        element.style.transform = "";
      });
    });

    sortFirstPositionsRef.current = new Map();
  }, [filteredFacilities]);

  const stockStatusByFacility = useMemo(() => {
    return Object.fromEntries(
      enrichedFacilities.map((facility) => [facility.id, facility.stockHealth])
    );
  }, [enrichedFacilities]);

  const mapAlertCount = useMemo(
    () =>
      enrichedFacilities.filter(
        (facility) => facility.stockHealth === "LOW" || facility.stockHealth === "CRITICAL"
      ).length,
    [enrichedFacilities]
  );

  const loadFacilities = async () => {
    setIsLoading(true);
    setFacilityError("");

    const [
      facilitiesResult,
      inventoryResult,
      requestsResult,
      patientsResult,
      forecastsResult,
    ] = await Promise.all([
      supabase
        .from("facilities")
        .select("id, facility_name, facility_code, facility_type, address, status, latitude, longitude")
        .order("facility_name", { ascending: true }),
      supabase
        .from("inventory")
        .select(`
          id,
          facility_id,
          quantity,
          threshold,
          batch_number,
          expiration_date,
          updated_at,
          medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure, unit_cost)
        `)
        .order("updated_at", { ascending: false }),
      supabase
        .from("medicine_requests")
        .select(`
          id,
          facility_id,
          status,
          request_date,
          items:medicine_request_items(
            quantity,
            medicine:medicines(generic_name, dosage)
          )
        `)
        .order("request_date", { ascending: false }),
      supabase.from("patients").select("id, facility_id"),
      supabase
        .from("forecasting")
        .select(`
          id,
          facility_id,
          forecast_month,
          predicted_quantity,
          medicine:medicines(generic_name, dosage)
        `)
        .order("forecast_month", { ascending: true }),
    ]);

    const firstError = [
      facilitiesResult,
      inventoryResult,
      requestsResult,
      patientsResult,
      forecastsResult,
    ].find((result) => result.error)?.error;

    if (firstError) {
      setFacilityError(firstError.message);
      setIsLoading(false);
      return;
    }

    setFacilities(facilitiesResult.data || []);
    setInventory(inventoryResult.data || []);
    setRequests(requestsResult.data || []);
    setPatients(patientsResult.data || []);
    setForecasts(forecastsResult.data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadFacilities();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const openCreateModal = () => {
    setEditingFacility(null);
    setFormValues(emptyForm);
    setFacilityError("");
    setModalMode("form");
  };

  const openEditModal = (facility) => {
    setEditingFacility(facility);
    setFormValues({
      facility_name: facility.facility_name,
      facility_code: facility.facility_code,
      facility_type: facility.facility_type,
      address: facility.address,
      status: facility.status,
      latitude: facility.latitude,
      longitude: facility.longitude,
    });
    setFacilityError("");
    setModalMode("form");
  };

  const openDetailsModal = (facility) => {
    setSelectedFacility(facility);
    setFacilityError("");
    setModalMode("details");
  };

  const closeModal = useCallback(() => {
    if (isSaving) {
      return;
    }

    setModalMode(null);
    setSelectedFacility(null);
    setEditingFacility(null);
    setFormValues(emptyForm);
  }, [isSaving]);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: name === "facility_code" ? value.toUpperCase() : value,
    }));
  };

  const handlePinChange = (pin) => {
    if (pin === null) {
      setFormValues((currentValues) => ({
        ...currentValues,
        latitude: null,
        longitude: null,
      }));
      return;
    }

    setFormValues((currentValues) => ({
      ...currentValues,
      latitude: pin.latitude,
      longitude: pin.longitude,
      ...(pin.address ? { address: pin.address } : {}),
    }));
  };

  const validateForm = () => {
    if (!formValues.facility_name.trim()) {
      return "Facility name is required.";
    }

    if (!formValues.facility_code.trim()) {
      return "Facility code is required.";
    }

    if (!formValues.address.trim()) {
      return "Address is required.";
    }

    const latitude = Number(formValues.latitude);
    const longitude = Number(formValues.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return "Set the facility location by searching for a place or clicking the map.";
    }

    return "";
  };

  const handleSaveFacility = async (event) => {
    event.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setFacilityError(validationError);
      return;
    }

    setIsSaving(true);
    setFacilityError("");

    const payload = {
      facility_name: formValues.facility_name.trim(),
      facility_code: formValues.facility_code.trim(),
      facility_type: formValues.facility_type,
      address: formValues.address.trim(),
      status: formValues.status,
      latitude: formValues.latitude,
      longitude: formValues.longitude,
    };

    const request = editingFacility
      ? supabase.from("facilities").update(payload).eq("id", editingFacility.id)
      : supabase.from("facilities").insert(payload);

    const { error } = await request;

    if (error) {
      setFacilityError(error.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    closeModal();
    await loadFacilities();
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {facilityError && !modalMode && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {facilityError}
        </p>
      )}

      <section className="rounded-xl border border-[#d8dadc] bg-white p-5 shadow-sm">
        <div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#007a52]">
              Facility Command
            </p>
            <h2 className="mt-1 text-xl font-black text-[#0d1117]">Facilities</h2>
            <p className="mt-1 max-w-2xl text-sm font-medium text-[#42474e]">
              Manage healthcare facilities, stock health, request activity, and map coverage.
            </p>
          </div>
        </div>
      </section>

      <FacilityToolbar
        viewMode={viewMode}
        searchTerm={searchTerm}
        stockFilter={stockFilter}
        sortDirection={sortDirection}
        onSearchChange={setSearchTerm}
        onStockFilterChange={setStockFilter}
        onSortToggle={handleSortToggle}
        onViewModeChange={setViewMode}
        onAddFacility={openCreateModal}
      />

      {viewMode === "map" ? (
        <section className="mt-5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-black text-[#0d1117]">Facility Map</h2>
              <p className="text-sm font-medium text-neutral-500">
                City of Naga · {enrichedFacilities.length} facilit{enrichedFacilities.length === 1 ? "y" : "ies"} pinned
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ${
                  mapAlertCount > 0
                    ? "bg-red-50 text-red-600"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                <AlertDotIcon />
                {mapAlertCount} stock alert{mapAlertCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <FacilityMap
            facilities={enrichedFacilities}
            stockStatusByFacility={stockStatusByFacility}
            inventoryRows={inventory}
            className="h-[560px]"
            onSelectFacility={openDetailsModal}
            focusPosition={mapFocus}
          />
        </section>
      ) : (
        <>
          {!isLoading && enrichedFacilities.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-neutral-500">
              <p>
                Showing {filteredFacilities.length} of {enrichedFacilities.length} facilities
              </p>
              {stockFilter !== "ALL" && (
                <button
                  type="button"
                  onClick={() => setStockFilter("ALL")}
                  className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                >
                  Clear health filter
                </button>
              )}
            </div>
          )}

          <section className="facilities-grid mt-5" ref={gridRef}>
            {isLoading ? (
              Array.from({ length: 6 }, (_, index) => <FacilityCardSkeleton key={index} />)
            ) : filteredFacilities.length === 0 ? (
              enrichedFacilities.length === 0 ? (
                <div className="col-span-full flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-14 text-center shadow-sm">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                    <FacilityIcon />
                  </span>
                  <p className="text-sm font-black text-neutral-700">No facilities have been added yet.</p>
                  <p className="max-w-[340px] text-sm font-medium text-neutral-500">
                    Add your first facility to start tracking inventory and requests.
                  </p>
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
                  >
                    <PlusIcon />
                    Add Facility
                  </button>
                </div>
              ) : (
                <div className="col-span-full flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-14 text-center shadow-sm">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                    <SearchIcon />
                  </span>
                  <p className="text-sm font-black text-neutral-700">No facilities match the current filters.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      setStockFilter("ALL");
                    }}
                    className="mt-1 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 hover:bg-emerald-100"
                  >
                    Clear filters
                  </button>
                </div>
              )
            ) : (
              filteredFacilities.map((facility) => (
                <FacilityCard
                  key={facility.id}
                  facility={facility}
                  isSelected={selectedFacility?.id === facility.id}
                  onView={() => openDetailsModal(facility)}
                  onViewOnMap={() => {
                    setMapFocus({
                      id: facility.id,
                      latitude: facility.latitude,
                      longitude: facility.longitude,
                    });
                    setViewMode("map");
                  }}
                />
              ))
            )}
          </section>
        </>
      )}

      {modalMode === "form" && (
        <FacilityFormModal
          editingFacility={editingFacility}
          formValues={formValues}
          error={facilityError}
          isSaving={isSaving}
          onClose={closeModal}
          onChange={handleFieldChange}
          onPinChange={handlePinChange}
          onSubmit={handleSaveFacility}
        />
      )}

      {modalMode === "details" && selectedFacility && (
        <FacilityDetailsModal
          facility={selectedFacility}
          onClose={closeModal}
          onEdit={() => openEditModal(selectedFacility)}
        />
      )}
    </AdminShell>
  );
}

function FacilityMiniMap({ facility }) {
  const latitude = Number(facility?.latitude);
  const longitude = Number(facility?.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

  if (!hasCoordinates) {
    return (
      <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-[#faf9f7]">
        <p className="text-xs font-bold text-neutral-500">Location not set</p>
      </div>
    );
  }

  const pinIcon = L.divIcon({
    className: "",
    html: `
      <span style="display:flex;width:30px;height:30px;align-items:center;justify-content:center;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:#00a36c;border:3px solid #ffffff;box-shadow:0 2px 8px rgba(13,17,23,0.45);">
        <span style="width:10px;height:10px;border-radius:9999px;background:#ffffff;"></span>
      </span>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={15}
      minZoom={12}
      maxZoom={18}
      maxBounds={L.latLngBounds(NAGA_BOUNDS_SOUTH_WEST, NAGA_BOUNDS_NORTH_EAST)}
      maxBoundsViscosity={1}
      scrollWheelZoom={false}
      dragging={false}
      zoomControl={false}
      className="z-0 h-44 w-full overflow-hidden rounded-lg border border-[#d8dadc]"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png"
      />
      <Marker position={[latitude, longitude]} icon={pinIcon}>
        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
          <p className="text-xs font-black text-[#0d1117]">{facility.facility_name}</p>
        </Tooltip>
      </Marker>
    </MapContainer>
  );
}

function FacilityDetailsModal({ facility, onClose, onEdit }) {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const inventorySectionRef = useRef(null);
  const profileSectionRef = useRef(null);
  const requestsSectionRef = useRef(null);
  const forecastSectionRef = useRef(null);
  const healthMeta = getHealthMeta(facility.stockHealth);
  const stockRows = [...facility.inventoryRows]
    .sort((first, second) => getStockPercent(first) - getStockPercent(second))
    .slice(0, 6);
  const criticalCount = facility.stockCounts.CRITICAL;
  const lowCount = facility.stockCounts.LOW;
  const alertCount = criticalCount + lowCount;
  const expiringCount = facility.inventoryRows.filter(
    (item) => getExpiryMeta(item.expiration_date) != null
  ).length;
  const attentionTotal = alertCount + expiringCount;
  const recentRequests = facility.requestRows.slice(0, 5);
  const requestCounts = {
    approved: facility.requestRows.filter(
      (request) => request.status === "APPROVED" || request.status === "COMPLETED"
    ).length,
    pending: facility.requestRows.filter((request) => request.status === "PENDING").length,
    denied: facility.requestRows.filter((request) => request.status === "REJECTED").length,
  };
  const forecastRows = facility.forecastRows.slice(0, 5);

  const forecastTrend = useMemo(() => {
    const byMonth = new Map();

    facility.forecastRows.forEach((forecast) => {
      const date = forecast.forecast_month ? new Date(forecast.forecast_month) : null;
      if (!date || Number.isNaN(date.getTime())) return;

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) || 0) + Number(forecast.predicted_quantity || 0));
    });

    return [...byMonth.entries()]
      .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
      .map(([key, total]) => ({
        key,
        label: new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" }),
        total,
      }));
  }, [facility.forecastRows]);

  const forecastMax = Math.max(1, ...forecastTrend.map((month) => month.total));
  const attentionRows = stockRows.filter((item) =>
    ["CRITICAL", "LOW"].includes(getStockStatus(item))
  );
  const otherRows = stockRows.filter(
    (item) => !["CRITICAL", "LOW"].includes(getStockStatus(item))
  );

  const renderStockRow = (item) => {
    const percent = getStockPercent(item);
    const status = getStockStatus(item);
    const rowHealth = getHealthMeta(status);
    const expiryMeta = getExpiryMeta(item.expiration_date);

    return (
      <div key={item.id} className="rounded-lg border border-neutral-100 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-black">{getMedicineName(item)}</p>
            <p className="truncate text-xs font-medium text-neutral-500">
              Batch {item.batch_number} - Exp. {formatDate(item.expiration_date)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {expiryMeta && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${expiryMeta.badgeClass}`}>
                {expiryMeta.label}
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${rowHealth.badgeClass}`}>
              {rowHealth.label}
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 rounded-full bg-neutral-100">
            <div className={`h-full rounded-full ${rowHealth.barClass}`} style={{ width: `${percent}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right text-xs font-black text-neutral-700">
            {formatNumber(item.quantity)}
            <span className="font-semibold text-neutral-400"> / {formatNumber(item.threshold)}</span>
          </span>
        </div>
      </div>
    );
  };

  return (
    <ModalShell
      labelledBy="facility-details-modal-title"
      onClose={onClose}
      overlayClassName="bg-white/95 backdrop-blur-sm"
      panelClassName="w-full"
    >
      <div className="facility-details-modal flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl shadow-neutral-900/20">
        <div
          className={`border-b border-emerald-100 bg-emerald-50 px-5 py-4 text-neutral-950 transition-shadow ${
            isScrolled ? "shadow-md shadow-emerald-900/5" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <FacilityIcon />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                  Facility Details
                </p>
                <h3 id="facility-details-modal-title" className="mt-1 truncate text-lg font-black">{facility.facility_name}</h3>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-600">
                  {facility.facility_code} - {formatFacilityType(facility.facility_type)}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${healthMeta.badgeClass}`}>
                    {healthMeta.label}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${facility.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                    {formatStatus(facility.status)}
                  </span>
                  {alertCount > 0 && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-black text-red-600">
                      {alertCount} alert{alertCount === 1 ? "" : "s"}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          className="prds-modal-scrollbar flex-1 overflow-y-auto bg-[#f8faf7] p-4 sm:p-5"
          onScroll={(event) => setIsScrolled(event.currentTarget.scrollTop > 4)}
        >
          <div className="facility-detail-stats grid gap-3">
            <HealthGaugeCard percent={facility.healthPercent} health={facility.stockHealth} />
            <DetailStat label="Inventory Value" value={formatCurrency(facility.stockCounts.totalValue)} icon={<CurrencyIcon />} />
            <DetailStat label="Total Units" value={formatNumber(facility.stockCounts.totalQuantity)} icon={<StockIcon />} />
            <DetailStat label="Patients" value={formatNumber(facility.patientCount)} icon={<UsersIcon />} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-neutral-200 bg-white p-2 shadow-sm">
            {[
              { label: "Overview", ref: profileSectionRef },
              { label: "Inventory Health", ref: inventorySectionRef },
              { label: "Requests", ref: requestsSectionRef },
              { label: "Forecast", ref: forecastSectionRef },
            ].map((section) => (
              <button
                key={section.label}
                type="button"
                onClick={() => section.ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="rounded-lg px-3 py-1.5 text-xs font-black text-neutral-600 transition hover:bg-[#ecfff8] hover:text-[#007a52]"
              >
                {section.label}
              </button>
            ))}
          </div>

          {attentionTotal > 0 && (
            <div
              className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                criticalCount > 0 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className={`flex items-center gap-2 text-sm font-black ${criticalCount > 0 ? "text-red-700" : "text-amber-700"}`}>
                <AlertDotIcon />
                <span>
                  {criticalCount > 0 && `${criticalCount} critical`}
                  {criticalCount > 0 && lowCount > 0 && " · "}
                  {lowCount > 0 && `${lowCount} low`}
                  {alertCount > 0 && expiringCount > 0 && " · "}
                  {expiringCount > 0 && `${expiringCount} expiring soon`}
                  {" "}
                  {attentionTotal === 1 ? "item needs attention" : "items need attention"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => inventorySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className={`rounded-lg px-3 py-1.5 text-xs font-black text-white transition ${
                  criticalCount > 0 ? "bg-red-600 hover:bg-red-700" : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                Review inventory
              </button>
            </div>
          )}

          <div className="facility-detail-main mt-4 grid gap-4">
            <section ref={inventorySectionRef} className="scroll-mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-black text-black">Inventory Health</h4>
                  <p className="text-sm font-medium text-neutral-500">
                    {facility.inventoryRows.length > stockRows.length
                      ? `Showing ${stockRows.length} of ${facility.inventoryRows.length} items`
                      : `${facility.inventoryRows.length} item${facility.inventoryRows.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/inventory?facility=${facility.id}`)}
                    className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                  >
                    View all
                  </button>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${healthMeta.badgeClass}`}>
                    {healthMeta.label}
                  </span>
                </div>
              </div>

              <div className="facility-health-grid mt-4 grid gap-3">
                <MiniStatus label="Healthy" value={facility.stockCounts.HEALTHY} colorClass="bg-emerald-500" />
                <MiniStatus label="Warning" value={facility.stockCounts.WATCH} colorClass="bg-amber-500" />
                <MiniStatus label="Low" value={facility.stockCounts.LOW} colorClass="bg-orange-500" />
                <MiniStatus label="Critical" value={facility.stockCounts.CRITICAL} colorClass="bg-red-500" />
              </div>

              <div className="mt-4 space-y-3">
                {stockRows.length === 0 ? (
                  <p className="rounded-lg bg-neutral-50 px-4 py-5 text-center text-sm font-bold text-neutral-500">
                    No inventory records for this facility yet.
                  </p>
                ) : (
                  <>
                    {attentionRows.length > 0 && (
                      <>
                        <p className="text-[11px] font-black uppercase tracking-wide text-red-600">
                          Needs attention
                        </p>
                        {attentionRows.map(renderStockRow)}
                      </>
                    )}
                    {otherRows.length > 0 && (
                      <>
                        <p className="text-[11px] font-black uppercase tracking-wide text-neutral-400">
                          Other items
                        </p>
                        {otherRows.map(renderStockRow)}
                      </>
                    )}
                  </>
                )}
              </div>
            </section>

            <div className="grid gap-5">
              <section ref={profileSectionRef} className="scroll-mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <h4 className="text-base font-black text-black">Facility Profile</h4>
                <div className="mt-4 space-y-3">
                  <FacilityMiniMap facility={facility} />
                  <ProfileLine label="Facility Code" value={facility.facility_code} />
                  <ProfileLine label="Facility Type" value={formatFacilityType(facility.facility_type)} />
                  <ProfileLine label="Status" value={formatStatus(facility.status)} />
                  <ProfileLine label="Address" value={facility.address} />
                  <ProfileLine
                    label="Coordinates"
                    value={
                      facility.latitude != null && facility.longitude != null
                        ? `${Number(facility.latitude).toFixed(6)}, ${Number(facility.longitude).toFixed(6)}`
                        : "Not set"
                    }
                  />
                </div>
              </section>

              <section ref={requestsSectionRef} className="scroll-mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-base font-black text-black">Distribution</h4>
                    <p className="text-sm font-medium text-neutral-500">
                      Medicine request activity for this facility.
                    </p>
                  </div>
                  {facility.requestRows.length > recentRequests.length && (
                    <button
                      type="button"
                      onClick={() => navigate("/requests")}
                      className="shrink-0 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                    >
                      View all requests
                    </button>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MetricTile value={formatNumber(facility.requestRows.length)} label="Requests" />
                  <MetricTile value={formatNumber(requestCounts.pending)} label="Pending" />
                  <MetricTile value={`${facility.distributionRate}%`} label="Distribution Rate" />
                  <MetricTile value={formatNumber(requestCounts.denied)} label="Denied" />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">
                    {requestCounts.approved} approved
                  </span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-700">
                    {requestCounts.pending} pending
                  </span>
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-black text-red-700">
                    {requestCounts.denied} denied
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {recentRequests.length === 0 ? (
                    <p className="rounded-lg bg-neutral-50 px-4 py-4 text-sm font-bold text-neutral-500">
                      No medicine requests recorded.
                    </p>
                  ) : (
                    recentRequests.map((request) => {
                      const requestStatus = getRequestStatusMeta(request.status);

                      return (
                        <div key={request.id} className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-3 last:border-b-0 last:pb-0">
                          <div>
                            <p className="text-sm font-bold text-black">{formatDate(request.request_date)}</p>
                            <p className="text-xs font-medium text-neutral-500">
                              {request.items?.length || 0} medicines - {request.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0} units
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${requestStatus.badgeClass}`}>
                            {requestStatus.label}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
                {facility.requestRows.length > recentRequests.length && (
                  <p className="mt-3 text-xs font-bold text-neutral-400">
                    +{facility.requestRows.length - recentRequests.length} more request{facility.requestRows.length - recentRequests.length === 1 ? "" : "s"}
                  </p>
                )}
              </section>
            </div>
          </div>

          <section ref={forecastSectionRef} className="mt-4 scroll-mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-black text-black">Demand Forecast</h4>
                <p className="text-sm font-medium text-neutral-500">
                  {forecastTrend.length > 1
                    ? `${forecastTrend[0].label} – ${forecastTrend[forecastTrend.length - 1].label} forecast`
                    : "Upcoming predicted quantities for this facility."}
                </p>
              </div>
              <span className="text-2xl font-black text-black">{formatNumber(facility.forecastTotal)}</span>
            </div>

            {forecastTrend.length > 0 && (
              <div className="mt-4 flex h-28 items-end gap-2">
                {forecastTrend.map((month) => (
                  <div key={month.key} className="flex h-full flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-1 items-end rounded-md bg-neutral-100">
                      <div
                        className={`w-full rounded-t-md ${
                          month.total > 0 ? "bg-emerald-500/80" : "bg-neutral-200"
                        }`}
                        style={{ height: `${Math.max(4, (month.total / forecastMax) * 100)}%` }}
                        title={`${month.label} · ${formatNumber(month.total)} units`}
                      />
                    </div>
                    <span className="text-[11px] font-black text-neutral-500">{month.label}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {forecastRows.length === 0 ? (
                <p className="col-span-full rounded-lg bg-neutral-50 px-4 py-5 text-center text-sm font-bold text-neutral-500">
                  No forecast records available yet.
                </p>
              ) : (
                forecastRows.map((forecast) => (
                  <div key={forecast.id} className="rounded-lg bg-neutral-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                      {formatDate(forecast.forecast_month)}
                    </p>
                    <p className="mt-2 text-2xl font-black text-black">
                      {formatNumber(forecast.predicted_quantity)}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold text-neutral-500">
                      {forecast.medicine?.generic_name || "Medicine"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 bg-white px-5 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate(`/inventory?facility=${facility.id}`)}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-bold text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-800"
            >
              <StockIcon />
              View in Inventory
            </button>
            <button
              type="button"
              onClick={() => navigate("/requests")}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-bold text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-800"
            >
              <TrendIcon />
              View all requests
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg bg-neutral-100 px-6 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 text-sm font-black text-white transition hover:bg-emerald-700"
            >
              <PencilIcon />
              Edit Facility
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function HealthGaugeCard({ percent, health }) {
  const colors = {
    HEALTHY: "#00a36c",
    WATCH: "#f59e0b",
    LOW: "#f97316",
    CRITICAL: "#ef4444",
  };

  const color = colors[health] || "#f59e0b";
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="relative mx-auto h-[72px] w-[72px]">
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="#e9ebed" strokeWidth="7" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-base font-black text-black">
          {clamped}%
        </span>
      </div>
      <p className="mt-3 text-center text-xs font-bold uppercase tracking-wide text-neutral-500">
        Stock Health
      </p>
    </div>
  );
}

function DetailStat({ label, value, tone = "HEALTHY", icon }) {
  const healthMeta = getHealthMeta(tone);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${tone ? healthMeta.iconClass : "bg-[#faf9f7] text-neutral-500"}`}>
        {icon}
      </span>
      <p className="mt-3 text-2xl font-black text-black">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</p>
    </div>
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

function MiniStatus({ label, value, colorClass }) {
  return (
    <div className="rounded-lg bg-neutral-50 p-3">
      <span className={`block h-1.5 w-8 rounded-full ${colorClass}`} />
      <p className="mt-3 text-xl font-black text-black">{formatNumber(value)}</p>
      <p className="text-xs font-bold text-neutral-500">{label}</p>
    </div>
  );
}

function ProfileLine({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-black">{value || "Not set"}</p>
    </div>
  );
}

function CurrencyIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M12 2v20" />
      <path d="M17 5.5H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="m4 17 6-6 4 4 6-7" />
      <path d="M15 8h5v5" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0" />
      <path d="M17 11a4 4 0 0 0 0-8" />
      <path d="M20 21a5 5 0 0 0-3-5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function FacilityIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M4 21V8l8-5 8 5v13" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 10h.01M15 10h.01" />
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

function AlertDotIcon() {
  return (
    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M10.3 4.3 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5 12.5-12.5Z" />
    </svg>
  );
}
