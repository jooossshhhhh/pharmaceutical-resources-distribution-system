import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";

const supplierStatuses = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

const emptySupplierForm = {
  supplier_name: "",
  contact_number: "",
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

const getStatusClass = (status) => {
  return status === "ACTIVE"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
    : "bg-slate-100 text-slate-600 ring-slate-200";
};

export default function SuppliersModule() {
  const { profile } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [supplierError, setSupplierError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formValues, setFormValues] = useState(emptySupplierForm);

  const today = useMemo(() => formatDateTime(new Date()), []);

  const filteredSuppliers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return suppliers.filter((supplier) => {
      const matchesSearch =
        !normalizedSearch ||
        supplier.supplier_name.toLowerCase().includes(normalizedSearch) ||
        (supplier.contact_number || "").toLowerCase().includes(normalizedSearch) ||
        (supplier.address || "").toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        statusFilter === "ALL" || supplier.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [searchTerm, statusFilter, suppliers]);

  const summary = useMemo(() => {
    return suppliers.reduce(
      (counts, supplier) => {
        counts.total += 1;
        counts.active += supplier.status === "ACTIVE" ? 1 : 0;
        counts.inactive += supplier.status === "INACTIVE" ? 1 : 0;
        counts.withContact += supplier.contact_number ? 1 : 0;
        return counts;
      },
      { total: 0, active: 0, inactive: 0, withContact: 0 }
    );
  }, [suppliers]);

  const loadSuppliers = async () => {
    setIsLoading(true);
    setSupplierError("");

    const { data, error } = await supabase
      .from("suppliers")
      .select("id, supplier_name, contact_number, address, status")
      .order("supplier_name", { ascending: true });

    if (error) {
      setSupplierError(error.message);
      setIsLoading(false);
      return;
    }

    setSuppliers(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadSuppliers();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const openCreateModal = () => {
    setEditingSupplier(null);
    setFormValues(emptySupplierForm);
    setSupplierError("");
    setIsModalOpen(true);
  };

  const openEditModal = (supplier) => {
    setEditingSupplier(supplier);
    setFormValues({
      supplier_name: supplier.supplier_name,
      contact_number: supplier.contact_number || "",
      address: supplier.address || "",
      status: supplier.status,
    });
    setSupplierError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) {
      return;
    }

    setIsModalOpen(false);
    setEditingSupplier(null);
    setFormValues(emptySupplierForm);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((currentValues) => ({ ...currentValues, [name]: value }));
  };

  const validateForm = () => {
    if (!formValues.supplier_name.trim()) {
      return "Supplier name is required.";
    }

    return "";
  };

  const handleSaveSupplier = async (event) => {
    event.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setSupplierError(validationError);
      return;
    }

    setIsSaving(true);
    setSupplierError("");

    const payload = {
      supplier_name: formValues.supplier_name.trim(),
      contact_number: formValues.contact_number.trim() || null,
      address: formValues.address.trim() || null,
      status: formValues.status,
    };

    const request = editingSupplier
      ? supabase.from("suppliers").update(payload).eq("id", editingSupplier.id)
      : supabase.from("suppliers").insert(payload);

    const { error } = await request;

    if (error) {
      setSupplierError(error.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    closeModal();
    await loadSuppliers();
  };

  const handleStatusToggle = async (supplier) => {
    const nextStatus = supplier.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setSupplierError("");

    const { error } = await supabase
      .from("suppliers")
      .update({ status: nextStatus })
      .eq("id", supplier.id);

    if (error) {
      setSupplierError(error.message);
      return;
    }

    await loadSuppliers();
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
            Core Module
          </p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
            Suppliers
          </h2>
          <p className="text-sm font-medium text-slate-500">
            Manage medicine suppliers used by facility inventory batches.
          </p>
        </div>
        <button type="button" onClick={openCreateModal} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-800">
          Add Supplier
        </button>
      </div>

      {supplierError && !isModalOpen && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {supplierError}
        </p>
      )}

      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="Total Suppliers" value={summary.total} tone="emerald" />
        <SummaryCard label="Active" value={summary.active} tone="blue" />
        <SummaryCard label="With Contact" value={summary.withContact} tone="amber" />
        <SummaryCard label="Inactive" value={summary.inactive} tone="slate" />
      </div>

      <section className="mt-4 rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
          <div>
            <h3 className="text-base font-black text-slate-950">Supplier Directory</h3>
            <p className="text-xs font-semibold text-slate-500">
              {filteredSuppliers.length} shown from {suppliers.length} records
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search supplier, contact, address"
              className="h-10 w-72 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="ALL">All statuses</option>
              {supplierStatuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-10 text-center font-bold text-slate-500" colSpan="5">
                    Loading suppliers...
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center font-bold text-slate-500" colSpan="5">
                    No suppliers match the current filters.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-4">
                      <p className="font-black text-slate-950">{supplier.supplier_name}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        ID: {supplier.id.slice(0, 8)}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-600">
                      {supplier.contact_number || "Not provided"}
                    </td>
                    <td className="max-w-md px-4 py-4 font-medium text-slate-600">
                      {supplier.address || "Not provided"}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ring-1 ${getStatusClass(supplier.status)}`}>
                        {supplier.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => openEditModal(supplier)} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                          Edit
                        </button>
                        <button type="button" onClick={() => handleStatusToggle(supplier)} className="rounded-md border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
                          {supplier.status === "ACTIVE" ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <form onSubmit={handleSaveSupplier} className="w-full max-w-2xl rounded-md bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <h3 className="text-xl font-black text-slate-950">
                {editingSupplier ? "Edit Supplier" : "Add Supplier"}
              </h3>
              <p className="text-sm font-semibold text-slate-500">
                Supplier name is unique in the database.
              </p>
            </div>

            <div className="grid gap-4 px-6 py-5">
              {supplierError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {supplierError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Supplier Name" name="supplier_name" value={formValues.supplier_name} onChange={handleFieldChange} />
                <Field label="Contact Number" name="contact_number" value={formValues.contact_number} onChange={handleFieldChange} />
              </div>
              <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                Status
                <select name="status" value={formValues.status} onChange={handleFieldChange} className="h-11 rounded-md border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100">
                  {supplierStatuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                Address
                <textarea name="address" value={formValues.address} onChange={handleFieldChange} rows="3" className="resize-none rounded-md border border-slate-200 px-3 py-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button type="button" onClick={closeModal} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300">
                {isSaving ? "Saving..." : "Save Supplier"}
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

function SummaryCard({ label, value, tone }) {
  const toneClasses = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-white text-slate-700",
  };

  return (
    <div className={`rounded-md border p-4 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-xs font-black uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}
