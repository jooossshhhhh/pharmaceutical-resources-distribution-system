import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";

import AdminShell from "../../components/layout/AdminShell";
import ModalShell from "../../components/ModalShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { supabase } from "@backend/client/supabase";
import { saveSnapshot, getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { createOfflineInsertPayload, enqueueMutation } from "@backend/sync/outboxQueue";
import { isConnectivityError } from "@backend/client/networkErrorUtils";
import { isCurrentNetworkOnline, useNetworkStatus } from "@backend/sync/networkStatus";
import {
  NAGA_BOUNDS_NORTH_EAST,
  NAGA_BOUNDS_SOUTH_WEST,
} from "@shared/utils/nagaMap";
import FacilityMap from "../dashboard/components/FacilityMap";
import { FacilityCard, FacilityCardSkeleton } from "./components/FacilityCard";
import { FacilityFormModal } from "./components/FacilityFormModal";
import { FacilityToolbar } from "./components/FacilityToolbar";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import PaginationControls from "../../components/PaginationControls";
import { formatFacilityType, formatStatus } from "@shared/utils/facilityFormat";
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
} from "@shared/utils/facilityUtils";

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
  const isOnline = useNetworkStatus();
  const [facilities, setFacilities] = useState(() => getSnapshot(STORAGE_KEYS.FACILITIES, []));
  const [inventory, setInventory] = useState(() => getSnapshot(STORAGE_KEYS.INVENTORY, []));
  const [requests, setRequests] = useState(() => getSnapshot(STORAGE_KEYS.REQUESTS, []));
  const [patients, setPatients] = useState(() => getSnapshot(STORAGE_KEYS.PATIENTS, []));
  const [forecasts, setForecasts] = useState(() => getSnapshot(STORAGE_KEYS.FORECASTING, []));
  const [searchTerm, setSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [sortDirection, setSortDirection] = useState("ASC");
  const [viewMode, setViewMode] = useState("list");
  const [mapFocus, setMapFocus] = useState(null);
  const gridRef = useRef(null);
  const sortFirstPositionsRef = useRef(new Map());
  const [isLoading, setIsLoading] = useState(() => getSnapshot(STORAGE_KEYS.FACILITIES, []).length === 0);
  const [isSaving, setIsSaving] = useState(false);
  const [facilityError, setFacilityError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [facilityNotice, setFacilityNotice] = useState("");
  const [modalMode, setModalMode] = useState(null);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [editingFacility, setEditingFacility] = useState(null);
  const [formValues, setFormValues] = useState(emptyForm);

  const canManage = profile?.role === "PHARMA_II";

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

  const {
    currentPage,
    paginatedRows: paginatedFacilities,
    pageSize,
    setCurrentPage,
    totalCount: totalFilteredCount,
    totalPages,
  } = usePaginatedRows(filteredFacilities, 10);

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
      filteredFacilities.map((facility) => [facility.id, facility.stockHealth])
    );
  }, [filteredFacilities]);

  const mapAlertCount = useMemo(
    () =>
      filteredFacilities.filter(
        (facility) => facility.stockHealth === "LOW" || facility.stockHealth === "CRITICAL"
      ).length,
    [filteredFacilities]
  );

  const loadFacilities = useCallback(async () => {
    if (!isCurrentNetworkOnline()) {
      setRefreshError("");
      setFacilities(getSnapshot(STORAGE_KEYS.FACILITIES, []));
      setInventory(getSnapshot(STORAGE_KEYS.INVENTORY, []));
      setRequests(getSnapshot(STORAGE_KEYS.REQUESTS, []));
      setPatients(getSnapshot(STORAGE_KEYS.PATIENTS, []));
      setForecasts(getSnapshot(STORAGE_KEYS.FORECASTING, []));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setFacilityError("");
    setRefreshError("");

    try {
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
            batch_number,
            quantity,
            expiration_date,
            medicine:medicines(generic_name, dosage)
          `),
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
        throw firstError;
      }

      if (facilitiesResult.data) {
        setFacilities(facilitiesResult.data);
        saveSnapshot(STORAGE_KEYS.FACILITIES, facilitiesResult.data);
      }
      if (inventoryResult.data) {
        setInventory(inventoryResult.data);
        saveSnapshot(STORAGE_KEYS.INVENTORY, inventoryResult.data);
      }
      if (requestsResult.data) {
        setRequests(requestsResult.data);
        saveSnapshot(STORAGE_KEYS.REQUESTS, requestsResult.data);
      }
      if (patientsResult.data) {
        setPatients(patientsResult.data);
        saveSnapshot(STORAGE_KEYS.PATIENTS, patientsResult.data);
      }
      if (forecastsResult.data) {
        setForecasts(forecastsResult.data);
        saveSnapshot(STORAGE_KEYS.FORECASTING, forecastsResult.data);
      }
      setRefreshError("");
    } catch (err) {
      console.warn("Facilities fetch failed, using snapshots:", err);
      setRefreshError("Could not refresh facilities. Showing the latest saved data.");
      setFacilities(getSnapshot(STORAGE_KEYS.FACILITIES, []));
      setInventory(getSnapshot(STORAGE_KEYS.INVENTORY, []));
      setRequests(getSnapshot(STORAGE_KEYS.REQUESTS, []));
      setPatients(getSnapshot(STORAGE_KEYS.PATIENTS, []));
      setForecasts(getSnapshot(STORAGE_KEYS.FORECASTING, []));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(loadFacilities, 0);
    return () => window.clearTimeout(timerId);
  }, [isOnline, loadFacilities]);

  const openCreateModal = () => {
    setEditingFacility(null);
    setFormValues(emptyForm);
    setFacilityError("");
    setFacilityNotice("");
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
    setFacilityNotice("");
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

  const finishSave = () => {
    setModalMode(null);
    setSelectedFacility(null);
    setEditingFacility(null);
    setFormValues(emptyForm);
  };

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

    const hasLatitude = formValues.latitude !== null && formValues.latitude !== "";
    const hasLongitude = formValues.longitude !== null && formValues.longitude !== "";
    if (hasLatitude !== hasLongitude) {
      return "Enter both location coordinates, or clear the location.";
    }
    if (hasLatitude) {
      const latitude = Number(formValues.latitude);
      const longitude = Number(formValues.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return "Set a valid facility location or clear the location.";
      }
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return "Facility coordinates are outside the valid range.";
      }
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

    const queueOfflineChange = async () => {
      const id = editingFacility?.id;
      const insertPayload = editingFacility ? null : createOfflineInsertPayload(payload);
      await enqueueMutation({
        userId: profile?.id,
        facilityId: id || insertPayload.id,
        mutationType: editingFacility ? "UPDATE" : "INSERT",
        target: "facilities",
        payload: editingFacility ? { id, values: payload } : insertPayload,
      });

      const current = getSnapshot(STORAGE_KEYS.FACILITIES, facilities);
      const updated = editingFacility
        ? current.map((facility) => facility.id === id ? { ...facility, ...payload } : facility)
        : [insertPayload, ...current];
      saveSnapshot(STORAGE_KEYS.FACILITIES, updated);
      setFacilities(updated);
      setFacilityNotice("Facility saved on this device and queued to sync when online.");
      setIsSaving(false);
      finishSave();
    };

    if (!isCurrentNetworkOnline()) {
      try {
        await queueOfflineChange();
      } catch (err) {
        setFacilityError(err.message || "Could not queue this facility change.");
        setIsSaving(false);
      }
      return;
    }

    try {
      const request = editingFacility
        ? supabase.from("facilities").update(payload).eq("id", editingFacility.id)
        : supabase.from("facilities").insert(payload);
      const { error } = await request;
      if (error) {
        if (!isConnectivityError(error)) throw error;
        await queueOfflineChange();
        return;
      }

      setIsSaving(false);
      finishSave();
      await loadFacilities();
    } catch (err) {
      setFacilityError(err.message || "Could not save this facility.");
      setIsSaving(false);
    }
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {refreshError && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          <span>{refreshError}</span>
          <button type="button" onClick={loadFacilities} disabled={!isOnline} className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50">
            Retry refresh
          </button>
        </div>
      )}
      {!isOnline && (
        <p role="status" className="mb-4 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700">
          Offline. Showing saved facility data; queued changes will sync after reconnection.
        </p>
      )}
      {facilityNotice && (
        <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {facilityNotice}
        </p>
      )}
      {facilityError && !modalMode && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {facilityError}
        </p>
      )}


      <FacilityToolbar
        canManage={canManage}
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
                City of Naga · {filteredFacilities.length} facilit{filteredFacilities.length === 1 ? "y" : "ies"} pinned
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
            facilities={filteredFacilities}
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
                Showing {totalFilteredCount > 0 ? (currentPage - 1) * pageSize + 1 : 0} -{" "}
                {Math.min(currentPage * pageSize, totalFilteredCount)} of {totalFilteredCount} facilities
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
              Array.from({ length: 10 }, (_, index) => <FacilityCardSkeleton key={index} />)
            ) : filteredFacilities.length === 0 ? (
              enrichedFacilities.length === 0 ? (
                <div className="col-span-full flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-14 text-center shadow-sm">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                    <FacilityIcon />
                  </span>
                  <p className="text-sm font-black text-neutral-700">
                    {refreshError || !isOnline ? "Facility data is unavailable." : "No facilities have been added yet."}
                  </p>
                  <p className="max-w-[340px] text-sm font-medium text-neutral-500">
                    {refreshError || !isOnline
                      ? "There is no saved facility snapshot. Reconnect and refresh to load facility data."
                      : "Add your first facility to start tracking inventory and requests."}
                  </p>
                  {canManage && isOnline && !refreshError && (
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
                    >
                      <PlusIcon />
                      Add Facility
                    </button>
                  )}
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
              paginatedFacilities.map((facility) => (
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

          {!isLoading && totalFilteredCount > 10 && (
            <div className="mt-5">
              <PaginationControls
                currentPage={currentPage}
                itemLabel="facilities"
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                totalCount={totalFilteredCount}
                totalPages={totalPages}
              />
            </div>
          )}
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
          canManage={canManage}
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
      <span style="display:flex;width:30px;height:30px;align-items:center;justify-content:center;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:#1F4E5A;border:3px solid #ffffff;box-shadow:0 2px 8px rgba(13,17,23,0.45);">
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
      className="z-0 h-44 w-full overflow-hidden rounded-lg border border-[#CFDDE0] bg-[#E5EFF1]"
    >
      <TileLayer
        attribution="Tiles &copy; Esri"
        eventHandlers={{
          tileerror: (event) => {
            event.tile.style.display = "none";
          },
        }}
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
      />
      <Marker position={[latitude, longitude]} icon={pinIcon}>
        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
          <p className="text-xs font-black text-[#0d1117]">{facility.facility_name}</p>
        </Tooltip>
      </Marker>
    </MapContainer>
  );
}

function FacilityDetailsModal({ facility, onClose, onEdit, canManage = true }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [inventoryFilter, setInventoryFilter] = useState("ALL");
  const [isScrolled, setIsScrolled] = useState(false);

  const healthMeta = getHealthMeta(facility.stockHealth);
  const sortedInventory = useMemo(() => {
    return [...facility.inventoryRows].sort(
      (first, second) => getStockPercent(first) - getStockPercent(second)
    );
  }, [facility.inventoryRows]);

  const criticalCount = facility.stockCounts.CRITICAL;
  const lowCount = facility.stockCounts.LOW;
  const alertCount = criticalCount + lowCount;
  const expiringCount = facility.inventoryRows.filter(
    (item) => getExpiryMeta(item.expiration_date) != null
  ).length;
  const attentionTotal = alertCount + expiringCount;

  const attentionRows = useMemo(() => {
    return sortedInventory.filter((item) =>
      ["CRITICAL", "LOW"].includes(getStockStatus(item))
    );
  }, [sortedInventory]);

  const displayedStockRows =
    inventoryFilter === "ATTENTION" ? attentionRows : sortedInventory;

  const requestCounts = {
    approved: facility.requestRows.filter(
      (request) => request.status === "APPROVED" || request.status === "COMPLETED"
    ).length,
    pending: facility.requestRows.filter((request) => request.status === "PENDING").length,
    denied: facility.requestRows.filter((request) => request.status === "REJECTED").length,
  };

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

  const renderStockRow = (item) => {
    const percent = getStockPercent(item);
    const status = getStockStatus(item);
    const rowHealth = getHealthMeta(status);
    const expiryMeta = getExpiryMeta(item.expiration_date);

    return (
      <div
        key={item.id}
        className="rounded-xl border border-[#CFDDE0] bg-white p-3.5 shadow-xs transition hover:border-[#1F4E5A]/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#1B2B30]">{getMedicineName(item)}</p>
            <p className="truncate text-xs font-medium text-[#5B7077]">
              Batch {item.batch_number} · Exp. {formatDate(item.expiration_date)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {expiryMeta && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${expiryMeta.badgeClass}`}>
                {expiryMeta.label}
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${rowHealth.badgeClass}`}>
              {rowHealth.label}
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#E5EFF1]">
            <div
              className={`h-full rounded-full transition-all ${rowHealth.barClass}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="w-28 shrink-0 text-right text-xs font-bold text-[#1B2B30]">
            {formatNumber(item.quantity)}
            <span className="font-medium text-[#5B7077]"> / {formatNumber(item.threshold)} units</span>
          </span>
        </div>
      </div>
    );
  };

  return (
    <ModalShell
      labelledBy="facility-details-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="w-full"
    >
      <div className="facility-details-modal flex flex-col overflow-hidden rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-2xl shadow-slate-900/25">
        {/* Header */}
        <div
          className={`border-b border-[#CFDDE0] bg-[#F4F8F8] px-5 py-3.5 text-[#1B2B30] transition-shadow ${
            isScrolled ? "shadow-sm" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#CFDDE0] bg-[#EBF3F5] text-[#1F4E5A]">
                <FacilityIcon />
              </span>
              <div className="min-w-0">
                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#1F4E5A]">
                  Facility Details
                </span>
                <h3 id="facility-details-modal-title" className="truncate text-lg font-bold text-[#1B2B30]">
                  {facility.facility_name}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[#5B7077]">
                  <span className="rounded-md border border-[#CFDDE0] bg-white px-2 py-0.5 text-[#1B2B30]">
                    {facility.facility_code}
                  </span>
                  <span>·</span>
                  <span>{formatFacilityType(facility.facility_type)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${healthMeta.badgeClass}`}>
                    {healthMeta.label}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      facility.status === "ACTIVE"
                        ? "bg-[#E2F3EC] text-[#226048]"
                        : "bg-[#E5EFF1] text-[#5B7077]"
                    }`}
                  >
                    {formatStatus(facility.status)}
                  </span>
                  {alertCount > 0 && (
                    <span className="rounded-full border border-[#D9826B]/30 bg-[#FBE9E3] px-2 py-0.5 text-[11px] font-bold text-[#8F3F2B]">
                      {alertCount} alert{alertCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#CFDDE0] bg-[#F9FBFB] px-5 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "overview", label: "Overview", icon: BuildingIcon, count: null },
              {
                id: "inventory",
                label: "Inventory",
                icon: StockIcon,
                count: facility.inventoryRows.length,
                hasAlert: attentionTotal > 0,
              },
              {
                id: "requests",
                label: "Requests",
                icon: FileTextIcon,
                count: facility.requestRows.length,
                hasAlert: false,
              },
              {
                id: "forecast",
                label: "Forecast",
                icon: TrendIcon,
                count: facility.forecastRows.length,
                hasAlert: false,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                    isActive
                      ? "bg-[#1F4E5A] text-white shadow-xs"
                      : "text-[#5B7077] hover:bg-[#EBF3F5] hover:text-[#1F4E5A]"
                  }`}
                >
                  <Icon />
                  <span>{tab.label}</span>
                  {tab.count != null && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        isActive
                          ? "bg-white/20 text-white"
                          : tab.hasAlert
                          ? "bg-[#FBE9E3] text-[#8F3F2B]"
                          : "bg-[#CFDDE0]/60 text-[#5B7077]"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                  {tab.hasAlert && !isActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#D9826B]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Body Content */}
        <div
          className="prds-modal-scrollbar flex-1 overflow-y-auto bg-[#F9FBFB] p-4 sm:p-5"
          onScroll={(event) => setIsScrolled(event.currentTarget.scrollTop > 4)}
        >
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* 4 Clean Metric Cards */}
              <div className="facility-detail-stats grid gap-3">
                <HealthGaugeCard percent={facility.healthPercent} health={facility.stockHealth} />
                <DetailStat
                  label="Total Stock"
                  value={formatNumber(facility.stockCounts.totalQuantity)}
                  subtext={`Across ${facility.inventoryRows.length} item${facility.inventoryRows.length === 1 ? "" : "s"}`}
                />
                <DetailStat
                  label="Monitored Items"
                  value={formatNumber(facility.inventoryRows.length)}
                  subtext="Tracked medicines"
                />
                <DetailStat
                  label="Stock Alerts"
                  value={formatNumber(alertCount)}
                  alert={alertCount > 0}
                  subtext={
                    alertCount > 0
                      ? `${criticalCount} critical, ${lowCount} low stock`
                      : "All stocks within safe threshold"
                  }
                />
              </div>

              {/* Actionable Attention Alert Banner */}
              {attentionTotal > 0 && (
                <div
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 sm:px-4 ${
                    criticalCount > 0
                      ? "border-[#D9826B]/30 bg-[#FBE9E3] text-[#8F3F2B]"
                      : "border-[#34769B]/30 bg-[#E3EEF5] text-[#1F4A66]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 text-xs font-bold sm:text-sm">
                    <AlertDotIcon />
                    <span>
                      {criticalCount > 0 && `${criticalCount} critical`}
                      {criticalCount > 0 && lowCount > 0 && " · "}
                      {lowCount > 0 && `${lowCount} low stock`}
                      {alertCount > 0 && expiringCount > 0 && " · "}
                      {expiringCount > 0 && `${expiringCount} expiring soon`}
                      {" "}— attention required.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("inventory")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white transition ${
                      criticalCount > 0 ? "bg-[#8F3F2B] hover:bg-[#733222]" : "bg-[#1F4E5A] hover:bg-[#183d47]"
                    }`}
                  >
                    Review in Inventory →
                  </button>
                </div>
              )}

              {/* 2-Column Grid: Profile & Geographic Location */}
              <div className="facility-detail-main grid gap-4">
                <div className="rounded-xl border border-[#CFDDE0] bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between border-b border-[#CFDDE0]/50 pb-2.5">
                    <h4 className="text-sm font-bold text-[#1B2B30]">Facility Profile</h4>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        facility.status === "ACTIVE"
                          ? "bg-[#E2F3EC] text-[#226048]"
                          : "bg-[#E5EFF1] text-[#5B7077]"
                      }`}
                    >
                      {formatStatus(facility.status)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <ProfileLine label="Facility Code" value={facility.facility_code} />
                    <ProfileLine label="Facility Type" value={formatFacilityType(facility.facility_type)} />
                    <ProfileLine label="Assigned Patients" value={formatNumber(facility.patientCount)} />
                    <ProfileLine label="Stock Health" value={healthMeta.label} />
                  </div>
                  <div className="mt-3 border-t border-[#CFDDE0]/40 pt-3">
                    <ProfileLine label="Complete Address" value={facility.address} />
                  </div>
                </div>

                <div className="flex flex-col rounded-xl border border-[#CFDDE0] bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between border-b border-[#CFDDE0]/50 pb-2.5">
                    <h4 className="text-sm font-bold text-[#1B2B30]">Geographic Location</h4>
                    <span className="text-xs font-medium text-[#5B7077]">
                      {facility.latitude != null && facility.longitude != null
                        ? `${Number(facility.latitude).toFixed(4)}, ${Number(facility.longitude).toFixed(4)}`
                        : "Location not set"}
                    </span>
                  </div>
                  <div className="mt-3 flex-1">
                    <FacilityMiniMap facility={facility} />
                  </div>
                </div>
              </div>

              {/* Immediate Attention Stock Preview */}
              {attentionRows.length > 0 && (
                <div className="rounded-xl border border-[#D9826B]/25 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-[#8F3F2B]">Stocks Needing Immediate Attention</h4>
                      <p className="text-xs font-medium text-[#5B7077]">
                        Items at or below safe minimum threshold levels
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("inventory")}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#1F4E5A] hover:underline"
                    >
                      View all inventory ({facility.inventoryRows.length}) →
                    </button>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {attentionRows.slice(0, 3).map(renderStockRow)}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "inventory" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#CFDDE0] bg-white p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#CFDDE0]/50 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-[#1B2B30]">Inventory Health Status</h4>
                    <p className="text-xs font-medium text-[#5B7077]">
                      {facility.inventoryRows.length} monitored medicine{facility.inventoryRows.length === 1 ? "" : "s"} at this facility
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/inventory?facility=${facility.id}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#CFDDE0] bg-[#F4F8F8] px-3 py-1.5 text-xs font-bold text-[#1F4E5A] transition hover:bg-[#EBF3F5]"
                  >
                    <StockIcon />
                    Open Full Inventory
                    <ExternalLinkIcon />
                  </button>
                </div>

                <div className="facility-health-grid mt-3 grid gap-2.5">
                  <MiniStatus label="Healthy" value={facility.stockCounts.HEALTHY} colorClass="bg-[#4C9F80]" />
                  <MiniStatus label="Warning" value={facility.stockCounts.WATCH} colorClass="bg-[#34769B]" />
                  <MiniStatus label="Low Stock" value={facility.stockCounts.LOW} colorClass="bg-[#D9826B]" />
                  <MiniStatus label="Critical" value={facility.stockCounts.CRITICAL} colorClass="bg-[#8F3F2B]" />
                </div>
              </div>

              {attentionRows.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInventoryFilter("ALL")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      inventoryFilter === "ALL"
                        ? "bg-[#1F4E5A] text-white shadow-xs"
                        : "border border-[#CFDDE0] bg-white text-[#5B7077] hover:bg-[#F4F8F8]"
                    }`}
                  >
                    All Medicines ({sortedInventory.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInventoryFilter("ATTENTION")}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      inventoryFilter === "ATTENTION"
                        ? "bg-[#8F3F2B] text-white shadow-xs"
                        : "border border-[#D9826B]/25 bg-[#FBE9E3] text-[#8F3F2B] hover:bg-[#f8ded6]"
                    }`}
                  >
                    <AlertDotIcon />
                    Needs Attention ({attentionRows.length})
                  </button>
                </div>
              )}

              <div className="space-y-2.5">
                {displayedStockRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#CFDDE0] bg-white p-8 text-center">
                    <p className="text-sm font-bold text-[#5B7077]">
                      {inventoryFilter === "ATTENTION"
                        ? "No medicines currently require urgent attention."
                        : "No inventory records for this facility yet."}
                    </p>
                    <p className="mt-1 text-xs text-[#5B7077]">
                      {inventoryFilter === "ATTENTION"
                        ? "All stocks are within safe threshold margins."
                        : "Medicines will appear here once distributed or recorded."}
                    </p>
                  </div>
                ) : (
                  displayedStockRows.map(renderStockRow)
                )}
              </div>
            </div>
          )}

          {activeTab === "requests" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <DetailStat
                  label="Total Requests"
                  value={formatNumber(facility.requestRows.length)}
                  subtext="All-time requests"
                />
                <DetailStat
                  label="Approved"
                  value={formatNumber(requestCounts.approved)}
                  subtext="Fulfilled orders"
                />
                <DetailStat
                  label="Pending"
                  value={formatNumber(requestCounts.pending)}
                  alert={requestCounts.pending > 0}
                  subtext={requestCounts.pending > 0 ? "Awaiting review" : "None pending"}
                />
                <DetailStat
                  label="Distribution Rate"
                  value={`${facility.distributionRate}%`}
                  subtext={`${requestCounts.denied} denied`}
                />
              </div>

              <div className="rounded-xl border border-[#CFDDE0] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#CFDDE0]/50 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-[#1B2B30]">Recent Requisitions</h4>
                    <p className="text-xs font-medium text-[#5B7077]">
                      Medicine request activity submitted by this facility
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/requests")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#CFDDE0] bg-[#F4F8F8] px-3 py-1.5 text-xs font-bold text-[#1F4E5A] transition hover:bg-[#EBF3F5]"
                  >
                    View in Requests
                    <ExternalLinkIcon />
                  </button>
                </div>

                <div className="mt-3 divide-y divide-[#CFDDE0]/40">
                  {facility.requestRows.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-sm font-bold text-[#5B7077]">No medicine requests recorded.</p>
                      <p className="mt-1 text-xs text-[#5B7077]">When requests are submitted, they will be listed here.</p>
                    </div>
                  ) : (
                    facility.requestRows.slice(0, 10).map((request) => {
                      const requestStatus = getRequestStatusMeta(request.status);
                      const itemCount = request.items?.length || 0;
                      const totalQty =
                        request.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;

                      return (
                        <div
                          key={request.id}
                          className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                        >
                          <div>
                            <p className="text-sm font-bold text-[#1B2B30]">
                              {formatDate(request.request_date)}
                            </p>
                            <p className="text-xs font-medium text-[#5B7077]">
                              {itemCount} medicine{itemCount === 1 ? "" : "s"} · {formatNumber(totalQty)} total units
                            </p>
                          </div>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${requestStatus.badgeClass}`}>
                            {requestStatus.label}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "forecast" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#CFDDE0] bg-white p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#CFDDE0]/50 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-[#1B2B30]">Demand Forecast Projections</h4>
                    <p className="text-xs font-medium text-[#5B7077]">
                      {forecastTrend.length > 1
                        ? `${forecastTrend[0].label} – ${forecastTrend[forecastTrend.length - 1].label} projected demand`
                        : "Upcoming predicted quantities for this facility"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#5B7077]">Total Forecast</p>
                    <p className="text-xl font-black text-[#1F4E5A]">
                      {formatNumber(facility.forecastTotal)}{" "}
                      <span className="text-xs font-semibold text-[#5B7077]">units</span>
                    </p>
                  </div>
                </div>

                {forecastTrend.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5B7077]">
                      Monthly Demand Trend
                    </p>
                    <div className="flex h-28 items-end gap-2 rounded-lg bg-[#F4F8F8] p-3">
                      {forecastTrend.map((month) => (
                        <div key={month.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                          <span className="text-[10px] font-bold text-[#5B7077]">
                            {month.total > 0 ? formatNumber(month.total) : "0"}
                          </span>
                          <div className="flex w-full flex-1 items-end rounded-md bg-[#CFDDE0]/40">
                            <div
                              className={`w-full rounded-t-md transition-all ${
                                month.total > 0 ? "bg-[#1F4E5A]" : "bg-[#CFDDE0]"
                              }`}
                              style={{ height: `${Math.max(6, (month.total / forecastMax) * 100)}%` }}
                              title={`${month.label} · ${formatNumber(month.total)} units`}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-[#1B2B30]">{month.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-[#CFDDE0] bg-white p-4 shadow-xs">
                <h4 className="mb-3 text-sm font-bold text-[#1B2B30]">Predicted Medicine Quantities</h4>
                {facility.forecastRows.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm font-bold text-[#5B7077]">No forecast records available yet.</p>
                    <p className="mt-1 text-xs text-[#5B7077]">Projections will be generated based on distribution trends.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {facility.forecastRows.slice(0, 6).map((forecast) => (
                      <div key={forecast.id} className="rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] p-3">
                        <span className="rounded-full bg-[#EBF3F5] px-2 py-0.5 text-[10px] font-bold text-[#1F4E5A]">
                          {formatDate(forecast.forecast_month)}
                        </span>
                        <p className="mt-2 text-xl font-black text-[#1B2B30]">
                          {formatNumber(forecast.predicted_quantity)}
                          <span className="ml-1 text-xs font-semibold text-[#5B7077]">units</span>
                        </p>
                        <p className="mt-1 truncate text-xs font-bold text-[#5B7077]">
                          {forecast.medicine?.generic_name || "Medicine"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#CFDDE0] bg-white px-5 py-3.5">
          <button
            type="button"
            onClick={() => navigate(`/inventory?facility=${facility.id}`)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#CFDDE0] bg-[#F4F8F8] px-3.5 text-xs font-bold text-[#1F4E5A] transition hover:bg-[#EBF3F5]"
          >
            <StockIcon />
            Open in Inventory
            <ExternalLinkIcon />
          </button>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-[#CFDDE0] bg-white px-5 text-xs font-bold text-[#5B7077] transition hover:bg-[#F4F8F8] hover:text-[#1B2B30]"
            >
              Close
            </button>
            {canManage && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1F4E5A] px-5 text-xs font-bold text-white shadow-xs transition hover:bg-[#183d47]"
              >
                <PencilIcon />
                Edit Facility
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function HealthGaugeCard({ percent, health }) {
  const colors = {
    HEALTHY: "#4C9F80",
    WATCH: "#34769B",
    LOW: "#D9826B",
    CRITICAL: "#8F3F2B",
    NO_DATA: "#CFDDE0",
  };

  const color = colors[health] || "#34769B";
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[#CFDDE0] bg-white p-4 shadow-xs">
      <div className="relative h-[72px] w-[72px]">
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="#E5EFF1" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-[#1B2B30]">
          {percent == null ? "-" : `${clamped}%`}
        </span>
      </div>
      <p className="mt-2 text-center text-xs font-bold uppercase tracking-wider text-[#5B7077]">
        {percent == null ? "No stock data" : "Stock Health"}
      </p>
    </div>
  );
}

function DetailStat({ label, value, subtext, alert }) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-[#CFDDE0] bg-white p-4 shadow-xs">
      <p className="text-xs font-bold uppercase tracking-wider text-[#5B7077]">{label}</p>
      <p className={`mt-1 text-2xl font-black ${alert ? "text-[#8F3F2B]" : "text-[#1B2B30]"}`}>{value}</p>
      {subtext && <p className="mt-0.5 truncate text-xs font-medium text-[#5B7077]">{subtext}</p>}
    </div>
  );
}

function MiniStatus({ label, value, colorClass }) {
  return (
    <div className="rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] p-2.5">
      <span className={`block h-1.5 w-6 rounded-full ${colorClass}`} />
      <p className="mt-2 text-lg font-black text-[#1B2B30]">{formatNumber(value)}</p>
      <p className="text-[11px] font-bold text-[#5B7077]">{label}</p>
    </div>
  );
}

function ProfileLine({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-[#5B7077]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-[#1B2B30]">{value || "Not set"}</p>
    </div>
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


function BuildingIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="m10 14 11-11" />
    </svg>
  );
}
