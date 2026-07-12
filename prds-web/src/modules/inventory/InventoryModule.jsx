import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";

const emptyInventoryForm = {
  facility_id: "",
  medicine_id: "",
  supplier_id: "",
  quantity: "",
  threshold: "",
  batch_number: "",
  date_received: "",
  expiration_date: "",
};

const pageSize = 10;

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
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dateString));
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
};

const formatNumber = (value) => {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
};

const getStockStatus = (item) => {
  const quantity = Number(item.quantity || 0);
  const threshold = Number(item.threshold || 0);

  if (quantity === 0 || quantity <= Math.max(1, Math.floor(threshold * 0.25))) {
    return {
      key: "CRITICAL",
      label: "Critical",
      badgeClass: "bg-red-100 text-red-700",
      barClass: "bg-red-500",
    };
  }

  if (quantity <= threshold) {
    return {
      key: "LOW",
      label: "Low Stock",
      badgeClass: "bg-orange-100 text-orange-700",
      barClass: "bg-orange-500",
    };
  }

  return {
    key: "NORMAL",
    label: "Normal",
    badgeClass: "bg-emerald-100 text-emerald-700",
    barClass: "bg-emerald-500",
  };
};

const getStockPercent = (item) => {
  const quantity = Number(item.quantity || 0);
  const threshold = Number(item.threshold || 1);
  const target = Math.max(threshold * 2, quantity, 1);

  return Math.max(3, Math.min(100, Math.round((quantity / target) * 100)));
};

const getMedicineName = (item) => {
  const genericName = item.medicine?.generic_name || "Medicine";
  const dosage = item.medicine?.dosage ? ` ${item.medicine.dosage}` : "";

  return `${genericName}${dosage}`;
};

