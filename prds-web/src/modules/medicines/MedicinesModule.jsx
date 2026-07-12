import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";

const emptyMedicineForm = {
  generic_name: "",
  brand_name: "",
  unit_of_measure: "",
  dosage: "",
  unit_cost: "",
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

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value));
};

const normalizeMedicineText = (medicine) => {
  return [
    medicine.generic_name,
    medicine.brand_name,
    medicine.dosage,
    medicine.unit_of_measure,
    medicine.unit_cost,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

export default function MedicinesModule() {
  const { profile } = useAuth();
  const [medicines, setMedicines] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [dosageFilter, setDosageFilter] = useState("ALL");
  const [medicineSort, setMedicineSort] = useState("ASC");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [medicineError, setMedicineError] = useState("");
  const [modalMode, setModalMode] = useState(null);
  const [modalMedicine, setModalMedicine] = useState(null);
  const [formValues, setFormValues] = useState(emptyMedicineForm);

  const today = useMemo(() => formatDateTime(new Date()), []);

  const unitOptions = useMemo(() => {
    return Array.from(
      new Set(medicines.map((medicine) => medicine.unit_of_measure).filter(Boolean))
    ).sort((first, second) => first.localeCompare(second));
  }, [medicines]);

  const dosageOptions = useMemo(() => {
    return Array.from(
      new Set(medicines.map((medicine) => medicine.dosage).filter(Boolean))
    ).sort((first, second) => first.localeCompare(second));
  }, [medicines]);

  const filteredMedicines = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return medicines.filter((medicine) => {
      const matchesSearch =
        !normalizedSearch || normalizeMedicineText(medicine).includes(normalizedSearch);
      const matchesUnit =
        unitFilter === "ALL" || medicine.unit_of_measure === unitFilter;
      const matchesDosage =
        dosageFilter === "ALL" || medicine.dosage === dosageFilter;

      return matchesSearch && matchesUnit && matchesDosage;
    });
  }, [dosageFilter, medicines, searchTerm, unitFilter]);

  const sortedMedicines = useMemo(() => {
    return [...filteredMedicines].sort((first, second) => {
      const firstName = first.generic_name || "";
      const secondName = second.generic_name || "";
      const comparison = firstName.localeCompare(secondName, undefined, {
        sensitivity: "base",
      });

      return medicineSort === "ASC" ? comparison : comparison * -1;
    });
  }, [filteredMedicines, medicineSort]);

  const loadMedicines = async () => {
    setIsLoading(true);
    setMedicineError("");

    const { data, error } = await supabase
      .from("medicines")
      .select("id, generic_name, brand_name, unit_of_measure, dosage, unit_cost")
      .order("generic_name", { ascending: true });

    if (error) {
      setMedicineError(error.message);
      setIsLoading(false);
      return;
    }

    const medicineRows = data || [];
    setMedicines(medicineRows);
    setIsLoading(false);
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadMedicines();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const openCreateModal = () => {
    setModalMedicine(null);
    setFormValues(emptyMedicineForm);
    setMedicineError("");
    setModalMode("create");
  };

  const openMedicineModal = (medicine, mode) => {
    setModalMedicine(medicine);
    setFormValues({
      generic_name: medicine.generic_name || "",
      brand_name: medicine.brand_name || "",
      unit_of_measure: medicine.unit_of_measure || "",
      dosage: medicine.dosage || "",
      unit_cost: medicine.unit_cost ?? "",
    });
    setMedicineError("");
    setModalMode(mode);
  };

  const closeModal = () => {
    if (isSaving) {
      return;
    }

    setModalMode(null);
    setModalMedicine(null);
    setFormValues(emptyMedicineForm);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((currentValues) => ({ ...currentValues, [name]: value }));
  };

  const validateForm = () => {
    if (!formValues.generic_name.trim()) {
      return "Generic name is required.";
    }

    if (!formValues.unit_of_measure.trim()) {
      return "Unit of measure is required.";
    }

    if (!formValues.dosage.trim()) {
      return "Dosage is required.";
    }

    if (formValues.unit_cost !== "" && Number(formValues.unit_cost) < 0) {
      return "Unit cost cannot be negative.";
    }

    return "";
  };

  const handleSaveMedicine = async (event) => {
    event.preventDefault();

    if (modalMode === "view") {
      closeModal();
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setMedicineError(validationError);
      return;
    }

    setIsSaving(true);
    setMedicineError("");

    const payload = {
      generic_name: formValues.generic_name.trim(),
      brand_name: formValues.brand_name.trim() || null,
      unit_of_measure: formValues.unit_of_measure.trim(),
      dosage: formValues.dosage.trim(),
      unit_cost: formValues.unit_cost === "" ? null : Number(formValues.unit_cost),
    };

    const request =
      modalMode === "edit" && modalMedicine
        ? supabase.from("medicines").update(payload).eq("id", modalMedicine.id)
        : supabase.from("medicines").insert(payload).select("id").single();

    const { error } = await request;

    if (error) {
      setMedicineError(error.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    closeModal();
    await loadMedicines();
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {medicineError && !modalMode && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {medicineError}
        </p>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[1fr_180px_180px_180px]">
          <label className="grid gap-1">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-neutral-500">
              Medicine
            </span>
            <span className="relative block">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search medicine name, generic, dosage, or unit..."
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </span>
          </label>
          <FilterSelect
            label="Unit"
            value={unitFilter}
            onChange={(event) => setUnitFilter(event.target.value)}
          >
            <option value="ALL">All Units</option>
            {unitOptions.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Dosage"
            value={dosageFilter}
            onChange={(event) => setDosageFilter(event.target.value)}
          >
            <option value="ALL">All Dosages</option>
            {dosageOptions.map((dosage) => (
              <option key={dosage} value={dosage}>
                {dosage}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Sort"
            value={medicineSort}
            onChange={(event) => setMedicineSort(event.target.value)}
          >
            <option value="ASC">Medicine: A-Z</option>
            <option value="DESC">Medicine: Z-A</option>
          </FilterSelect>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <h2 className="text-base font-black text-black">
            Medicine Catalog{" "}
            <span className="font-semibold text-neutral-400">
              ({sortedMedicines.length} items)
            </span>
          </h2>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
          >
            <PlusIcon />
            Add Medicine
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-100 bg-white text-left text-[11px] font-black uppercase tracking-wide text-neutral-500">
                <th className="px-5 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      setMedicineSort((currentSort) =>
                        currentSort === "ASC" ? "DESC" : "ASC"
                      )
                    }
                    className="inline-flex items-center gap-1.5 font-black uppercase tracking-wide text-neutral-600 hover:text-emerald-700"
                  >
                    Medicine
                    <span className="text-[10px] text-emerald-600">
                      {medicineSort === "ASC" ? "A-Z" : "Z-A"}
                    </span>
                  </button>
                </th>
                <th className="px-5 py-3">Brand</th>
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3">Dosage</th>
                <th className="px-5 py-3">Unit Cost</th>
                <th className="px-5 py-3">Definition</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr>
                  <td
                    colSpan="7"
                    className="px-5 py-12 text-center text-sm font-bold text-neutral-500"
                  >
                    Loading medicines...
                  </td>
                </tr>
              ) : sortedMedicines.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
                    className="px-5 py-12 text-center text-sm font-bold text-neutral-500"
                  >
                    No medicines match the current filters.
                  </td>
                </tr>
              ) : (
                sortedMedicines.map((medicine) => (
                  <tr key={medicine.id} className="transition hover:bg-neutral-50">
                    <td className="px-5 py-4">
                      <p className="text-sm font-black text-black">
                        {medicine.generic_name}
                      </p>
                      <p className="text-xs font-medium text-neutral-400">
                        {medicine.generic_name} medicine
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-neutral-700">
                      {medicine.brand_name || "Generic"}
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
                        {medicine.unit_of_measure}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-600">
                        {medicine.dosage}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-black text-black">
                      {formatCurrency(medicine.unit_cost)}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-neutral-700">
                      {medicine.generic_name} / {medicine.dosage}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2 text-neutral-500">
                        <button
                          type="button"
                          onClick={() => openMedicineModal(medicine, "view")}
                          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-neutral-100 hover:text-emerald-700"
                          aria-label={`View ${medicine.generic_name}`}
                        >
                          <EyeIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => openMedicineModal(medicine, "edit")}
                          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-neutral-100 hover:text-emerald-700"
                          aria-label={`Edit ${medicine.generic_name}`}
                        >
                          <PencilIcon />
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

      {modalMode && (
        <MedicineModal
          mode={modalMode}
          formValues={formValues}
          error={medicineError}
          isSaving={isSaving}
          onClose={closeModal}
          onChange={handleFieldChange}
          onSubmit={handleSaveMedicine}
          onEdit={() => setModalMode("edit")}
        />
      )}
    </AdminShell>
  );
}

function MedicineModal({
  mode,
  formValues,
  error,
  isSaving,
  onClose,
  onChange,
  onSubmit,
  onEdit,
}) {
  const isReadOnly = mode === "view";
  const title =
    mode === "create" ? "Add New Medicine" : mode === "edit" ? "Edit Medicine" : "Medicine Details";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <form
        onSubmit={onSubmit}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-neutral-100 px-6 py-5">
          <div>
            <h3 className="text-xl font-black text-black">{title}</h3>
            <p className="text-sm font-medium text-neutral-500">
              Based on the medicines table schema.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close medicine modal"
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
              label="Generic Name"
              name="generic_name"
              value={formValues.generic_name}
              onChange={onChange}
              disabled={isReadOnly}
              required
            />
            <Field
              label="Brand Name"
              name="brand_name"
              value={formValues.brand_name}
              onChange={onChange}
              disabled={isReadOnly}
              placeholder="Optional"
            />
            <Field
              label="Unit of Measure"
              name="unit_of_measure"
              value={formValues.unit_of_measure}
              onChange={onChange}
              disabled={isReadOnly}
              required
            />
            <Field
              label="Dosage"
              name="dosage"
              value={formValues.dosage}
              onChange={onChange}
              disabled={isReadOnly}
              required
            />
            <Field
              label="Unit Cost"
              name="unit_cost"
              type="number"
              min="0"
              step="0.01"
              value={formValues.unit_cost}
              onChange={onChange}
              disabled={isReadOnly}
              placeholder="Optional"
            />
          </div>

          <div className="mt-5 rounded-lg border border-neutral-200 bg-[#fbfaf8] p-4">
            <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
              Unique Definition
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              The database prevents duplicate medicines with the same generic
              name, dosage, and unit of measure.
            </p>
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
              Edit Medicine
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-6 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              <PlusIcon />
              {isSaving ? "Saving..." : mode === "create" ? "Add Medicine" : "Save Changes"}
            </button>
          )}
        </div>
      </form>
    </div>
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

function FilterSelect({ label, children, ...props }) {
  return (
    <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
      {label}
      <select
        {...props}
        className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs font-semibold normal-case tracking-normal text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      >
        {children}
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
