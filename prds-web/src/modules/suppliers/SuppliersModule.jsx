import { useEffect, useMemo, useState } from "react";

import ModalShell from "../../components/ModalShell";
import PaginationControls from "../../components/PaginationControls";
import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
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

const formatDateTime = (date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

const getStatusClass = (status) =>
  status === "ACTIVE"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
    : "bg-slate-100 text-slate-600 ring-slate-200";

const getStatusLabel = (value) =>
  supplierStatuses.find((status) => status.value === value)?.label || value;

const getSupplierErrorMessage = (error) => {
  const message = error?.message || "";
  const code = error?.code || "";
  const normalized = `${message} ${code}`.toLowerCase();

  if (
    code === "23505" ||
    normalized.includes("duplicate") ||
    normalized.includes("suppliers_name_unique")
  ) {
    return "A supplier with this name already exists.";
  }

  if (normalized.includes("row-level security")) {
    return "You do not have permission to manage suppliers.";
  }

  return message || "Unable to save supplier. Please try again.";
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
  const [statusChangingId, setStatusChangingId] = useState("");
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
  const {
    currentPage,
    paginatedRows: paginatedSuppliers,
    pageSize,
    setCurrentPage,
    totalCount,
    totalPages,
  } = usePaginatedRows(filteredSuppliers);

  const loadSuppliers = async () => {
    setIsLoading(true);
    setSupplierError("");

    const { data, error } = await supabase
      .from("suppliers")
      .select("id, supplier_name, contact_number, address, status")
      .order("supplier_name", { ascending: true });

    if (error) {
      setSupplierError(getSupplierErrorMessage(error));
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
      setSupplierError(getSupplierErrorMessage(error));
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
    setStatusChangingId(supplier.id);

    const { error } = await supabase
      .from("suppliers")
      .update({ status: nextStatus })
      .eq("id", supplier.id);

    setStatusChangingId("");

    if (error) {
      setSupplierError(getSupplierErrorMessage(error));
      return;
    }

    await loadSuppliers();
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <section className="rounded-xl border border-[#d8dadc] bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#007a52]">
              Supplier Registry
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-[#0d1117]">
              Suppliers
            </h2>
            <p className="text-sm font-medium text-[#42474e]">
              Manage supplier records used for medicine stock batches.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#0d1117] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#1f2937]"
          >
            Add Supplier
          </button>
        </div>
      </section>

      {supplierError && !isModalOpen && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {supplierError}
        </p>
      )}

      <section className="mt-4 overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#007a52]">
                Supplier Directory
              </p>
              <h3 className="mt-1 text-lg font-black text-[#0d1117]">
                Registered Suppliers
              </h3>
              <p className="text-xs font-semibold text-slate-500">
                {filteredSuppliers.length} shown from {suppliers.length} records
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search supplier name, contact, or address..."
                className="h-10 min-w-0 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 sm:w-80"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 sm:w-40"
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Supplier Name</th>
                <th className="px-4 py-3">Contact Number</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-10 text-center font-bold text-slate-500" colSpan={5}>
                    Loading suppliers...
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center font-bold text-slate-500" colSpan={5}>
                    No suppliers match the current filters.
                  </td>
                </tr>
              ) : (
                paginatedSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="align-top transition hover:bg-slate-50/80">
                    <td className="px-4 py-4">
                      <p className="max-w-xs whitespace-normal font-black text-slate-950">
                        {supplier.supplier_name}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-600">
                      {supplier.contact_number || "Not provided"}
                    </td>
                    <td className="max-w-md px-4 py-4 font-medium text-slate-600">
                      <p className="whitespace-normal break-words">
                        {supplier.address || "Not provided"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 ${getStatusClass(
                          supplier.status
                        )}`}
                      >
                        {getStatusLabel(supplier.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(supplier)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusToggle(supplier)}
                          disabled={statusChangingId === supplier.id}
                          className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
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

        {!isLoading && totalCount > 0 && (
          <PaginationControls
            currentPage={currentPage}
            itemLabel="suppliers"
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
          />
        )}
      </section>

      {isModalOpen && (
        <ModalShell
          labelledBy="supplier-modal-title"
          onClose={closeModal}
          panelClassName="max-w-2xl"
        >
          <form
            onSubmit={handleSaveSupplier}
            className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-emerald-50/60 px-6 py-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#007a52]">
                  Supplier Record
                </p>
                <h3 id="supplier-modal-title" className="mt-1 text-xl font-black text-slate-950">
                  {editingSupplier ? "Edit Supplier" : "Register Supplier"}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  Record supplier details used for inventory batches.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900"
                aria-label="Close supplier form"
              >
                x
              </button>
            </div>

            <div className="grid gap-4 bg-slate-50/70 px-6 py-5">
              {supplierError && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                >
                  {supplierError}
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Supplier Name"
                  name="supplier_name"
                  value={formValues.supplier_name}
                  onChange={handleFieldChange}
                  required
                />
                <Field
                  label="Contact Number"
                  name="contact_number"
                  type="tel"
                  value={formValues.contact_number}
                  onChange={handleFieldChange}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                  Address
                  <textarea
                    name="address"
                    value={formValues.address}
                    onChange={handleFieldChange}
                    rows={3}
                    className="resize-none rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="grid content-start gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                  Status
                  <select
                    name="status"
                    value={formValues.status}
                    onChange={handleFieldChange}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  >
                    {supplierStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-[#0d1117] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSaving
                  ? "Saving..."
                  : editingSupplier
                    ? "Save Changes"
                    : "Register Supplier"}
              </button>
            </div>
          </form>
        </ModalShell>
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
        className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}