export default function InventoryModule() {
  const { profile } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("ALL");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const [modalMode, setModalMode] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formValues, setFormValues] = useState(emptyInventoryForm);

  const today = useMemo(() => formatDateTime(new Date()), []);

  const unitOptions = useMemo(() => {
    return Array.from(
      new Set(
        medicines
          .map((medicine) => medicine.unit_of_measure)
          .filter(Boolean)
      )
    ).sort((first, second) => first.localeCompare(second));
  }, [medicines]);

  const filteredInventory = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return inventory.filter((item) => {
      const status = getStockStatus(item).key;
      const searchableText = [
        item.medicine?.generic_name,
        item.medicine?.brand_name,
        item.medicine?.dosage,
        item.medicine?.unit_of_measure,
        item.facility?.facility_name,
        item.supplier?.supplier_name,
        item.batch_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedSearch || searchableText.includes(normalizedSearch)) &&
        (facilityFilter === "ALL" || item.facility_id === facilityFilter) &&
        (unitFilter === "ALL" || item.medicine?.unit_of_measure === unitFilter) &&
        (stockFilter === "ALL" || status === stockFilter)
      );
    });
  }, [facilityFilter, inventory, searchTerm, stockFilter, unitFilter]);

  const paginatedInventory = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredInventory.slice(startIndex, startIndex + pageSize);
  }, [currentPage, filteredInventory]);

  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / pageSize));

  const summary = useMemo(() => {
    return inventory.reduce(
      (counts, item) => {
        const status = getStockStatus(item).key;
        const unitCost = Number(item.medicine?.unit_cost || 0);
        const quantity = Number(item.quantity || 0);

        counts.totalItems += 1;
        counts.totalValue += quantity * unitCost;
        counts.critical += status === "CRITICAL" ? 1 : 0;
        counts.low += status === "LOW" ? 1 : 0;

        return counts;
      },
      { totalItems: 0, critical: 0, low: 0, totalValue: 0 }
    );
  }, [inventory]);

  const loadInventory = async () => {
    setIsLoading(true);
    setInventoryError("");

    const [inventoryResult, facilitiesResult, medicinesResult, suppliersResult] =
      await Promise.all([
        supabase
          .from("inventory")
          .select(`
            id,
            facility_id,
            medicine_id,
            supplier_id,
            quantity,
            threshold,
            batch_number,
            date_received,
            expiration_date,
            updated_at,
            facility:facilities(id, facility_name, facility_code),
            medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure, unit_cost),
            supplier:suppliers(id, supplier_name)
          `)
          .order("updated_at", { ascending: false }),
        supabase
          .from("facilities")
          .select("id, facility_name, facility_code")
          .eq("status", "ACTIVE")
          .order("facility_name", { ascending: true }),
        supabase
          .from("medicines")
          .select("id, generic_name, brand_name, dosage, unit_of_measure, unit_cost")
          .order("generic_name", { ascending: true }),
        supabase
          .from("suppliers")
          .select("id, supplier_name")
          .eq("status", "ACTIVE")
          .order("supplier_name", { ascending: true }),
      ]);

    const firstError = [
      inventoryResult,
      facilitiesResult,
      medicinesResult,
      suppliersResult,
    ].find((result) => result.error)?.error;

    if (firstError) {
      setInventoryError(firstError.message);
      setIsLoading(false);
      return;
    }

    setInventory(inventoryResult.data || []);
    setFacilities(facilitiesResult.data || []);
    setMedicines(medicinesResult.data || []);
    setSuppliers(suppliersResult.data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadInventory();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const openCreateModal = () => {
    setSelectedItem(null);
    setFormValues(emptyInventoryForm);
    setInventoryError("");
    setModalMode("create");
  };

  const openItemModal = (item, mode) => {
    setSelectedItem(item);
    setFormValues({
      facility_id: item.facility_id,
      medicine_id: item.medicine_id,
      supplier_id: item.supplier_id,
      quantity: String(item.quantity ?? ""),
      threshold: String(item.threshold ?? ""),
      batch_number: item.batch_number || "",
      date_received: item.date_received || "",
      expiration_date: item.expiration_date || "",
    });
    setInventoryError("");
    setModalMode(mode);
  };

  const closeModal = () => {
    if (isSaving) {
      return;
    }

    setModalMode(null);
    setSelectedItem(null);
    setFormValues(emptyInventoryForm);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: name === "batch_number" ? value.toUpperCase() : value,
    }));
  };

  const validateForm = () => {
    if (!formValues.facility_id || !formValues.medicine_id || !formValues.supplier_id) {
      return "Facility, medicine, and supplier are required.";
    }

    if (!formValues.batch_number.trim()) {
      return "Batch number is required.";
    }

    if (Number(formValues.quantity) < 0 || formValues.quantity === "") {
      return "Quantity must be zero or higher.";
    }

    if (Number(formValues.threshold) < 0 || formValues.threshold === "") {
      return "Threshold must be zero or higher.";
    }

    if (!formValues.date_received || !formValues.expiration_date) {
      return "Date received and expiration date are required.";
    }

    if (new Date(formValues.expiration_date) <= new Date(formValues.date_received)) {
      return "Expiration date must be later than date received.";
    }

    return "";
  };

  const handleSaveInventory = async (event) => {
    event.preventDefault();

    if (modalMode === "view") {
      closeModal();
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setInventoryError(validationError);
      return;
    }

    setIsSaving(true);
    setInventoryError("");

    const payload = {
      facility_id: formValues.facility_id,
      medicine_id: formValues.medicine_id,
      supplier_id: formValues.supplier_id,
      quantity: Number(formValues.quantity),
      threshold: Number(formValues.threshold),
      batch_number: formValues.batch_number.trim(),
      date_received: formValues.date_received,
      expiration_date: formValues.expiration_date,
      updated_at: new Date().toISOString(),
    };

    const request =
      modalMode === "edit" && selectedItem
        ? supabase.from("inventory").update(payload).eq("id", selectedItem.id)
        : supabase.from("inventory").insert(payload);

    const { error } = await request;

    if (error) {
      setInventoryError(error.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    closeModal();
    await loadInventory();
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {inventoryError && !modalMode && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {inventoryError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <MetricCard label="Total Items" value={formatNumber(summary.totalItems)} tone="emerald">
          <LayersIcon />
        </MetricCard>
        <MetricCard label="Critical Stock" value={formatNumber(summary.critical)} tone="red">
          <AlertCircleIcon />
        </MetricCard>
        <MetricCard label="Low Stock" value={formatNumber(summary.low)} tone="orange">
          <TriangleIcon />
        </MetricCard>
        <MetricCard label="Est. Total Value" value={formatCurrency(summary.totalValue)} tone="blue">
          <CoinIcon />
        </MetricCard>
      </div>

      <section className="mt-5 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[1fr_220px_220px]">
          <label className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search medicine name, batch, facility, supplier..."
              className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <select
            value={facilityFilter}
            onChange={(event) => {
              setFacilityFilter(event.target.value);
              setCurrentPage(1);
            }}
            className="h-10 rounded-lg border border-emerald-500 bg-white px-3 text-sm font-semibold text-neutral-800 outline-none focus:ring-2 focus:ring-emerald-100"
          >
            <option value="ALL">All Facilities</option>
            {facilities.map((facility) => (
              <option key={facility.id} value={facility.id}>
                {facility.facility_name}
              </option>
            ))}
          </select>
          <select
            value={unitFilter}
            onChange={(event) => {
              setUnitFilter(event.target.value);
              setCurrentPage(1);
            }}
            className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="ALL">All Units</option>
            {unitOptions.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["ALL", "All"],
            ["NORMAL", "Normal"],
            ["LOW", "Low Stock"],
            ["CRITICAL", "Critical"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setStockFilter(value);
                setCurrentPage(1);
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                stockFilter === value
                  ? "bg-black text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <h2 className="text-base font-black text-black">
            Inventory List{" "}
            <span className="font-semibold text-neutral-400">
              ({filteredInventory.length} items)
            </span>
          </h2>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
          >
            <PlusIcon />
            Add Stock
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="border-y border-neutral-100 bg-[#fbfaf8] text-[11px] font-black uppercase tracking-[0.12em] text-neutral-500">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Stock Level</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3">Last Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-12 text-center font-bold text-neutral-500" colSpan="9">
                    Loading inventory...
                  </td>
                </tr>
              ) : paginatedInventory.length === 0 ? (
                <tr>
                  <td className="px-4 py-12 text-center font-bold text-neutral-500" colSpan="9">
                    No inventory records match the current filters.
                  </td>
                </tr>
              ) : (
                paginatedInventory.map((item) => {
                  const status = getStockStatus(item);
                  const percent = getStockPercent(item);

                  return (
                    <tr key={item.id} className="hover:bg-[#fbfaf8]">
                      <td className="px-4 py-3">
                        <p className="font-black text-black">{getMedicineName(item)}</p>
                        <p className="text-xs font-medium text-neutral-400">
                          {item.medicine?.brand_name || item.batch_number}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
                          {item.medicine?.unit_of_measure || "Unit"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-700">
                        {item.facility?.facility_name || "-"}
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-500">
                        {item.supplier?.supplier_name || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-100">
                            <div
                              className={`h-full rounded-full ${status.barClass}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span
                            className={`text-sm font-black ${
                              status.key === "NORMAL" ? "text-black" : "text-red-500"
                            }`}
                          >
                            {formatNumber(item.quantity)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-neutral-400">
                          min: {formatNumber(item.threshold)} {item.medicine?.unit_of_measure}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${status.badgeClass}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-700">
                        {formatDate(item.expiration_date)}
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-500">
                        {formatDate(item.updated_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <IconButton label="View stock" onClick={() => openItemModal(item, "view")}>
                            <EyeIcon />
                          </IconButton>
                          <IconButton label="Edit stock" onClick={() => openItemModal(item, "edit")}>
                            <PencilIcon />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-4">
          <p className="text-xs font-medium text-neutral-500">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeftIcon />
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1)
              .slice(0, 5)
              .map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`h-8 min-w-8 rounded-lg px-2 text-sm font-black ${
                    currentPage === page
                      ? "bg-black text-white"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {page}
                </button>
              ))}
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>
      </section>

      {modalMode && (
        <InventoryModal
          mode={modalMode}
          selectedItem={selectedItem}
          formValues={formValues}
          facilities={facilities}
          medicines={medicines}
          suppliers={suppliers}
          error={inventoryError}
          isSaving={isSaving}
          onClose={closeModal}
          onChange={handleFieldChange}
          onSubmit={handleSaveInventory}
          onEdit={() => setModalMode("edit")}
        />
      )}
    </AdminShell>
  );
}

function InventoryModal({
  mode,
  selectedItem,
  formValues,
  facilities,
  medicines,
  suppliers,
  error,
  isSaving,
  onClose,
  onChange,
  onSubmit,
  onEdit,
}) {
  const isReadOnly = mode === "view";
  const title =
    mode === "create" ? "Add New Stock" : mode === "edit" ? "Edit Stock" : "Stock Details";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <form
        onSubmit={onSubmit}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-neutral-100 px-6 py-5">
          <div>
            <h3 className="text-xl font-black text-black">{title}</h3>
            <p className="text-sm font-medium text-neutral-500">
              {isReadOnly
                ? "Review medicine inventory details"
                : "Enter medicine inventory details from the inventory schema"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close inventory modal"
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

          {isReadOnly && selectedItem && (
            <div className="mb-5 grid gap-3 rounded-xl border border-neutral-200 bg-[#fbfaf8] p-4 sm:grid-cols-3">
              <Detail label="Batch" value={selectedItem.batch_number} />
              <Detail label="Status" value={getStockStatus(selectedItem).label} />
              <Detail
                label="Estimated Value"
                value={formatCurrency(
                  Number(selectedItem.quantity || 0) *
                    Number(selectedItem.medicine?.unit_cost || 0)
                )}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Medicine"
              name="medicine_id"
              value={formValues.medicine_id}
              onChange={onChange}
              disabled={isReadOnly}
              required
            >
              <option value="">Select medicine</option>
              {medicines.map((medicine) => (
                <option key={medicine.id} value={medicine.id}>
                  {medicine.generic_name} {medicine.dosage}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Facility"
              name="facility_id"
              value={formValues.facility_id}
              onChange={onChange}
              disabled={isReadOnly}
              required
            >
              <option value="">Select facility</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.facility_name}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Supplier"
              name="supplier_id"
              value={formValues.supplier_id}
              onChange={onChange}
              disabled={isReadOnly}
              required
            >
              <option value="">Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.supplier_name}
                </option>
              ))}
            </SelectField>

            <Field
              label="Batch Number"
              name="batch_number"
              value={formValues.batch_number}
              onChange={onChange}
              disabled={isReadOnly}
              required
            />

            <Field
              label="Stock Quantity"
              name="quantity"
              type="number"
              min="0"
              value={formValues.quantity}
              onChange={onChange}
              disabled={isReadOnly}
              required
            />

            <Field
              label="Minimum Threshold"
              name="threshold"
              type="number"
              min="0"
              value={formValues.threshold}
              onChange={onChange}
              disabled={isReadOnly}
              required
            />

            <Field
              label="Date Received"
              name="date_received"
              type="date"
              value={formValues.date_received}
              onChange={onChange}
              disabled={isReadOnly}
              required
            />

            <Field
              label="Expiration Date"
              name="expiration_date"
              type="date"
              value={formValues.expiration_date}
              onChange={onChange}
              disabled={isReadOnly}
              required
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-neutral-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-neutral-100 px-6 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
          >
            {isReadOnly ? "Close" : "Cancel"}
          </button>
          {isReadOnly ? (
            <button
              type="button"
              onClick={onEdit}
              className="h-10 rounded-lg bg-emerald-600 px-6 text-sm font-black text-white hover:bg-emerald-700"
            >
              Edit Stock
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-6 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              <PlusIcon />
              {isSaving ? "Saving..." : mode === "create" ? "Add to Inventory" : "Save Changes"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function MetricCard({ label, value, tone, children }) {
  const toneClasses = {
    emerald: "bg-emerald-100 text-emerald-600",
    red: "bg-red-100 text-red-500",
    orange: "bg-orange-100 text-orange-600",
    blue: "bg-blue-100 text-blue-600",
  };

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500">
          {label}
        </p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
          {children}
        </span>
      </div>
      <p className="mt-5 text-2xl font-black text-black">{value}</p>
    </article>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600">
      {label}
      <input
        {...props}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-neutral-50 disabled:text-neutral-500"
      />
    </label>
  );
}

function SelectField({ label, children, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600">
      {label}
      <select
        {...props}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-neutral-50 disabled:text-neutral-500"
      >
        {children}
      </select>
    </label>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 text-sm font-black text-black">{value || "-"}</p>
    </div>
  );
}

function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-emerald-700"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
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

function LayersIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="m12 3 8 4-8 4-8-4 8-4Z" />
      <path d="m4 11 8 4 8-4" />
      <path d="m4 15 8 4 8-4" />
    </svg>
  );
}

function AlertCircleIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function TriangleIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M10.3 4.3 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M15 9.5A3.5 3.5 0 0 0 12 8c-1.7 0-3 1-3 2.3s1.3 2.2 3 2.2 3 1 3 2.2S13.7 17 12 17a3.5 3.5 0 0 1-3-1.5" />
      <path d="M12 6v12" />
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

function EyeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
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

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
