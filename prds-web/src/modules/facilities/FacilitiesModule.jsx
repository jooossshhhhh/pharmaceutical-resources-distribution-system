import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";

const facilityTypes = [
  { value: "CHO", label: "Central Health Office" },
  { value: "HEALTH_CENTER", label: "Health Center" },
];

const facilityStatuses = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

const stockHealthOptions = [
  { value: "ALL", label: "Stock Health" },
  { value: "HEALTHY", label: "Healthy" },
  { value: "LOW", label: "Low Stock" },
  { value: "CRITICAL", label: "Critical" },
];

const emptyForm = {
  facility_name: "",
  facility_code: "",
  facility_type: "HEALTH_CENTER",
  address: "",
  status: "ACTIVE",
};

const formatDateTime = (date) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatDate = (dateString) => {
  if (!dateString) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dateString));
};

const formatNumber = (value) => {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
};

const formatFacilityType = (type) => {
  return facilityTypes.find((item) => item.value === type)?.label || type;
};

const formatStatus = (status) => {
  return status?.charAt(0) + status?.slice(1).toLowerCase();
};

const getStockStatus = (item) => {
  const quantity = Number(item.quantity || 0);
  const threshold = Number(item.threshold || 0);

  if (quantity === 0 || quantity <= Math.max(1, Math.floor(threshold * 0.25))) {
    return "CRITICAL";
  }

  if (quantity <= threshold) {
    return "LOW";
  }

  if (quantity <= threshold * 1.5) {
    return "WATCH";
  }

  return "HEALTHY";
};

const getStockPercent = (item) => {
  const quantity = Number(item.quantity || 0);
  const threshold = Number(item.threshold || 1);
  const target = Math.max(threshold * 2, quantity, 1);

  return Math.max(3, Math.min(100, Math.round((quantity / target) * 100)));
};

const getHealthMeta = (health) => {
  const meta = {
    HEALTHY: {
      label: "Healthy",
      barClass: "bg-emerald-500",
      badgeClass: "bg-emerald-100 text-emerald-700",
      iconClass: "bg-emerald-100 text-emerald-700",
    },
    WATCH: {
      label: "Watch",
      barClass: "bg-amber-500",
      badgeClass: "bg-amber-100 text-amber-700",
      iconClass: "bg-amber-100 text-amber-700",
    },
    LOW: {
      label: "Low Stock",
      barClass: "bg-orange-500",
      badgeClass: "bg-orange-100 text-orange-700",
      iconClass: "bg-orange-100 text-orange-700",
    },
    CRITICAL: {
      label: "Critical",
      barClass: "bg-red-500",
      badgeClass: "bg-red-100 text-red-700",
      iconClass: "bg-red-100 text-red-700",
    },
  };

  return meta[health] || meta.WATCH;
};

const getMedicineName = (item) => {
  const genericName = item.medicine?.generic_name || "Medicine";
  const dosage = item.medicine?.dosage ? ` ${item.medicine.dosage}` : "";

  return `${genericName}${dosage}`.trim();
};

