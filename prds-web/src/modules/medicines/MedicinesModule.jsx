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
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [medicineSort, setMedicineSort] = useState("ASC");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [medicineError, setMedicineError] = useState("");
  const [modalMode, setModalMode] = useState(null);
  const [modalMedicine, setModalMedicine] = useState(null);
  const [formValues, setFormValues] = useState(emptyMedicineForm);

  const today = useMemo(() => formatDateTime(new Date()), []);

  const filteredMedicines = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return medicines.filter((medicine) => {
      return !normalizedSearch || normalizeMedicineText(medicine).includes(normalizedSearch);
    });
  }, [medicines, searchTerm]);

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

  const selectedMedicine = useMemo(() => {
    return (
      sortedMedicines.find((medicine) => medicine.id === selectedMedicineId) ||
      sortedMedicines[0] ||
      null
    );
  }, [selectedMedicineId, sortedMedicines]);

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
    setSelectedMedicineId((currentId) => currentId || medicineRows[0]?.id || "");
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

    const { data, error } = await request;

    if (error) {
      setMedicineError(error.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    closeModal();
    await loadMedicines();

    if (data?.id) {
      setSelectedMedicineId(data.id);
    } else if (modalMedicine?.id) {
      setSelectedMedicineId(modalMedicine.id);
    }
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {medicineError && !modalMode && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {medicineError}
        </p>
      )}

      <section className="max-w-3xl rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
        <label className="grid gap-1">
          <span className="text-[10px] font-black uppercase tracking-wide text-neutral-500">
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
              className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </span>
        </label>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_344px]">
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
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
            <table className="min-w-160 w-full border-collapse">
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
                      <SortArrowIcon direction={medicineSort} />
                    </button>
                  </th>
                  <th className="px-5 py-3">Brand</th>
                  <th className="px-5 py-3">Dosage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan="3"
                      className="px-5 py-12 text-center text-sm font-bold text-neutral-500"
                    >
                      Loading medicines...
                    </td>
                  </tr>
                ) : sortedMedicines.length === 0 ? (
                  <tr>
                    <td
                      colSpan="3"
                      className="px-5 py-12 text-center text-sm font-bold text-neutral-500"
                    >
                      No medicines match the current filters.
                    </td>
                  </tr>
                ) : (
                  sortedMedicines.map((medicine) => {
                    const isSelected = selectedMedicine?.id === medicine.id;

                    return (
                      <tr
                        key={medicine.id}
                        onClick={() => setSelectedMedicineId(medicine.id)}
                        className={`cursor-pointer border-l-2 transition ${
                          isSelected
                            ? "border-l-emerald-500 bg-emerald-50"
                            : "border-l-transparent hover:bg-neutral-50"
                        }`}
                      >
                        <td className="px-5 py-4">
                          <p className="text-sm font-black text-black">
                            {medicine.generic_name}
                          </p>
                          <p className="text-xs font-medium text-neutral-400">
                            {medicine.unit_of_measure || "No unit set"}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-neutral-700">
                          {medicine.brand_name || "Generic"}
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-600">
                            {medicine.dosage}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <MedicineDetailsPanel
          medicine={selectedMedicine}
          onView={() => selectedMedicine && openMedicineModal(selectedMedicine, "view")}
          onEdit={() => selectedMedicine && openMedicineModal(selectedMedicine, "edit")}
        />
      </div>

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

function MedicineDetailsPanel({ medicine, onView, onEdit }) {
  if (!medicine) {
    return (
      <aside className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="py-16 text-center text-sm font-bold text-neutral-500">
          Select a medicine to view details.
        </p>
      </aside>
    );
  }

  return (
    <aside className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-black text-black">{medicine.generic_name}</h2>
          <p className="text-sm font-medium text-neutral-500">
            {medicine.brand_name || "Generic medicine"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
          {medicine.unit_of_measure}
        </span>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700">
          {medicine.dosage}
        </span>
      </div>

      <div className="mt-6 space-y-4">
        <DetailRow label="Medicine" value={medicine.generic_name} />
        <DetailRow label="Brand" value={medicine.brand_name || "Generic"} />
        <DetailRow label="Unit of Measure" value={medicine.unit_of_measure} />
        <DetailRow label="Dosage" value={medicine.dosage} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-neutral-50 p-4">
          <p className="text-xs font-bold text-neutral-500">Unit Cost</p>
          <p className="mt-2 text-xl font-black text-black">
            {formatCurrency(medicine.unit_cost)}
          </p>
        </div>
        <div className="rounded-lg bg-neutral-50 p-4">
          <p className="text-xs font-bold text-neutral-500">Definition</p>
          <p className="mt-2 text-sm font-black text-black">
            {medicine.generic_name} / {medicine.dosage}
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onView}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-200 text-sm font-bold text-neutral-700 hover:bg-neutral-50"
        >
          <EyeIcon />
          View
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-black text-white hover:bg-emerald-700"
        >
          <PencilIcon />
          Edit
        </button>
      </div>
    </aside>
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

function DetailRow({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-black">{value || "Not set"}</p>
    </div>
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

function SortArrowIcon({ direction }) {
  return (
    <svg
      className="h-3.5 w-3.5 text-emerald-600"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {direction === "ASC" ? <path d="m7 14 5-5 5 5" /> : <path d="m7 10 5 5 5-5" />}
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
