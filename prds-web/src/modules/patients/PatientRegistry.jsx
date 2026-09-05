import { useEffect, useMemo, useState } from "react";

import {
  archivePatient,
  createPatient,
  deleteArchivedPatient,
  restorePatient,
  updatePatient,
} from "./PatientsService";
import {
  ExportIcon,
  Input,
  PatientDetailsPanel,
  PatientFormModal,
  PatientConfirmModal,
  PatientTable,
  PlusIcon,
  SearchIcon,
  Select,
  SortToggleButton,
} from "./patientComponents";
import {
  buildPatientsCsv,
  filterPatientsByArchiveMode,
  findDuplicatePatients,
  formatPatientName,
  matchesPatientFilters,
  PATIENT_ARCHIVE_MODES,
  sortPatients,
  validatePatientForm,
} from "./patientUtils";

const emptyPatientForm = {
  first_name: "",
  middle_name: "",
  last_name: "",
  suffix: "",
  gender: "",
  date_of_birth: "",
  contact_number: "",
  address: "",
  facility_id: "",
};

export default function PatientRegistry({
  canArchive,
  canDelete,
  facilities,
  isCho,
  loadPatients,
  patients,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("");
  const [archiveMode, setArchiveMode] = useState(PATIENT_ARCHIVE_MODES.active);
  const [sortMode, setSortMode] = useState("asc");
  const [selectedId, setSelectedId] = useState("");
  const [modalMode, setModalMode] = useState(null);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [closingPatient, setClosingPatient] = useState(null);
  const [formValues, setFormValues] = useState(emptyPatientForm);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [notice, setNotice] = useState("");

  const visiblePatients = useMemo(() => {
    return filterPatientsByArchiveMode({
      archiveMode: isCho ? archiveMode : PATIENT_ARCHIVE_MODES.active,
      patients,
    });
  }, [archiveMode, isCho, patients]);

  const filteredPatients = useMemo(() => {
    return visiblePatients.filter((patient) =>
      matchesPatientFilters({
        facilityId: isCho ? facilityFilter || null : null,
        patient,
        query: searchTerm,
      })
    );
  }, [facilityFilter, isCho, searchTerm, visiblePatients]);

  const sortedPatients = useMemo(
    () => sortPatients({ patients: filteredPatients, sortMode }),
    [filteredPatients, sortMode]
  );

  const selectedPatient = useMemo(() => {
    return (
      sortedPatients.find((patient) => patient.id === selectedId) || null
    );
  }, [selectedId, sortedPatients]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timerId = window.setTimeout(() => setNotice(""), 6000);

    return () => window.clearTimeout(timerId);
  }, [notice]);

  const openCreateModal = () => {
    setArchiveMode(PATIENT_ARCHIVE_MODES.active);
    setFormValues({ ...emptyPatientForm, facility_id: isCho ? "" : facilities[0]?.id || "" });
    setError("");
    setNotice("");
    setModalMode("create");
  };

  const openEditModal = (patient) => {
    setFormValues({
      first_name: patient.first_name || "",
      middle_name: patient.middle_name || "",
      last_name: patient.last_name || "",
      suffix: patient.suffix || "",
      gender: patient.gender || "",
      date_of_birth: patient.date_of_birth || "",
      contact_number: patient.contact_number || "",
      address: patient.address || "",
      facility_id: patient.facility_id || "",
    });
    setError("");
    setModalMode("edit");
  };

  const closeModal = (force = false) => {
    if ((isSaving && !force) || isModalClosing) {
      return;
    }

    setIsModalClosing(true);
    window.setTimeout(() => {
      setModalMode(null);
      setIsModalClosing(false);
      setFormValues(emptyPatientForm);
      setError("");
    }, 180);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((currentValues) => ({ ...currentValues, [name]: value }));
  };

  const handleRowSelect = (patientId) => {
    setClosingPatient(null);
    setSelectedId(patientId);
  };

  const handleClearSelection = () => {
    if (selectedPatient) {
      setClosingPatient(selectedPatient);
    }

    setSelectedId("");
    window.setTimeout(() => setClosingPatient(null), 500);
  };

  const toggleSort = () => {
    setSortMode((current) => (current === "asc" ? "desc" : "asc"));
  };

  const toggleArchiveMode = () => {
    setArchiveMode((currentMode) =>
      currentMode === PATIENT_ARCHIVE_MODES.archived
        ? PATIENT_ARCHIVE_MODES.active
        : PATIENT_ARCHIVE_MODES.archived
    );
    handleClearSelection();
  };

  const handleSavePatient = async (event) => {
    event.preventDefault();

    const validationError = validatePatientForm(formValues);
    if (validationError) {
      setError(validationError);
      return;
    }

    const duplicates = findDuplicatePatients({
      excludeId: null,
      formValues,
      patients,
    });

    if (modalMode === "create" && duplicates.exactMatches.length > 0) {
      const existing = duplicates.exactMatches[0];
      setError(
        `Patient already registered — ${formatPatientName(existing)} (${existing.patient_code || "no code"}). Their record already exists in the system.`
      );
      setNotice("");
      return;
    }

    const payload = {
      first_name: formValues.first_name.trim(),
      middle_name: formValues.middle_name?.trim() || null,
      last_name: formValues.last_name.trim(),
      suffix: formValues.suffix || null,
      gender: formValues.gender,
      date_of_birth: formValues.date_of_birth,
      contact_number: formValues.contact_number?.trim() || null,
      address: formValues.address?.trim() || null,
      facility_id: formValues.facility_id,
    };

    setIsSaving(true);
    setError("");

    try {
      let savedId = "";

      if (modalMode === "edit" && selectedPatient) {
        await updatePatient(selectedPatient.id, payload);
        savedId = selectedPatient.id;
        setNotice("Patient record updated.");
      } else {
        const created = await createPatient(payload);
        savedId = created?.id || "";
        setNotice("Patient registered successfully.");
      }

      closeModal(true);
      handleClearSelection();
      await loadPatients();
      if (savedId) {
        setSelectedId(savedId);
      }
    } catch (errorMessage) {
      setError(errorMessage instanceof Error ? errorMessage.message : String(errorMessage));
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchivePatient = async () => {
    if (!selectedPatient || !canArchive) {
      return;
    }

    setArchiveReason("");
    setError("");
    setConfirmAction({ patient: selectedPatient, type: "archive" });
  };

  const handleRestorePatient = async () => {
    if (!selectedPatient || !canArchive) {
      return;
    }

    setError("");
    setConfirmAction({ patient: selectedPatient, type: "restore" });
  };

  const handleDeletePatient = async () => {
    if (!selectedPatient || !canDelete || archiveMode !== PATIENT_ARCHIVE_MODES.archived) {
      return;
    }

    setError("");
    setConfirmAction({ patient: selectedPatient, type: "delete" });
  };

  const closeConfirmModal = (force = false) => {
    if (isConfirming && !force) {
      return;
    }

    setConfirmAction(null);
    setArchiveReason("");
    setError("");
  };

  const confirmPatientAction = async () => {
    if (!confirmAction?.patient) {
      return;
    }

    setIsConfirming(true);
    setError("");

    try {
      if (confirmAction.type === "archive") {
        await archivePatient(confirmAction.patient.id, { reason: archiveReason });
        setNotice("Patient archived.");
      }

      if (confirmAction.type === "restore") {
        await restorePatient(confirmAction.patient.id);
        setNotice("Patient restored.");
      }

      if (confirmAction.type === "delete") {
        await deleteArchivedPatient(confirmAction.patient.id);
        setNotice("Patient permanently deleted.");
      }

      closeConfirmModal(true);
      handleClearSelection();
      await loadPatients();
    } catch (errorMessage) {
      setError(errorMessage instanceof Error ? errorMessage.message : String(errorMessage));
    } finally {
      setIsConfirming(false);
    }
  };

  const handleExportCsv = () => {
    const csv = buildPatientsCsv({ archiveMode, patients: sortedPatients });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prds-patients-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasSelection = Boolean(selectedPatient);
  const panelPatient = selectedPatient || closingPatient;
  const panelIsClosing = Boolean(closingPatient) && !selectedPatient;

  return (
    <div>
      {notice && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {notice}
        </p>
      )}

      {error && !modalMode && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <div
        className={`grid gap-5 transition-[grid-template-columns] duration-500 ease-in-out ${
          hasSelection
            ? "lg:grid-cols-[minmax(0,1fr)_380px]"
            : "lg:grid-cols-[minmax(0,1fr)]"
        }`}
      >
        <section className="min-w-0 overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-[#0d1117]">Patient Logbook</h2>
              <p className="mt-0.5 text-xs text-[#5f6673]">
                Showing {sortedPatients.length} of {visiblePatients.length} {archiveMode} patients
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isCho && (
                <button
                  type="button"
                  onClick={toggleArchiveMode}
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-xs font-bold shadow-sm transition ${
                    archiveMode === PATIENT_ARCHIVE_MODES.archived
                      ? "border-black bg-black text-white"
                      : "border-[#d8dadc] bg-white text-[#0d1117] hover:bg-[#eff4ff]"
                  }`}
                  aria-pressed={archiveMode === PATIENT_ARCHIVE_MODES.archived}
                >
                  Archive
                </button>
              )}
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-[#0d1117] shadow-sm transition hover:bg-[#eff4ff]"
              >
                <ExportIcon />
                Export
              </button>
              {archiveMode === PATIENT_ARCHIVE_MODES.active && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117]"
                >
                  <PlusIcon />
                  Register Patient
                </button>
              )}
            </div>
          </div>

          <div
            className={`grid items-center gap-3 border-b border-[#e5e7eb] px-5 py-3 ${
              isCho ? "lg:grid-cols-[1fr_200px_auto]" : "lg:grid-cols-[1fr_auto]"
            }`}
          >
            <label className="relative min-w-0">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a93a3]">
                <SearchIcon />
              </span>
              <Input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search name, code, address..."
                className="pl-9"
              />
            </label>
            {isCho && (
              <Select
                value={facilityFilter}
                onChange={(event) => setFacilityFilter(event.target.value)}
                className="h-9 py-0 text-xs font-bold"
              >
                <option value="">All facilities</option>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.facility_name}
                  </option>
                ))}
              </Select>
            )}
            <SortToggleButton onClick={toggleSort} sortMode={sortMode} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="bg-[#f8f9ff] text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                <tr>
                  <th className="px-4 py-3">Patient Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Gender</th>
                  <th className="hidden px-4 py-3 md:table-cell">Age</th>
                  {isCho && <th className="hidden px-4 py-3 lg:table-cell">Facility</th>}
                </tr>
              </thead>
              <PatientTable
                archiveMode={archiveMode}
                isCho={isCho}
                isLoading={false}
                onSelect={handleRowSelect}
                patients={sortedPatients}
                selectedId={selectedId}
              />
            </table>
          </div>
        </section>

        <aside
          className={`min-w-0 overflow-hidden transition-all duration-500 ease-in-out ${
            hasSelection
              ? "max-h-96 opacity-100 lg:max-h-none"
              : "pointer-events-none opacity-0 lg:max-h-[600px]"
          }`}
        >
          {panelPatient && (
            <div
              key={panelPatient.id}
              className={`h-full ${
                panelIsClosing ? "opacity-0 transition-opacity duration-500" : "prds-fade-in"
              }`}
            >
              <PatientDetailsPanel
                archiveMode={archiveMode}
                canArchive={canArchive}
                canDelete={canDelete}
                onArchive={handleArchivePatient}
                onBack={handleClearSelection}
                onDelete={handleDeletePatient}
                onEdit={() => openEditModal(panelPatient)}
                onRestore={handleRestorePatient}
                patient={panelPatient}
              />
            </div>
          )}
        </aside>
      </div>

      {modalMode && (
        <PatientFormModal
          canChooseFacility={isCho}
          error={error}
          facilities={facilities}
          formValues={formValues}
          isClosing={isModalClosing}
          isSaving={isSaving}
          mode={modalMode}
          onClose={closeModal}
          onChange={handleFieldChange}
          onSubmit={handleSavePatient}
        />
      )}

      {confirmAction && (
        <PatientConfirmModal
          actionType={confirmAction.type}
          archiveReason={archiveReason}
          error={error}
          isSaving={isConfirming}
          onCancel={closeConfirmModal}
          onConfirm={confirmPatientAction}
          onReasonChange={setArchiveReason}
          patientName={formatPatientName(confirmAction.patient)}
        />
      )}
    </div>
  );
}