const buildFacilityView = (facility, related) => {
  const inventoryRows = related.inventory.filter((item) => item.facility_id === facility.id);
  const requestRows = related.requests.filter((request) => request.facility_id === facility.id);
  const patientCount = related.patients.filter((patient) => patient.facility_id === facility.id).length;
  const forecastRows = related.forecasts.filter((forecast) => forecast.facility_id === facility.id);

  const stockCounts = inventoryRows.reduce(
    (counts, item) => {
      const status = getStockStatus(item);
      counts[status] += 1;
      counts.totalQuantity += Number(item.quantity || 0);
      counts.totalValue += Number(item.quantity || 0) * Number(item.medicine?.unit_cost || 0);
      return counts;
    },
    { HEALTHY: 0, WATCH: 0, LOW: 0, CRITICAL: 0, totalQuantity: 0, totalValue: 0 }
  );

  const healthPercent =
    inventoryRows.length === 0
      ? 0
      : Math.round(
          inventoryRows.reduce((sum, item) => sum + getStockPercent(item), 0) /
            inventoryRows.length
        );

  const stockHealth =
    stockCounts.CRITICAL > 0
      ? "CRITICAL"
      : stockCounts.LOW > 0
        ? "LOW"
        : healthPercent < 60
          ? "WATCH"
          : "HEALTHY";

  const completedRequests = requestRows.filter(
    (request) => request.status === "COMPLETED" || request.status === "APPROVED"
  ).length;
  const pendingRequests = requestRows.filter((request) => request.status === "PENDING").length;
  const distributionRate =
    requestRows.length === 0 ? 0 : Math.round((completedRequests / requestRows.length) * 100);

  const forecastTotal = forecastRows.reduce(
    (sum, forecast) => sum + Number(forecast.predicted_quantity || 0),
    0
  );

  return {
    ...facility,
    inventoryRows,
    requestRows,
    forecastRows,
    patientCount,
    stockCounts,
    healthPercent,
    stockHealth,
    distributionRate,
    pendingRequests,
    forecastTotal,
  };
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
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return enrichedFacilities
      .filter((facility) => {
        const searchableText = [
          facility.facility_name,
          facility.facility_code,
          facility.address,
          formatFacilityType(facility.facility_type),
          facility.status,
          getHealthMeta(facility.stockHealth).label,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          (!normalizedSearch || searchableText.includes(normalizedSearch)) &&
          (stockFilter === "ALL" || facility.stockHealth === stockFilter)
        );
      })
      .sort((firstFacility, secondFacility) => {
        const comparison = firstFacility.facility_name.localeCompare(
          secondFacility.facility_name
        );

        return sortDirection === "ASC" ? comparison : comparison * -1;
      });
  }, [enrichedFacilities, searchTerm, sortDirection, stockFilter]);

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
        .select("id, facility_name, facility_code, facility_type, address, status")
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
    });
    setFacilityError("");
    setModalMode("form");
  };

  const openDetailsModal = (facility) => {
    setSelectedFacility(facility);
    setFacilityError("");
    setModalMode("details");
  };

  const closeModal = () => {
    if (isSaving) {
      return;
    }

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

      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="facilities-toolbar">
          <div className="facilities-toolbar-controls">
            <label className="relative block w-full max-w-md">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by facility name, address, or code..."
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setSortDirection((currentDirection) =>
                    currentDirection === "ASC" ? "DESC" : "ASC"
                  )
                }
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
                aria-label={
                  sortDirection === "ASC"
                    ? "Sort facilities descending"
                    : "Sort facilities ascending"
                }
                title={
                  sortDirection === "ASC"
                    ? "Sort descending"
                    : "Sort ascending"
                }
              >
                {sortDirection === "ASC" ? <SortAscendingIcon /> : <SortDescendingIcon />}
              </button>
              <label className="relative block">
                <span className="sr-only">Stock health filter</span>
                <select
                  value={stockFilter}
                  onChange={(event) => setStockFilter(event.target.value)}
                  className="h-10 min-w-[152px] appearance-none rounded-lg border border-neutral-200 bg-white py-0 pl-4 pr-10 text-sm font-bold text-neutral-700 outline-none transition hover:border-emerald-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  {stockHealthOptions.map((health) => (
                    <option key={health.value} value={health.value}>
                      {health.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <ChevronDownIcon />
                </span>
              </label>
            </div>
          </div>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
            >
              <PlusIcon />
              Add Facility
            </button>
          </div>
        </div>
      </section>

      <section className="facilities-grid mt-5">
        {isLoading ? (
          <p className="col-span-full rounded-xl border border-neutral-200 bg-white px-5 py-14 text-center text-sm font-bold text-neutral-500 shadow-sm">
            Loading facilities...
          </p>
        ) : filteredFacilities.length === 0 ? (
          <p className="col-span-full rounded-xl border border-neutral-200 bg-white px-5 py-14 text-center text-sm font-bold text-neutral-500 shadow-sm">
            No facilities match the current filters.
          </p>
        ) : (
          filteredFacilities.map((facility) => (
            <FacilityCard
              key={facility.id}
              facility={facility}
              isSelected={selectedFacility?.id === facility.id}
              onView={() => openDetailsModal(facility)}
            />
          ))
        )}
      </section>

      {modalMode === "form" && (
        <FacilityFormModal
          editingFacility={editingFacility}
          formValues={formValues}
          error={facilityError}
          isSaving={isSaving}
          onClose={closeModal}
          onChange={handleFieldChange}
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

function FacilityCard({ facility, isSelected, onView }) {
  const healthMeta = getHealthMeta(facility.stockHealth);

  return (
    <article
      className={`rounded-xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isSelected
          ? "border-emerald-400 ring-1 ring-emerald-200"
          : "border-neutral-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-black text-black">
            {facility.facility_name}
          </h3>
          <p className="text-sm font-medium text-neutral-500">
            {formatFacilityType(facility.facility_type)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${facility.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
          {formatStatus(facility.status)}
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm font-medium text-neutral-500">
        <InfoLine icon={<LocationIcon />} text={facility.address} />
        <InfoLine icon={<CodeIcon />} text={facility.facility_code} />
        <InfoLine icon={<StockIcon />} text={`${facility.inventoryRows.length} inventory records`} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MetricTile value={formatNumber(facility.stockCounts.totalQuantity)} label="Units" />
        <MetricTile value={formatNumber(facility.requestRows.length)} label="Requests" />
        <MetricTile value={formatNumber(facility.patientCount)} label="Patients" />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs font-bold text-neutral-600">
          <span>Stock Health</span>
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
          <span className="text-xs font-semibold text-neutral-400">
            {facility.stockCounts.CRITICAL + facility.stockCounts.LOW} alerts
          </span>
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={onView}
          className="h-10 w-full rounded-lg bg-emerald-50 text-sm font-black text-emerald-700 hover:bg-emerald-100"
        >
          View Details
        </button>
      </div>
    </article>
  );
}

function FacilityDetailsModal({ facility, onClose, onEdit }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const healthMeta = getHealthMeta(facility.stockHealth);
  const stockRows = [...facility.inventoryRows]
    .sort((first, second) => getStockPercent(first) - getStockPercent(second))
    .slice(0, 6);
  const recentRequests = facility.requestRows.slice(0, 5);
  const forecastRows = facility.forecastRows.slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8">
      <div
        className={`flex max-h-[86vh] w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl shadow-neutral-900/20 transition-[max-width] duration-300 ${
          isExpanded ? "max-w-5xl" : "max-w-2xl"
        }`}
      >
        <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-4 text-neutral-950">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <FacilityIcon />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                  Facility Details
                </p>
                <h3 className="mt-1 truncate text-lg font-black">{facility.facility_name}</h3>
                <p className="text-sm font-medium text-neutral-600">
                  {facility.facility_code} - {formatFacilityType(facility.facility_type)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setIsExpanded((currentValue) => !currentValue)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-700 transition hover:bg-emerald-100"
                aria-label={isExpanded ? "Shrink facility details" : "Expand facility details"}
                title={isExpanded ? "Shrink" : "Expand"}
              >
                {isExpanded ? <ShrinkIcon /> : <ExpandIcon />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-white hover:text-neutral-950"
                aria-label="Close facility details"
              >
                <XIcon />
              </button>
            </div>
          </div>
        </div>

        <div className="prds-modal-scrollbar flex-1 overflow-y-auto bg-[#f8faf7] p-4 sm:p-5">
          <div
            className={`grid gap-3 ${
              isExpanded ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2"
            }`}
          >
            <DetailStat label="Stock Health" value={`${facility.healthPercent}%`} tone={facility.stockHealth} />
            <DetailStat label="Inventory Value" value={formatCurrency(facility.stockCounts.totalValue)} />
            <DetailStat label="Distribution Rate" value={`${facility.distributionRate}%`} />
            <DetailStat label="Patients" value={formatNumber(facility.patientCount)} />
          </div>

          <div className={`mt-4 grid gap-4 ${isExpanded ? "xl:grid-cols-[1.25fr_0.95fr]" : ""}`}>
            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-base font-black text-black">Inventory Health</h4>
                  <p className="text-sm font-medium text-neutral-500">
                    Current stock condition across medicine batches.
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${healthMeta.badgeClass}`}>
                  {healthMeta.label}
                </span>
              </div>

              <div className={`mt-4 grid gap-3 ${isExpanded ? "sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4"}`}>
                <MiniStatus label="Healthy" value={facility.stockCounts.HEALTHY} colorClass="bg-emerald-500" />
                <MiniStatus label="Watch" value={facility.stockCounts.WATCH} colorClass="bg-amber-500" />
                <MiniStatus label="Low" value={facility.stockCounts.LOW} colorClass="bg-orange-500" />
                <MiniStatus label="Critical" value={facility.stockCounts.CRITICAL} colorClass="bg-red-500" />
              </div>

              <div className="mt-4 space-y-3">
                {stockRows.length === 0 ? (
                  <p className="rounded-lg bg-neutral-50 px-4 py-5 text-center text-sm font-bold text-neutral-500">
                    No inventory records for this facility yet.
                  </p>
                ) : (
                  stockRows.map((item) => {
                    const percent = getStockPercent(item);
                    const status = getStockStatus(item);
                    const rowHealth = getHealthMeta(status);

                    return (
                      <div key={item.id} className="rounded-lg border border-neutral-100 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-black">{getMedicineName(item)}</p>
                            <p className="text-xs font-medium text-neutral-500">
                              Batch {item.batch_number} - Exp. {formatDate(item.expiration_date)}
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${rowHealth.badgeClass}`}>
                            {rowHealth.label}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <div className="h-1.5 flex-1 rounded-full bg-neutral-100">
                            <div className={`h-full rounded-full ${rowHealth.barClass}`} style={{ width: `${percent}%` }} />
                          </div>
                          <span className="w-16 text-right text-xs font-black text-neutral-700">
                            {formatNumber(item.quantity)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <div className="grid gap-5">
              <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <h4 className="text-base font-black text-black">Facility Profile</h4>
                <div className="mt-4 space-y-3">
                  <ProfileLine label="Facility Code" value={facility.facility_code} />
                  <ProfileLine label="Facility Type" value={formatFacilityType(facility.facility_type)} />
                  <ProfileLine label="Status" value={formatStatus(facility.status)} />
                  <ProfileLine label="Address" value={facility.address} />
                </div>
              </section>

              <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <h4 className="text-base font-black text-black">Distribution</h4>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MetricTile value={formatNumber(facility.requestRows.length)} label="Requests" />
                  <MetricTile value={formatNumber(facility.pendingRequests)} label="Pending" />
                </div>
                <div className="mt-4 space-y-3">
                  {recentRequests.length === 0 ? (
                    <p className="rounded-lg bg-neutral-50 px-4 py-4 text-sm font-bold text-neutral-500">
                      No medicine requests recorded.
                    </p>
                  ) : (
                    recentRequests.map((request) => (
                      <div key={request.id} className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-3 last:border-b-0 last:pb-0">
                        <div>
                          <p className="text-sm font-bold text-black">{formatDate(request.request_date)}</p>
                          <p className="text-xs font-medium text-neutral-500">
                            {request.items?.length || 0} medicines - {request.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0} units
                          </p>
                        </div>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-600">
                          {formatStatus(request.status)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>

          <section className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base font-black text-black">Demand Forecast</h4>
                <p className="text-sm font-medium text-neutral-500">
                  Upcoming predicted quantities for this facility.
                </p>
              </div>
              <span className="text-2xl font-black text-black">{formatNumber(facility.forecastTotal)}</span>
            </div>
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

        <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-100 bg-white px-5 py-4">
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
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-6 text-sm font-black text-white hover:bg-emerald-700"
          >
            <PencilIcon />
            Edit Facility
          </button>
        </div>
      </div>
    </div>
  );
}

function FacilityFormModal({
  editingFacility,
  formValues,
  error,
  isSaving,
  onClose,
  onChange,
  onSubmit,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <form
        onSubmit={onSubmit}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-neutral-100 px-6 py-5">
          <div>
            <h3 className="text-xl font-black text-black">
              {editingFacility ? "Edit Facility" : "Add Facility"}
            </h3>
            <p className="text-sm font-medium text-neutral-500">
              Use the fields defined by the facilities database schema.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close facility form"
          >
            <XIcon />
          </button>
        </div>

        <div className="prds-modal-scrollbar flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Facility Name"
              name="facility_name"
              value={formValues.facility_name}
              onChange={onChange}
              required
            />
            <Field
              label="Facility Code"
              name="facility_code"
              value={formValues.facility_code}
              onChange={onChange}
              required
            />
            <SelectField
              label="Facility Type"
              name="facility_type"
              value={formValues.facility_type}
              onChange={onChange}
              options={facilityTypes}
            />
            <SelectField
              label="Status"
              name="status"
              value={formValues.status}
              onChange={onChange}
              options={facilityStatuses}
            />
          </div>

          <label className="mt-4 grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600">
            Address
            <textarea
              name="address"
              value={formValues.address}
              onChange={onChange}
              rows="4"
              required
              className="resize-none rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
        </div>

        <div className="flex justify-end gap-3 border-t border-neutral-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-neutral-100 px-6 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="h-10 rounded-lg bg-emerald-600 px-6 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSaving ? "Saving..." : "Save Facility"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DetailStat({ label, value, tone = "HEALTHY" }) {
  const healthMeta = getHealthMeta(tone);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${healthMeta.iconClass}`}>
        <StockIcon />
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

function InfoLine({ icon, text }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-neutral-400">{icon}</span>
      <span className="truncate">{text}</span>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600">
      {label}
      <input
        {...props}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

function SelectField({ label, options, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600">
      {label}
      <select
        {...props}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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

function SortAscendingIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M4 7h13" />
      <path d="M4 12h9" />
      <path d="M4 17h5" />
      <path d="m17 14 3 3 3-3" />
      <path d="M20 6v11" />
    </svg>
  );
}

function SortDescendingIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M4 7h5" />
      <path d="M4 12h9" />
      <path d="M4 17h13" />
      <path d="m17 10 3-3 3 3" />
      <path d="M20 18V7" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
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

function LocationIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M4 7h16M4 12h10M4 17h7" />
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

function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M15 3h6v6" />
      <path d="m14 10 7-7" />
      <path d="M9 21H3v-6" />
      <path d="m10 14-7 7" />
    </svg>
  );
}

function ShrinkIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M21 9h-6V3" />
      <path d="m14 10 7-7" />
      <path d="M3 15h6v6" />
      <path d="m10 14-7 7" />
    </svg>
  );
}
