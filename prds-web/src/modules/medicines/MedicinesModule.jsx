import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";
import MedicineCatalogTable from "./components/MedicineCatalogTable";
import MedicineDetailsPanel from "./components/MedicineDetailsPanel";
import MedicineFormModal from "./components/MedicineFormModal";
import MedicineToolbar from "./components/MedicineToolbar";
import {
  emptyMedicineForm,
  filterMedicines,
  findDuplicateMedicines,
  formatDateTime,
  sortMedicines,
} from "./medicineUtils";

export default function MedicinesModule() {
  const { profile } = useAuth();
  const [medicines, setMedicines] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [medicineSort, setMedicineSort] = useState("ASC");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [medicineError, setMedicineError] = useState("");
  const [notice, setNotice] = useState("");
  const [rejectedDuplicate, setRejectedDuplicate] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [modalMode, setModalMode] = useState(null);
  const [modalMedicine, setModalMedicine] = useState(null);
  const [formValues, setFormValues] = useState(emptyMedicineForm);

  const today = useMemo(() => formatDateTime(new Date()), []);

  const filteredMedicines = useMemo(
    () => filterMedicines(medicines, searchTerm),
    [medicines, searchTerm]
  );

  const sortedMedicines = useMemo(
    () => sortMedicines(filteredMedicines, medicineSort),
    [filteredMedicines, medicineSort]
  );

  const selectedMedicine = useMemo(() => {
    return sortedMedicines.find((medicine) => medicine.id === selectedMedicineId) || null;
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
    setSelectedMedicineId((currentId) =>
      medicineRows.some((medicine) => medicine.id === currentId) ? currentId : ""
    );
    setIsLoading(false);
  };

  useEffect(() => {
    loadMedicines();
  }, []);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setNotice("");
    }, 15000);

    return () => window.clearTimeout(timerId);
  }, [notice]);

  const resetModalState = () => {
    setModalMedicine(null);
    setFormValues(emptyMedicineForm);
    setRejectedDuplicate(null);
    setFieldErrors({});
  };

  const openCreateModal = () => {
    resetModalState();
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
    setRejectedDuplicate(null);
    setFieldErrors({});
    setModalMode(mode);
  };

  const closeModal = () => {
    if (isSaving) {
      return;
    }

    setModalMode(null);
    resetModalState();
  };

  const handleViewExistingMedicine = (medicineId) => {
    setModalMode(null);
    resetModalState();
    setSelectedMedicineId(medicineId);
  };

  const handleClearSelection = () => {
    setSelectedMedicineId("");
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setMedicineError("");
    setRejectedDuplicate(null);
    setFormValues((currentValues) => ({ ...currentValues, [name]: value }));

    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleFieldBlur = (event) => {
    const { name, value } = event.target;
    const trimmed = (value || "").trim();

    if (name === "generic_name" && !trimmed) {
      setFieldErrors((prev) => ({ ...prev, generic_name: "Generic name is required." }));
    } else if (name === "brand_name" && !trimmed) {
      setFieldErrors((prev) => ({ ...prev, brand_name: "Brand name is required." }));
    } else if (name === "unit_of_measure" && !trimmed) {
      setFieldErrors((prev) => ({ ...prev, unit_of_measure: "Unit is required." }));
    } else if (name === "dosage" && !trimmed) {
      setFieldErrors((prev) => ({ ...prev, dosage: "Dosage is required." }));
    } else if (name === "unit_cost" && trimmed !== "" && Number(trimmed) < 0) {
      setFieldErrors((prev) => ({ ...prev, unit_cost: "Unit cost cannot be negative." }));
    }
  };

  const validateForm = () => {
    if (!formValues.generic_name.trim()) {
      return "Generic name is required.";
    }

    if (!formValues.brand_name.trim()) {
      return "Brand name is required.";
    }

    if (!formValues.unit_of_measure.trim()) {
      return "Unit is required.";
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

    const { exactMatches, nameMatches } = findDuplicateMedicines({
      excludeId: modalMedicine?.id,
      formValues,
      medicines,
    });

    if (exactMatches.length > 0) {
      const duplicate = exactMatches[0];
      const duplicateLabel = [
        duplicate.generic_name,
        duplicate.brand_name,
        duplicate.dosage,
        duplicate.unit_of_measure,
      ]
        .filter(Boolean)
        .join(" / ");

      setMedicineError(
        `This medicine is already registered - ${duplicateLabel}. View the existing record to edit it instead.`
      );
      setRejectedDuplicate(duplicate);
      return;
    }

    const sameGenericMatches = modalMode === "create" ? nameMatches : [];

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
      const isUniqueViolation =
        /duplicate key|medicines_unique_definition/i.test(error.message || "");
      if (isUniqueViolation) {
        const matching = nameMatches.find(
          (match) =>
            (match.dosage || "").trim().toLowerCase() ===
              (formValues.dosage || "").trim().toLowerCase() &&
            (match.unit_of_measure || "").trim().toLowerCase() ===
              (formValues.unit_of_measure || "").trim().toLowerCase()
        );
        const existingLabel = matching
          ? [matching.generic_name, matching.brand_name, matching.dosage, matching.unit_of_measure]
              .filter(Boolean)
              .join(" / ")
          : "an existing medicine";

        setMedicineError(
          `This medicine is already registered - ${existingLabel}. View the existing record to edit it instead.`
        );
        setRejectedDuplicate(matching || null);
      } else {
        setMedicineError(error.message);
      }
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    closeModal();
    await loadMedicines();

    if (sameGenericMatches.length > 0) {
      const existing = sameGenericMatches[0];
      const existingLabel = [
        existing.generic_name,
        existing.brand_name,
        existing.dosage,
        existing.unit_of_measure,
      ]
        .filter(Boolean)
        .join(" / ");
      const extraCount = sameGenericMatches.length - 1;
      setNotice(
        `Added ${payload.generic_name}. Note: a medicine with the same generic name already exists - ${existingLabel}${
          extraCount > 0 ? ` (+${extraCount} more)` : ""
        }.`
      );
    }

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

      {notice && (
        <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
          {notice}
        </p>
      )}

      <div className="mt-5 space-y-5">
        <MedicineToolbar
          medicineSort={medicineSort}
          onAdd={openCreateModal}
          onSearchChange={setSearchTerm}
          onSortChange={() =>
            setMedicineSort((currentSort) => (currentSort === "ASC" ? "DESC" : "ASC"))
          }
          searchTerm={searchTerm}
          shownCount={sortedMedicines.length}
          totalCount={medicines.length}
        />

        <div
          className={`grid gap-5 transition-[grid-template-columns] duration-500 ease-in-out ${
            selectedMedicine
              ? "xl:grid-cols-[minmax(0,1fr)_22rem]"
              : "xl:grid-cols-[minmax(0,1fr)]"
          }`}
        >
          <MedicineCatalogTable
            hasMedicines={medicines.length > 0}
            isLoading={isLoading}
            medicines={sortedMedicines}
            onAdd={openCreateModal}
            onClearSearch={() => setSearchTerm("")}
            onSelectMedicine={setSelectedMedicineId}
            selectedMedicineId={selectedMedicineId}
          />

          {selectedMedicine && (
            <MedicineDetailsPanel
              medicine={selectedMedicine}
              onBack={handleClearSelection}
              onView={() => openMedicineModal(selectedMedicine, "view")}
              onEdit={() => openMedicineModal(selectedMedicine, "edit")}
            />
          )}
        </div>
      </div>

      {modalMode && (
        <MedicineFormModal
          mode={modalMode}
          formValues={formValues}
          fieldErrors={fieldErrors}
          error={medicineError}
          rejectedMedicine={rejectedDuplicate}
          isSaving={isSaving}
          onClose={closeModal}
          onChange={handleFieldChange}
          onBlur={handleFieldBlur}
          onSubmit={handleSaveMedicine}
          onEdit={() => setModalMode("edit")}
          onViewExisting={handleViewExistingMedicine}
        />
      )}
    </AdminShell>
  );
}
