import { useEffect, useMemo, useState } from "react";

import {
  archivePatient,
  createPatient,
  deleteArchivedPatient,
  restorePatient,
  updatePatient,
} from "@backend/services/patientsService";
import { useAuth } from "../../context/useAuth";
import PaginationControls from "../../components/PaginationControls";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import {
  ExportIcon,
  Input,
  PatientFormModal,
  PatientConfirmModal,
  PatientTable,
  PatientViewModal,
  PlusIcon,
  RefreshIcon,
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
  normalizePatientContactNumber,
  PATIENT_ARCHIVE_MODES,
  sanitizePatientName,
  sortPatients,
  validatePatientForm,
} from "@shared/utils/patientUtils";
import { exportPatientsExcel } from "@shared/utils/patientExportUtils";
import { downloadExportFile } from "../../services/downloadManager";

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
  currentUser,
  defaultDispensingFacilityId = "",
  dispensingFacilities = [],
  facilities,
  isCho,
  loadPatients,
  patients,
  profile: propProfile,
}) {
  const { profile: authProfile } = useAuth() || {};
  const activeProfile = propProfile || currentUser || authProfile;
  const [searchTerm, setSearchTerm] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("");
  const [archiveMode, setArchiveMode] = useState(PATIENT_ARCHIVE_MODES.active);
  const [sortMode, setSortMode] = useState("asc");
  const [selectedId, setSelectedId] = useState("");
  const [modalMode, setModalMode] = useState(null);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [formValues, setFormValues] = useState(emptyPatientForm);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
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
  const {
    currentPage,
    paginatedRows: paginatedPatients,
    pageSize,
    setCurrentPage,
    totalCount,
    totalPages,
  } = usePaginatedRows(sortedPatients);

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
    setSelectedId(patientId);
  };

  const handleClearSelection = () => {
    setSelectedId("");
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

    const resolvedFacilityId =
      formValues.facility_id ||
      (!isCho ? facilities[0]?.id || defaultDispensingFacilityId : "");

    const valuesToValidate = {
      ...formValues,
      facility_id: resolvedFacilityId,
    };

    const validationError = validatePatientForm(valuesToValidate);
    if (validationError) {
      setError(validationError);
      return;
    }

    const duplicates = findDuplicatePatients({
      excludeId: modalMode === "edit" ? selectedPatient?.id : null,
      formValues: valuesToValidate,
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
      first_name: sanitizePatientName(valuesToValidate.first_name),
      middle_name: valuesToValidate.middle_name?.trim() ? sanitizePatientName(valuesToValidate.middle_name) : null,
      last_name: sanitizePatientName(valuesToValidate.last_name),
      suffix: valuesToValidate.suffix || null,
      gender: valuesToValidate.gender,
      date_of_birth: valuesToValidate.date_of_birth,
      contact_number: normalizePatientContactNumber(valuesToValidate.contact_number) || null,
      address: valuesToValidate.address?.trim() || null,
      facility_id: valuesToValidate.facility_id,
      ...(modalMode === "create" ? { created_by: activeProfile?.id || null } : {}),
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

  const handleExportExcel = async () => {
    try {
      const activeMatches = (patients || [])
        .filter((p) => !p.archived_at)
        .filter((patient) =>
          matchesPatientFilters({
            facilityId: isCho ? facilityFilter || null : null,
            patient,
            query: searchTerm,
          })
        );
      const sortedActive = sortPatients({ patients: activeMatches, sortMode });

      const archivedMatches = (patients || [])
        .filter((p) => Boolean(p.archived_at))
        .filter((patient) =>
          matchesPatientFilters({
            facilityId: isCho ? facilityFilter || null : null,
            patient,
            query: searchTerm,
          })
        );
      const sortedArchived = sortPatients({ patients: archivedMatches, sortMode });

      const currentFacility = !isCho && facilities?.length ? facilities[0]?.facility_name : "";

      await exportPatientsExcel({
        activePatients: sortedActive,
        archivedPatients: sortedArchived,
        facilityName: currentFacility,
      });
    } catch (exportErr) {
      console.error("Excel export error, falling back to CSV:", exportErr);
      const csv = buildPatientsCsv({ archiveMode, patients: sortedPatients });
      downloadExportFile({
        filename: `prds-patients-${new Date().toISOString().slice(0, 10)}`,
        csv,
        recordCount: sortedPatients.length,
      });
    }
  };

  const handleRefreshPatients = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    setError("");

    try {
      const refreshedPatients = await loadPatients();
      if (
        selectedId &&
        Array.isArray(refreshedPatients) &&
        !refreshedPatients.some((patient) => patient.id === selectedId)
      ) {
        handleClearSelection();
      }
    } catch (errorMessage) {
      setError(errorMessage instanceof Error ? errorMessage.message : String(errorMessage));
    } finally {
      setIsRefreshing(false);
    }
  };

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

      <div>
        <section className="min-w-0 overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#CFDDE0] px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-[#1B2B30]">Patient Logbook</h2>
              <p className="mt-0.5 text-xs text-[#5B7077]">
                Showing {sortedPatients.length} of {visiblePatients.length} {archiveMode} patients
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isCho && (
                <button
                  type="button"
                  onClick={toggleArchiveMode}
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-xs font-bold shadow-xs transition ${
                    archiveMode === PATIENT_ARCHIVE_MODES.archived
                      ? "border-[#1F4E5A] bg-[#1F4E5A] text-white"
                      : "border-[#CFDDE0] bg-[#F9FBFB] text-[#1B2B30] hover:bg-[#EBF3F5]"
                  }`}
                  aria-pressed={archiveMode === PATIENT_ARCHIVE_MODES.archived}
                >
                  Archive
                </button>
              )}
              <button
                type="button"
                onClick={handleRefreshPatients}
                disabled={isRefreshing}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3 text-xs font-bold text-[#1B2B30] shadow-xs transition hover:bg-[#EBF3F5] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className={isRefreshing ? "animate-spin" : ""}>
                  <RefreshIcon />
                </span>
                Refresh
              </button>
              {archiveMode === PATIENT_ARCHIVE_MODES.active && (
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3 text-xs font-bold text-[#1B2B30] shadow-xs transition hover:bg-[#EBF3F5]"
                >
                  <ExportIcon />
                  Export
                </button>
              )}
              {archiveMode === PATIENT_ARCHIVE_MODES.active && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-linear-to-r from-[#1F4E5A] to-[#286575] hover:brightness-105 active:scale-[0.99] border border-[#1F4E5A] px-4 text-sm font-bold text-white shadow-xs transition-all"
                >
                  <PlusIcon />
                  Register Patient
                </button>
              )}
            </div>
          </div>

          <div
            className={`grid items-center gap-3 border-b border-[#CFDDE0] px-5 py-3 ${
              isCho ? "lg:grid-cols-[1fr_200px_auto]" : "lg:grid-cols-[1fr_auto]"
            }`}
          >
            <label className="relative min-w-0">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5B7077]">
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
              <thead className="border-b border-[#CFDDE0] bg-[#F4F8F8] text-[11px] font-bold uppercase tracking-wider text-[#5B7077]">
                <tr>
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
                patients={paginatedPatients}
                selectedId={selectedId}
              />
            </table>
          </div>

          {totalCount > 0 && (
            <PaginationControls
              currentPage={currentPage}
              itemLabel="patients"
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              totalCount={totalCount}
              totalPages={totalPages}
            />
          )}
        </section>

      </div>

      {selectedPatient && !modalMode && !confirmAction && (
        <PatientViewModal
          archiveMode={archiveMode}
          canAddManualRecord={isCho}
          canArchive={canArchive}
          canDelete={canDelete}
          currentUser={activeProfile}
          defaultDispensingFacilityId={defaultDispensingFacilityId}
          dispensingFacilities={dispensingFacilities}
          facilities={facilities}
          onArchive={handleArchivePatient}
          onClose={handleClearSelection}
          onDelete={handleDeletePatient}
          onEdit={() => openEditModal(selectedPatient)}
          onRestore={handleRestorePatient}
          patient={selectedPatient}
        />
      )}

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
