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
  }).format(Number(value));
};

export default function MedicinesModule() {
  const { profile } = useAuth();
  const [medicines, setMedicines] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [medicineError, setMedicineError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState(null);
  const [formValues, setFormValues] = useState(emptyMedicineForm);

  const today = useMemo(() => formatDateTime(new Date()), []);

  const unitOptions = useMemo(() => {
    return Array.from(
      new Set(medicines.map((medicine) => medicine.unit_of_measure).filter(Boolean))
    ).sort();
  }, [medicines]);

  const filteredMedicines = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return medicines.filter((medicine) => {
      const matchesSearch =
        !normalizedSearch ||
        medicine.generic_name.toLowerCase().includes(normalizedSearch) ||
        (medicine.brand_name || "").toLowerCase().includes(normalizedSearch) ||
        medicine.dosage.toLowerCase().includes(normalizedSearch);
      const matchesUnit =
        unitFilter === "ALL" || medicine.unit_of_measure === unitFilter;

      return matchesSearch && matchesUnit;
    });
  }, [medicines, searchTerm, unitFilter]);

  const summary = useMemo(() => {
    return medicines.reduce(
      (counts, medicine) => {
        counts.total += 1;
        counts.branded += medicine.brand_name ? 1 : 0;
        counts.withCost += medicine.unit_cost !== null && medicine.unit_cost !== undefined ? 1 : 0;
        counts.units.add(medicine.unit_of_measure);
        return counts;
      },
      { total: 0, branded: 0, withCost: 0, units: new Set() }
    );
  }, [medicines]);

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

    setMedicines(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadMedicines();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const openCreateModal = () => {
    setEditingMedicine(null);
    setFormValues(emptyMedicineForm);
    setMedicineError("");
    setIsModalOpen(true);
  };

  const openEditModal = (medicine) => {
    setEditingMedicine(medicine);
    setFormValues({
      generic_name: medicine.generic_name,
      brand_name: medicine.brand_name || "",
      unit_of_measure: medicine.unit_of_measure,
      dosage: medicine.dosage,
      unit_cost: medicine.unit_cost ?? "",
    });
    setMedicineError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) {
      return;
    }

    setIsModalOpen(false);
    setEditingMedicine(null);
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

    const request = editingMedicine
      ? supabase.from("medicines").update(payload).eq("id", editingMedicine.id)
      : supabase.from("medicines").insert(payload);

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
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
            Core Module
          </p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
            Medicines
          </h2>
          <p className="text-sm font-medium text-slate-500">
            Maintain the master medicine list used by inventory and requests.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-800"
        >
          Add Medicine
        </button>
      </div>

      {medicineError && !isModalOpen && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {medicineError}
        </p>
      )}

      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="Total Medicines" value={summary.total} tone="emerald" />
        <SummaryCard label="With Brand Name" value={summary.branded} tone="blue" />
        <SummaryCard label="With Unit Cost" value={summary.withCost} tone="amber" />
        <SummaryCard label="Unit Types" value={summary.units.size} tone="slate" />
      </div>

      <section className="mt-4 rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
          <div>
            <h3 className="text-base font-black text-slate-950">Medicine Catalog</h3>
            <p className="text-xs font-semibold text-slate-500">
              {filteredMedicines.length} shown from {medicines.length} records
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search generic, brand, dosage"
              className="h-10 w-72 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <select
              value={unitFilter}
              onChange={(event) => setUnitFilter(event.target.value)}
              className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="ALL">All units</option>
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3">Dosage</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Unit Cost</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-10 text-center font-bold text-slate-500" colSpan="6">
                    Loading medicines...
                  </td>
                </tr>
              ) : filteredMedicines.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center font-bold text-slate-500" colSpan="6">
                    No medicines match the current filters.
                  </td>
                </tr>
              ) : (
                filteredMedicines.map((medicine) => (
                  <tr key={medicine.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-4">
                      <p className="font-black text-slate-950">{medicine.generic_name}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        ID: {medicine.id.slice(0, 8)}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-600">
                      {medicine.brand_name || "Generic"}
                    </td>
                    <td className="px-4 py-4 font-bold text-slate-700">
                      {medicine.dosage}
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-600">
                      {medicine.unit_of_measure}
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-600">
                      {formatCurrency(medicine.unit_cost)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openEditModal(medicine)}
                        className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
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
          <form onSubmit={handleSaveMedicine} className="w-full max-w-2xl rounded-md bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <h3 className="text-xl font-black text-slate-950">
                {editingMedicine ? "Edit Medicine" : "Add Medicine"}
              </h3>
              <p className="text-sm font-semibold text-slate-500">
                Generic name, dosage, and unit form the medicine definition.
              </p>
            </div>

            <div className="grid gap-4 px-6 py-5">
              {medicineError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {medicineError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Generic Name" name="generic_name" value={formValues.generic_name} onChange={handleFieldChange} />
                <Field label="Brand Name" name="brand_name" value={formValues.brand_name} onChange={handleFieldChange} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Dosage" name="dosage" value={formValues.dosage} onChange={handleFieldChange} />
                <Field label="Unit of Measure" name="unit_of_measure" value={formValues.unit_of_measure} onChange={handleFieldChange} />
                <Field label="Unit Cost" name="unit_cost" type="number" step="0.01" value={formValues.unit_cost} onChange={handleFieldChange} />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button type="button" onClick={closeModal} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300">
                {isSaving ? "Saving..." : "Save Medicine"}
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
