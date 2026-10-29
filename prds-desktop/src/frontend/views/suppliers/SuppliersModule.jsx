import { useEffect, useMemo, useState } from "react";

import ModalShell from "../../components/ModalShell";
import PaginationControls from "../../components/PaginationControls";
import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import { supabase } from "@backend/client/supabase";
import { saveSnapshot, getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { isCurrentNetworkOnline } from "@backend/sync/networkStatus";

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
    ? "bg-[#E8F5F1] text-[#2D7A5D] ring-[#4C9F80]/30"
    : "bg-[#E5EFF1] text-[#5B7077] ring-[#CFDDE0]";

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
  const [suppliers, setSuppliers] = useState(() => getSnapshot(STORAGE_KEYS.SUPPLIERS, []));
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(() => getSnapshot(STORAGE_KEYS.SUPPLIERS, []).length === 0);
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
    if (!isCurrentNetworkOnline()) {
      setSuppliers(getSnapshot(STORAGE_KEYS.SUPPLIERS, []));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setSupplierError("");

    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, supplier_name, contact_number, address, status")
        .order("supplier_name", { ascending: true });

      if (error) {
        throw error;
      }

      setSuppliers(data || []);
      if (data) {
        saveSnapshot(STORAGE_KEYS.SUPPLIERS, data);
      }
    } catch (err) {
      console.warn("Suppliers fetch error, using snapshot:", err);
      setSuppliers(getSnapshot(STORAGE_KEYS.SUPPLIERS, []));
    } finally {
      setIsLoading(false);
    }
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
      <section className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] px-5 py-4 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#1F4E5A]">
              Supplier Registry
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-[#1B2B30]">
              Suppliers
            </h2>
            <p className="text-sm font-medium text-[#5B7077]">
              Manage supplier records used for medicine stock batches.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 text-sm font-black text-white shadow-xs transition hover:brightness-105 active:scale-[0.99]"
          >
            Add Supplier
          </button>
        </div>
      </section>

      {supplierError && !isModalOpen && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-[#D9826B]/30 bg-[#faedf0] px-4 py-3 text-sm font-semibold text-[#D9826B]"
        >
          {supplierError}
        </p>
      )}

      <section className="mt-4 overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs">
        <div className="border-b border-[#CFDDE0] px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#1F4E5A]">
                Supplier Directory
              </p>
              <h3 className="mt-1 text-lg font-black text-[#1B2B30]">
                Registered Suppliers
              </h3>
              <p className="text-xs font-semibold text-[#5B7077]">
                {filteredSuppliers.length} shown from {suppliers.length} records
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search supplier name, contact, or address..."
                className="h-10 min-w-0 rounded-lg border border-[#CFDDE0] bg-white px-3 text-sm font-semibold text-[#1B2B30] outline-none transition placeholder:text-[#5B7077]/70 focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20 sm:w-80"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-10 rounded-lg border border-[#CFDDE0] bg-white px-3 text-sm font-semibold text-[#1B2B30] outline-none transition focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20 sm:w-40"
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
            <thead className="border-b border-[#CFDDE0] bg-[#F4F8F8] text-[11px] font-bold uppercase tracking-wider text-[#5B7077]">
              <tr>
                <th className="px-4 py-3">Supplier Name</th>
                <th className="px-4 py-3">Contact Number</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#CFDDE0]/60">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-10 text-center font-bold text-[#5B7077]" colSpan={5}>
                    Loading suppliers...
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center font-bold text-[#5B7077]" colSpan={5}>
                    No suppliers match the current filters.
                  </td>
                </tr>
              ) : (
                paginatedSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="align-top transition hover:bg-[#F4F8F8]">
                    <td className="px-4 py-4">
                      <p className="max-w-xs whitespace-normal font-black text-[#1B2B30]">
                        {supplier.supplier_name}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-semibold text-[#5B7077]">
                      {supplier.contact_number || "Not provided"}
                    </td>
                    <td className="max-w-md px-4 py-4 font-medium text-[#5B7077]">
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
                          className="rounded-lg border border-[#CFDDE0] bg-white px-3 py-2 text-xs font-bold text-[#1B2B30] transition hover:bg-[#E5EFF1]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusToggle(supplier)}
                          disabled={statusChangingId === supplier.id}
                          className="rounded-lg border border-[#1F4E5A]/20 bg-[#EBF3F5] px-3 py-2 text-xs font-bold text-[#1F4E5A] transition hover:bg-[#1F4E5A] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
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
            className="w-full overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#CFDDE0] bg-[#EBF3F5] px-6 py-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#1F4E5A]">
                  Supplier Record
                </p>
                <h3 id="supplier-modal-title" className="mt-1 text-xl font-black text-[#1B2B30]">
                  {editingSupplier ? "Edit Supplier" : "Register Supplier"}
                </h3>
                <p className="mt-1 text-sm font-semibold text-[#5B7077]">
                  Record supplier details used for inventory batches.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#5B7077] transition hover:bg-white hover:text-[#1B2B30]"
                aria-label="Close supplier form"
              >
                x
              </button>
            </div>

            <div className="grid gap-4 bg-[#F4F8F8] px-6 py-5">
              {supplierError && (
                <p
                  role="alert"
                  className="rounded-lg border border-[#D9826B]/30 bg-[#faedf0] px-4 py-3 text-sm font-semibold text-[#D9826B]"
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
                <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-[#5B7077]">
                  Address
                  <textarea
                    name="address"
                    value={formValues.address}
                    onChange={handleFieldChange}
                    rows={3}
                    className="resize-none rounded-lg border border-[#CFDDE0] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[#1B2B30] outline-none transition placeholder:text-[#5B7077]/70 focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
                  />
                </label>
                <label className="grid content-start gap-2 text-xs font-black uppercase tracking-wide text-[#5B7077]">
                  Status
                  <select
                    name="status"
                    value={formValues.status}
                    onChange={handleFieldChange}
                    className="h-11 rounded-lg border border-[#CFDDE0] bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[#1B2B30] outline-none transition focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
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

            <div className="flex justify-end gap-2 border-t border-[#CFDDE0] bg-[#F9FBFB] px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg bg-[#E5EFF1] px-4 py-2 text-sm font-bold text-[#1B2B30] transition hover:bg-[#CFDDE0]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-2 text-sm font-bold text-white shadow-xs transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
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
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-[#5B7077]">
      {label}
      <input
        {...props}
        className="h-11 rounded-lg border border-[#CFDDE0] bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[#1B2B30] outline-none transition placeholder:text-[#5B7077]/70 focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
      />
    </label>
  );
}
