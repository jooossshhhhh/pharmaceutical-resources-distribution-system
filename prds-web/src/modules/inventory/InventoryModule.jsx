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
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateString));
};

const getStockStatus = (item) => {
  if (Number(item.quantity) <= Number(item.threshold)) {
    return {
      label: "Low Stock",
      className: "bg-red-50 text-red-700 ring-red-100",
    };
  }

  return {
    label: "In Stock",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  };
};

const isExpiringSoon = (dateString) => {
  const expirationDate = new Date(dateString);
  const today = new Date();
  const limit = new Date();
  limit.setDate(today.getDate() + 90);

  return expirationDate <= limit;
};

export default function InventoryModule() {
  const { profile } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("ALL");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formValues, setFormValues] = useState(emptyInventoryForm);

  const today = useMemo(() => formatDateTime(new Date()), []);

  const filteredInventory = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return inventory.filter((item) => {
      const medicineLabel = `${item.medicine?.generic_name || ""} ${item.medicine?.brand_name || ""}`;
      const matchesSearch =
        !normalizedSearch ||
        medicineLabel.toLowerCase().includes(normalizedSearch) ||
        item.batch_number.toLowerCase().includes(normalizedSearch) ||
        (item.supplier?.supplier_name || "").toLowerCase().includes(normalizedSearch);
      const matchesFacility =
        facilityFilter === "ALL" || item.facility_id === facilityFilter;
      const matchesStock =
        stockFilter === "ALL" ||
        (stockFilter === "LOW" && Number(item.quantity) <= Number(item.threshold)) ||
        (stockFilter === "EXPIRING" && isExpiringSoon(item.expiration_date));

      return matchesSearch && matchesFacility && matchesStock;
    });
  }, [facilityFilter, inventory, searchTerm, stockFilter]);

  const summary = useMemo(() => {
    return inventory.reduce(
      (counts, item) => {
        counts.totalBatches += 1;
        counts.totalQuantity += Number(item.quantity || 0);
        counts.lowStock += Number(item.quantity) <= Number(item.threshold) ? 1 : 0;
        counts.expiring += isExpiringSoon(item.expiration_date) ? 1 : 0;
        return counts;
      },
      { totalBatches: 0, totalQuantity: 0, lowStock: 0, expiring: 0 }
    );
  }, [inventory]);

  const loadInventory = async () => {
    setIsLoading(true);
    setInventoryError("");

    const [inventoryResult, facilitiesResult, medicinesResult, suppliersResult] = await Promise.all([
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
          medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure),
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
        .select("id, generic_name, brand_name, dosage, unit_of_measure")
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
    setEditingItem(null);
    setFormValues(emptyInventoryForm);
    setInventoryError("");
    setIsModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormValues({
      facility_id: item.facility_id,
      medicine_id: item.medicine_id,
      supplier_id: item.supplier_id,
      quantity: item.quantity,
      threshold: item.threshold,
      batch_number: item.batch_number,
      date_received: item.date_received,
      expiration_date: item.expiration_date,
    });
    setInventoryError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) {
      return;
    }

    setIsModalOpen(false);
    setEditingItem(null);
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

    const request = editingItem
      ? supabase.from("inventory").update(payload).eq("id", editingItem.id)
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
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
            Core Module
          </p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
            Inventory
          </h2>
          <p className="text-sm font-medium text-slate-500">
            Track medicine batches by facility, supplier, stock threshold, and expiry.
          </p>
        </div>
        <button type="button" onClick={openCreateModal} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-800">
          Add Stock Batch
        </button>
      </div>

      {inventoryError && !isModalOpen && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {inventoryError}
        </p>
      )}

      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="Stock Batches" value={summary.totalBatches} tone="emerald" />
        <SummaryCard label="Total Quantity" value={summary.totalQuantity} tone="blue" />
        <SummaryCard label="Low Stock" value={summary.lowStock} tone="red" />
        <SummaryCard label="Expiring <90d" value={summary.expiring} tone="amber" />
      </div>

      <section className="mt-4 rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
          <div>
            <h3 className="text-base font-black text-slate-950">Inventory Batches</h3>
            <p className="text-xs font-semibold text-slate-500">
              {filteredInventory.length} shown from {inventory.length} records
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search medicine, batch, supplier"
              className="h-10 w-72 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <select value={facilityFilter} onChange={(event) => setFacilityFilter(event.target.value)} className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100">
              <option value="ALL">All facilities</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.facility_name}
                </option>
              ))}
            </select>
            <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100">
              <option value="ALL">All stock</option>
              <option value="LOW">Low stock</option>
              <option value="EXPIRING">Expiring soon</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Expiration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-10 text-center font-bold text-slate-500" colSpan="8">
                    Loading inventory...
                  </td>
                </tr>
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center font-bold text-slate-500" colSpan="8">
                    No inventory batches match the current filters.
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item) => {
                  const stockStatus = getStockStatus(item);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-4">
                        <p className="font-black text-slate-950">
                          {item.medicine?.generic_name || "Medicine"}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          {item.medicine?.dosage} / {item.medicine?.unit_of_measure}
                        </p>
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-600">
                        {item.facility?.facility_name || "Facility"}
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-600">
                        {item.supplier?.supplier_name || "Supplier"}
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-700">
                        {item.batch_number}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-black text-slate-950">{item.quantity}</p>
                        <p className="text-xs font-semibold text-slate-500">
                          Threshold: {item.threshold}
                        </p>
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-600">
                        {formatDate(item.expiration_date)}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-black ring-1 ${stockStatus.className}`}>
                          {stockStatus.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button type="button" onClick={() => openEditModal(item)} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <form onSubmit={handleSaveInventory} className="w-full max-w-4xl rounded-md bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <h3 className="text-xl font-black text-slate-950">
                {editingItem ? "Edit Stock Batch" : "Add Stock Batch"}
              </h3>
              <p className="text-sm font-semibold text-slate-500">
                Batch uniqueness is enforced by facility, medicine, supplier, and batch number.
              </p>
            </div>

            <div className="grid gap-4 px-6 py-5">
              {inventoryError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {inventoryError}
                </p>
              )}

              <div className="grid grid-cols-3 gap-4">
                <SelectField label="Facility" name="facility_id" value={formValues.facility_id} onChange={handleFieldChange}>
                  <option value="">Select facility</option>
                  {facilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.facility_name}
                    </option>
                  ))}
                </SelectField>
                <SelectField label="Medicine" name="medicine_id" value={formValues.medicine_id} onChange={handleFieldChange}>
                  <option value="">Select medicine</option>
                  {medicines.map((medicine) => (
                    <option key={medicine.id} value={medicine.id}>
                      {medicine.generic_name} {medicine.dosage}
                    </option>
                  ))}
                </SelectField>
                <SelectField label="Supplier" name="supplier_id" value={formValues.supplier_id} onChange={handleFieldChange}>
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.supplier_name}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Field label="Quantity" name="quantity" type="number" min="0" value={formValues.quantity} onChange={handleFieldChange} />
                <Field label="Threshold" name="threshold" type="number" min="0" value={formValues.threshold} onChange={handleFieldChange} />
                <Field label="Batch Number" name="batch_number" value={formValues.batch_number} onChange={handleFieldChange} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Date Received" name="date_received" type="date" value={formValues.date_received} onChange={handleFieldChange} />
                <Field label="Expiration Date" name="expiration_date" type="date" value={formValues.expiration_date} onChange={handleFieldChange} />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button type="button" onClick={closeModal} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300">
                {isSaving ? "Saving..." : "Save Batch"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AdminShell>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
      {label}
      <input
        {...props}
        className="h-11 rounded-md border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

function SelectField({ label, children, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
      {label}
      <select
        {...props}
        className="h-11 rounded-md border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      >
        {children}
      </select>
    </label>
  );
}

function SummaryCard({ label, value, tone }) {
  const toneClasses = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    red: "border-red-100 bg-red-50 text-red-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
  };

  return (
    <div className={`rounded-md border p-4 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-xs font-black uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}
