import { useCallback, useEffect, useMemo, useState } from "react";

import PaginationControls from "../../components/PaginationControls";
import ModalShell from "../../components/ModalShell";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import { getDispensingHistory } from "../dispensing/DispensingService";
import {
  formatDispensingDateTime,
  formatTransactionNumber,
  getFollowUpDisplay,
  getMedicineFullLabel,
  getMedicineLabel,
  groupHistoryByTransaction,
  sortTransactions,
} from "../dispensing/dispensingUtils";
import {
  addPatientManualDispensingRecord,
  getManualRecordMedicines,
} from "./PatientsService";
import {
  filterPatientHistoryRows,
  formatPatientHistoryDateFilterLabel,
  formatPatientAge,
  formatPatientArchivedAt,
  formatPatientCode,
  formatPatientContact,
  formatPatientDateOfBirth,
  formatPatientName,
  formatPatientRegisteredAt,
  PATIENT_HISTORY_DATE_MODES,
  PATIENT_GENDER_OPTIONS,
  validateManualPatientRecord,
} from "./patientUtils";

export const SearchIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const PlusIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const XIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const ExportIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

export const RefreshIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="M20 12a8 8 0 0 1-13.7 5.7L4 15" />
    <path d="M4 20v-5h5" />
    <path d="M4 12A8 8 0 0 1 17.7 6.3L20 9" />
    <path d="M20 4v5h-5" />
  </svg>
);

export const SortArrowIcon = ({ direction = "asc" }) => (
  <svg
    aria-hidden="true"
    className={`h-4 w-4 transition-transform duration-300 ${direction === "desc" ? "rotate-180" : ""}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M8 7h8M10 12h6M12 17h4" />
    <path d="m5 8 3-3 3 3" />
    <path d="M8 5v14" />
  </svg>
);

export function SortToggleButton({ onClick, sortMode }) {
  const isDesc = sortMode === "desc";

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-[#0d1117] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6be9c2] hover:bg-[#eff4ff]"
      title={isDesc ? "Sort A–Z" : "Sort Z–A"}
      aria-label={isDesc ? "Sort from Z to A" : "Sort from A to Z"}
    >
      <SortArrowIcon direction={sortMode} />
      <span>{isDesc ? "Z–A" : "A–Z"}</span>
    </button>
  );
}

export const UserIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <circle cx="10" cy="8" r="4" />
    <path d="M3 21a7 7 0 0 1 14 0" />
  </svg>
);

export const PhoneIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </svg>
);

export const PinIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export const CalendarIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </svg>
);

export const PencilIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 20h9" />
    <path d="m16.5 3.5 4 4L8 20l-5 1 1-5 12.5-12.5Z" />
  </svg>
);

export const TrashIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </svg>
);

export const ArchiveIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 7h16" />
    <path d="M6 7v12h12V7" />
    <path d="M9 11h6" />
    <path d="M8 3h8l2 4H6l2-4Z" />
  </svg>
);

export const BackIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="m15 5-7 7 7 7" />
  </svg>
);

export const UsersIcon = () => (
  <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21a7 7 0 0 1 14 0" />
    <path d="M16 4a4 4 0 0 1 0 8M18 21a6 6 0 0 0-2-4.5" />
  </svg>
);

export const ClipboardIcon = () => (
  <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4V3h6v1" />
    <path d="M9 10h6M9 14h6" />
  </svg>
);

export const GenderBadge = ({ gender }) => (
  <span
    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
      gender === "FEMALE" ? "bg-pink-100 text-pink-700" : "bg-sky-100 text-sky-700"
    }`}
  >
    {gender || "Unknown"}
  </span>
);

export const Field = ({ label, required, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
      {label}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </span>
    {children}
  </label>
);

export const Input = (props) => (
  <input
    {...props}
    className={`h-10 w-full rounded-lg border border-[#d8dadc] bg-white px-3 text-sm text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/40 ${props.className || ""}`}
  />
);

export const Select = (props) => (
  <select
    {...props}
    className={`h-10 w-full rounded-lg border border-[#d8dadc] bg-white px-3 text-sm font-medium text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/40 ${props.className || ""}`}
  />
);

export function PatientTableSkeleton({ rows = 5 }) {
  return Array.from({ length: rows }, (_, index) => (
    <tr key={index} className="border-b border-[#edf0f2]">
      <td className="px-4 py-3.5">
        <div className="h-3 w-40 animate-pulse rounded bg-[#f0f1f4]" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-5 w-14 animate-pulse rounded-full bg-[#f0f1f4]" />
      </td>
      <td className="hidden px-4 py-3.5 md:table-cell">
        <div className="h-3 w-14 animate-pulse rounded bg-[#f0f1f4]" />
      </td>
      <td className="hidden px-4 py-3.5 lg:table-cell">
        <div className="h-3 w-28 animate-pulse rounded bg-[#f0f1f4]" />
      </td>
    </tr>
  ));
}

export function PatientTable({ archiveMode = "active", isCho, isLoading, onSelect, patients, selectedId }) {
  if (isLoading) {
    return (
      <tbody className="divide-y divide-[#edf0f2]">
        <PatientTableSkeleton />
      </tbody>
    );
  }

  if (patients.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={isCho ? 4 : 3} className="px-4 py-14">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eff4ff] text-[#5f6673]">
                <UsersIcon />
              </span>
              <p className="text-sm font-bold text-[#0d1117]">No patients found</p>
              <p className="max-w-80 text-sm text-[#5f6673]">
                Register a patient to start the barangay patient logbook, or adjust your filters.
              </p>
            </div>
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody className="divide-y divide-[#edf0f2]">
      {patients.map((patient) => {
        const isSelected = selectedId === patient.id;

        return (
          <tr
            key={patient.id}
            onClick={() => onSelect(patient.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(patient.id);
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`Open ${formatPatientName(patient)} patient record`}
            className={`cursor-pointer border-l-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00a36c] ${
              isSelected
                ? "border-l-[#00a36c] bg-[#eff4ff]"
                : "border-l-transparent hover:bg-[#f8f9ff] focus:bg-[#f8f9ff]"
            }`}
          >
            <td className="px-4 py-3.5">
              <p className="text-sm font-bold text-[#0d1117]">{formatPatientName(patient)}</p>
              <p className="text-xs text-[#5f6673]">
                {archiveMode === "archived"
                  ? `Archived ${formatPatientArchivedAt(patient.archived_at)}${patient.archive_reason ? ` - ${patient.archive_reason}` : ""}`
                  : patient.address || "No address on file"}
              </p>
            </td>
            <td className="px-4 py-3.5">
              <GenderBadge gender={patient.gender} />
            </td>
            <td className="hidden px-4 py-3.5 text-sm font-semibold text-[#0d1117] md:table-cell">
              {formatPatientAge(patient.date_of_birth)}
            </td>
            {isCho && (
              <td className="hidden px-4 py-3.5 text-sm font-semibold text-[#0d1117] lg:table-cell">
                {patient.facility?.facility_name || "—"}
              </td>
            )}
          </tr>
        );
      })}
    </tbody>
  );
}

const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

const emptyManualRecordForm = (facilityId = "") => ({
  dispense_date: getTodayInputValue(),
  facility_id: facilityId,
  manual_dispensed_by: "",
  medicine_id: "",
  needed_quantity: "",
  prescribed_by: "",
  quantity: "",
});

const getDispensedByName = (row, transaction) => {
  if (row?.manual_dispensed_by) {
    return row.manual_dispensed_by;
  }

  if (transaction?.dispenser) {
    return `${transaction.dispenser.first_name} ${transaction.dispenser.last_name}`;
  }

  return "Unknown user";
};

export function PatientViewModal({
  archiveMode = "active",
  canAddManualRecord = false,
  canArchive,
  canDelete,
  defaultDispensingFacilityId = "",
  facilities = [],
  onArchive,
  onClose,
  onDelete,
  onEdit,
  onRestore,
  patient,
}) {
  const [claims, setClaims] = useState([]);
  const [isLoadingClaims, setIsLoadingClaims] = useState(true);
  const [claimError, setClaimError] = useState("");
  const [viewMode, setViewMode] = useState("details");
  const [historyDateFilter, setHistoryDateFilter] = useState({
    end: "",
    mode: PATIENT_HISTORY_DATE_MODES.all,
    start: "",
    value: "",
  });
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [manualForm, setManualForm] = useState(() => emptyManualRecordForm(defaultDispensingFacilityId));
  const [manualError, setManualError] = useState("");
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [medicineSearch, setMedicineSearch] = useState("");
  const [medicineOptions, setMedicineOptions] = useState([]);
  const [isLoadingMedicines, setIsLoadingMedicines] = useState(false);

  const patientId = patient?.id;
  const isArchived = archiveMode === "archived" || Boolean(patient?.archived_at);

  const loadClaims = useCallback(async () => {
    if (!patientId) {
      return;
    }

    setIsLoadingClaims(true);

    try {
      const rows = await getDispensingHistory({ patientId });
      setClaims(rows);
      setClaimError("");
    } catch (loadError) {
      setClaimError(loadError.message || "Unable to load patient history.");
    } finally {
      setIsLoadingClaims(false);
    }
  }, [patientId]);

  useEffect(() => {
    setManualForm(emptyManualRecordForm(defaultDispensingFacilityId));
    setViewMode("details");
    setManualError("");
    setHistoryDateFilter({ end: "", mode: PATIENT_HISTORY_DATE_MODES.all, start: "", value: "" });
    setIsDateFilterOpen(false);
  }, [defaultDispensingFacilityId, patient]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadClaims();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadClaims]);

  useEffect(() => {
    if (viewMode !== "add" || !canAddManualRecord || medicineOptions.length > 0 || isLoadingMedicines) {
      return;
    }

    setIsLoadingMedicines(true);
    getManualRecordMedicines()
      .then(setMedicineOptions)
      .catch((error) => setManualError(error.message || "Unable to load medicines."))
      .finally(() => setIsLoadingMedicines(false));
  }, [canAddManualRecord, isLoadingMedicines, medicineOptions.length, viewMode]);

  const transactions = useMemo(
    () => sortTransactions(groupHistoryByTransaction(claims), "newest"),
    [claims]
  );

  const historyRows = useMemo(
    () =>
      transactions.flatMap((transaction) =>
        transaction.medicineLines.map((line) => {
          const firstRow = line.rows[0] || {};

          return {
            date: transaction.dispenseDate,
            dispenseDate: transaction.dispenseDate,
            dispenseId: transaction.transactionId || transaction.key,
            dispensedBy: getDispensedByName(firstRow, transaction),
            dispensingFacility: firstRow.dispensing_facility || transaction.dispensingFacility,
            followUp: getFollowUpDisplay(line) || "None",
            isManual: line.rows.some((row) => row.is_manual_record),
            key: `${transaction.key}-${firstRow.medicine_id || firstRow.id}`,
            medicine: line.medicine,
            neededQuantity: line.neededQuantity,
            prescribedBy: firstRow.prescribed_by || "Not recorded",
            releasedQuantity: line.releasedQuantity,
          };
        })
      ),
    [transactions]
  );

  const filteredHistoryRows = useMemo(
    () =>
      filterPatientHistoryRows({
        ...historyDateFilter,
        rows: historyRows,
      }),
    [historyDateFilter, historyRows]
  );

  const {
    currentPage: historyPage,
    paginatedRows: paginatedHistoryRows,
    pageSize: historyPageSize,
    setCurrentPage: setHistoryPage,
    totalCount: historyTotalCount,
    totalPages: historyTotalPages,
  } = usePaginatedRows(filteredHistoryRows, 8);

  const filteredMedicineOptions = useMemo(() => {
    const term = medicineSearch.trim().toLowerCase();

    if (!term) {
      return medicineOptions;
    }

    return medicineOptions.filter((medicine) =>
      [medicine.generic_name, medicine.brand_name, medicine.dosage, medicine.unit_of_measure]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [medicineOptions, medicineSearch]);

  const handleManualFieldChange = (event) => {
    const { name, value } = event.target;
    setManualForm((current) => ({ ...current, [name]: value }));
  };

  const openHistory = () => {
    setViewMode("history");
    loadClaims();
  };

  const openAddRecord = () => {
    setManualError("");
    setManualForm(emptyManualRecordForm(defaultDispensingFacilityId));
    setViewMode("add");
  };

  const saveManualRecord = async (event) => {
    event.preventDefault();

    const validationError = validateManualPatientRecord(manualForm);
    if (validationError) {
      setManualError(validationError);
      return;
    }

    setIsSavingManual(true);
    setManualError("");

    try {
      await addPatientManualDispensingRecord({
        date: manualForm.dispense_date,
        dispensedBy: manualForm.manual_dispensed_by.trim(),
        facilityId: manualForm.facility_id,
        medicineId: manualForm.medicine_id,
        neededQuantity: manualForm.needed_quantity,
        patientId,
        prescribedBy: manualForm.prescribed_by.trim(),
        releasedQuantity: manualForm.quantity,
      });
      await loadClaims();
      setManualForm(emptyManualRecordForm(defaultDispensingFacilityId));
      setViewMode("history");
    } catch (saveError) {
      setManualError(saveError.message || "Unable to add manual record.");
    } finally {
      setIsSavingManual(false);
    }
  };

  if (!patient) {
    return null;
  }

  return (
    <ModalShell
      labelledBy="patient-view-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="max-w-6xl"
    >
      <div className="max-h-[88vh] w-full overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e5e7eb] bg-[#f8fffb] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#008f68]">
              {viewMode === "history" ? "Patient History" : viewMode === "add" ? "Manual Record" : formatPatientCode(patient.patient_code)}
            </p>
            <h2 id="patient-view-modal-title" className="mt-1 truncate text-xl font-bold text-[#0d1117]">
              {formatPatientName(patient)}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <GenderBadge gender={patient.gender} />
              <span className="inline-flex rounded-full bg-[#eff4ff] px-2.5 py-1 text-[11px] font-bold text-[#42474e]">
                {formatPatientAge(patient.date_of_birth)}
              </span>
              {isArchived && (
                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                  Archived
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {viewMode !== "details" && (
              <button
                type="button"
                onClick={() => setViewMode("details")}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-[#0d1117] shadow-sm transition hover:bg-[#eff4ff]"
              >
                <BackIcon />
                Back to Details
              </button>
            )}
            {viewMode !== "history" && (
              <button
                type="button"
                onClick={openHistory}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-[#0d1117] shadow-sm transition hover:bg-[#eff4ff]"
              >
                <ClipboardIcon />
                Patient History
              </button>
            )}
            {canAddManualRecord && viewMode !== "add" && !isArchived && (
              <button
                type="button"
                onClick={openAddRecord}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-black px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#0d1117]"
              >
                <PlusIcon />
                Add Record
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#6b7280] transition hover:bg-[#eff4ff] hover:text-[#0d1117] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a36c] focus-visible:ring-offset-1"
              aria-label="Close patient view"
            >
              <XIcon />
            </button>
          </div>
        </div>

        <div className="prds-modal-scrollbar max-h-[calc(88vh-150px)] overflow-y-auto p-5">
          {viewMode === "details" && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
              <section className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-[#0d1117]">Patient Details</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <InfoBox icon={<CalendarIcon />} label="Date of Birth" value={formatPatientDateOfBirth(patient.date_of_birth)} />
                  <InfoBox icon={<PhoneIcon />} label="Contact Number" value={formatPatientContact(patient.contact_number)} />
                  <InfoBox
                    icon={<UserIcon />}
                    label="Registered Facility"
                    value={patient.facility?.facility_name || "-"}
                    sub={patient.facility?.facility_code || undefined}
                  />
                  <InfoBox icon={<PinIcon />} label="Address" value={patient.address || "-"} />
                </div>
              </section>

              <aside className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-[#0d1117]">Record Info</h3>
                <div className="mt-4 space-y-3">
                  <DetailLine label="Patient Code" value={formatPatientCode(patient.patient_code)} />
                  <DetailLine label="Registered by" value={getRegisteredByName(patient.registered_by)} />
                  <DetailLine label="Registered" value={formatPatientRegisteredAt(patient.created_at)} />
                  <DetailLine label="Full Name" value={formatPatientName(patient)} />
                  <DetailLine label="Gender" value={patient.gender || "-"} />
                  {isArchived && (
                    <>
                      <DetailLine label="Archived" value={formatPatientArchivedAt(patient.archived_at)} />
                      <DetailLine label="Archive Reason" value={patient.archive_reason || "No reason provided"} />
                      <DetailLine label="Archived by" value={patient.archived_by ? "CHO staff" : "-"} />
                    </>
                  )}
                </div>
              </aside>
            </div>
          )}

          {viewMode === "history" && (
            <section className="overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] px-4 py-3">
                <div>
                  <h3 className="text-sm font-bold text-[#0d1117]">Patient History</h3>
                  <p className="mt-0.5 text-xs text-[#5f6673]">
                    {isLoadingClaims ? "Loading records..." : `${filteredHistoryRows.length.toLocaleString()} record${filteredHistoryRows.length === 1 ? "" : "s"} shown`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      aria-expanded={isDateFilterOpen}
                      onClick={() => setIsDateFilterOpen((current) => !current)}
                      className="inline-flex h-9 min-w-44 items-center justify-between gap-2 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-[#0d1117] shadow-sm transition hover:bg-[#eff4ff]"
                    >
                      <span>Date filter: {formatPatientHistoryDateFilterLabel(historyDateFilter)}</span>
                      <CalendarIcon />
                    </button>
                    {isDateFilterOpen && (
                      <div className="absolute right-0 top-11 z-20 w-80 rounded-xl border border-[#d8dadc] bg-white p-3 text-xs shadow-xl">
                        <Field label="Mode">
                          <Select
                            value={historyDateFilter.mode}
                            onChange={(event) =>
                              setHistoryDateFilter({ end: "", mode: event.target.value, start: "", value: "" })
                            }
                          >
                            <option value={PATIENT_HISTORY_DATE_MODES.all}>All dates</option>
                            <option value={PATIENT_HISTORY_DATE_MODES.date}>Specific date</option>
                            <option value={PATIENT_HISTORY_DATE_MODES.dateRange}>Date range</option>
                            <option value={PATIENT_HISTORY_DATE_MODES.month}>Month</option>
                            <option value={PATIENT_HISTORY_DATE_MODES.monthRange}>Month range</option>
                          </Select>
                        </Field>
                        {historyDateFilter.mode === PATIENT_HISTORY_DATE_MODES.date && (
                          <Field label="Date">
                            <Input
                              type="date"
                              value={historyDateFilter.value}
                              onChange={(event) =>
                                setHistoryDateFilter((current) => ({ ...current, value: event.target.value }))
                              }
                            />
                          </Field>
                        )}
                        {historyDateFilter.mode === PATIENT_HISTORY_DATE_MODES.dateRange && (
                          <div className="grid gap-2 md:grid-cols-2">
                            <Field label="Start">
                              <Input
                                type="date"
                                value={historyDateFilter.start}
                                onChange={(event) =>
                                  setHistoryDateFilter((current) => ({ ...current, start: event.target.value }))
                                }
                              />
                            </Field>
                            <Field label="End">
                              <Input
                                type="date"
                                value={historyDateFilter.end}
                                onChange={(event) =>
                                  setHistoryDateFilter((current) => ({ ...current, end: event.target.value }))
                                }
                              />
                            </Field>
                          </div>
                        )}
                        {historyDateFilter.mode === PATIENT_HISTORY_DATE_MODES.month && (
                          <Field label="Month">
                            <Input
                              type="month"
                              value={historyDateFilter.value}
                              onChange={(event) =>
                                setHistoryDateFilter((current) => ({ ...current, value: event.target.value }))
                              }
                            />
                          </Field>
                        )}
                        {historyDateFilter.mode === PATIENT_HISTORY_DATE_MODES.monthRange && (
                          <div className="grid gap-2 md:grid-cols-2">
                            <Field label="Start month">
                              <Input
                                type="month"
                                value={historyDateFilter.start}
                                onChange={(event) =>
                                  setHistoryDateFilter((current) => ({ ...current, start: event.target.value }))
                                }
                              />
                            </Field>
                            <Field label="End month">
                              <Input
                                type="month"
                                value={historyDateFilter.end}
                                onChange={(event) =>
                                  setHistoryDateFilter((current) => ({ ...current, end: event.target.value }))
                                }
                              />
                            </Field>
                          </div>
                        )}
                        <div className="mt-3 flex justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setHistoryDateFilter({ end: "", mode: PATIENT_HISTORY_DATE_MODES.all, start: "", value: "" })}
                            className="h-8 rounded-lg px-3 font-bold text-[#5f6673] hover:bg-[#f7f6f3]"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsDateFilterOpen(false)}
                            className="h-8 rounded-lg bg-black px-3 font-bold text-white"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={loadClaims}
                    disabled={isLoadingClaims}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-[#0d1117] shadow-sm transition hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className={isLoadingClaims ? "animate-spin" : ""}>
                      <RefreshIcon />
                    </span>
                    Refresh
                  </button>
                </div>
              </div>

              {claimError && (
                <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                  {claimError}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-[#f8f9ff] text-[10px] font-bold uppercase tracking-wide text-[#6b7280]">
                    <tr>
                      <th className="px-4 py-3">Dispense ID</th>
                      <th className="px-4 py-3">Medicine</th>
                      <th className="px-4 py-3 text-right">Needed quantity</th>
                      <th className="px-4 py-3 text-right">Released quantity</th>
                      <th className="px-4 py-3">Dispensed by</th>
                      <th className="px-4 py-3">Prescribed by</th>
                      <th className="px-4 py-3">Dispensing facility</th>
                      <th className="px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf0f2] bg-white">
                    {isLoadingClaims &&
                      [0, 1, 2].map((key) => (
                        <tr key={key}>
                          <td colSpan={8} className="px-4 py-3">
                            <div className="h-10 animate-pulse rounded-lg bg-[#f8f9ff]" />
                          </td>
                        </tr>
                      ))}
                    {!isLoadingClaims && paginatedHistoryRows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center">
                          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#eff4ff] text-[#5f6673]">
                            <ClipboardIcon />
                          </span>
                          <p className="mt-2 text-sm font-bold text-[#0d1117]">No patient history found</p>
                          <p className="mt-1 text-sm text-[#5f6673]">Dispensing and manual records will appear here.</p>
                        </td>
                      </tr>
                    )}
                    {!isLoadingClaims &&
                      paginatedHistoryRows.map((row) => (
                        <tr key={row.key} className="align-top hover:bg-[#f8f9ff]">
                          <td className="px-4 py-3 font-bold text-blue-700 tabular-nums">
                            {formatTransactionNumber(row.dispenseId)}
                            {row.isManual && (
                              <span className="mt-1 block w-fit rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                                Manual
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-bold text-[#0d1117]">{getMedicineLabel(row.medicine)}</p>
                            <p className="text-[11px] text-[#5f6673]">{getMedicineFullLabel(row.medicine)}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-[#0d1117] tabular-nums">
                            {Number(row.neededQuantity || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-[#0d1117] tabular-nums">
                            {Number(row.releasedQuantity || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 font-semibold text-[#42474e]">{row.dispensedBy}</td>
                          <td className="px-4 py-3 text-[#42474e]">{row.prescribedBy}</td>
                          <td className="px-4 py-3 text-[#42474e]">{row.dispensingFacility?.facility_name || "-"}</td>
                          <td className="px-4 py-3 text-[#42474e]">{formatDispensingDateTime(row.date)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {historyTotalCount > 0 && (
                <PaginationControls
                  currentPage={historyPage}
                  itemLabel="history records"
                  onPageChange={setHistoryPage}
                  pageSize={historyPageSize}
                  totalCount={historyTotalCount}
                  totalPages={historyTotalPages}
                />
              )}
            </section>
          )}

          {viewMode === "add" && (
            <form onSubmit={saveManualRecord} className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#0d1117]">Add Manual Record</h3>
                  <p className="mt-0.5 text-xs text-[#5f6673]">
                    History-only record. This will not deduct stock or block live dispensing.
                  </p>
                </div>
                <span className="rounded-full bg-[#eff4ff] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#42474e]">
                  Dispense ID auto-generated
                </span>
              </div>

              {manualError && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                  {manualError}
                </p>
              )}

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <section className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                    <Field label="Medicine" required>
                      <Input
                        type="search"
                        value={medicineSearch}
                        onChange={(event) => setMedicineSearch(event.target.value)}
                        placeholder="Search medicine..."
                        className="mb-2"
                      />
                      <Select
                        name="medicine_id"
                        value={manualForm.medicine_id}
                        onChange={handleManualFieldChange}
                        disabled={isLoadingMedicines}
                      >
                        <option value="">{isLoadingMedicines ? "Loading medicines..." : "Select medicine"}</option>
                        {filteredMedicineOptions.map((medicine) => (
                          <option key={medicine.id} value={medicine.id}>
                            {getMedicineLabel(medicine)} - {medicine.brand_name || medicine.unit_of_measure}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Date" required>
                      <Input
                        max={getTodayInputValue()}
                        name="dispense_date"
                        onChange={handleManualFieldChange}
                        type="date"
                        value={manualForm.dispense_date}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Needed quantity" required>
                      <Input
                        min="1"
                        name="needed_quantity"
                        onChange={handleManualFieldChange}
                        type="number"
                        value={manualForm.needed_quantity}
                      />
                    </Field>
                    <Field label="Released quantity" required>
                      <Input
                        min="1"
                        name="quantity"
                        onChange={handleManualFieldChange}
                        type="number"
                        value={manualForm.quantity}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Dispensed by" required>
                      <Input
                        name="manual_dispensed_by"
                        onChange={handleManualFieldChange}
                        placeholder="Staff name from past record"
                        value={manualForm.manual_dispensed_by}
                      />
                    </Field>
                    <Field label="Prescribed by" required>
                      <Input
                        name="prescribed_by"
                        onChange={handleManualFieldChange}
                        placeholder="Doctor name"
                        value={manualForm.prescribed_by}
                      />
                    </Field>
                  </div>

                  <Field label="Dispensing facility" required>
                    <Select name="facility_id" value={manualForm.facility_id} onChange={handleManualFieldChange}>
                      <option value="">Select facility</option>
                      {facilities.map((facility) => (
                        <option key={facility.id} value={facility.id}>
                          {facility.facility_name}
                        </option>
                      ))}
                    </Select>
                    <p className="mt-1 text-[11px] font-medium text-[#6b7280]">
                      Select where the medicine was actually dispensed.
                    </p>
                  </Field>
                </section>

                <aside className="rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Patient</p>
                  <p className="mt-2 text-sm font-bold text-[#0d1117]">{formatPatientName(patient)}</p>
                  <p className="mt-1 text-xs text-[#5f6673]">{patient.address || "No address on file"}</p>
                  <div className="mt-4 space-y-3">
                    <DetailLine label="Patient Code" value={formatPatientCode(patient.patient_code)} />
                    <DetailLine label="Registered Facility" value={patient.facility?.facility_name || "-"} />
                    <DetailLine label="Record Type" value="Manual history" />
                  </div>
                </aside>
              </div>

              <div className="mt-5 flex justify-end gap-3 border-t border-[#e5e7eb] pt-4">
                <button
                  type="button"
                  onClick={() => setViewMode("details")}
                  className="h-10 rounded-lg bg-[#f7f6f3] px-5 text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingManual}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-5 text-sm font-bold text-white transition hover:bg-[#0d1117] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <PlusIcon />
                  {isSavingManual ? "Saving..." : "Save Record"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-[#e5e7eb] px-5 py-4">
          {viewMode === "details" && (
            isArchived ? (
              <>
                {canArchive && (
                  <button
                    type="button"
                    onClick={onRestore}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-5 text-sm font-bold text-white transition hover:bg-[#0d1117]"
                  >
                    <BackIcon />
                    Restore
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-bold text-red-600 transition hover:bg-red-50"
                  >
                    <TrashIcon />
                    Delete permanently
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-5 text-sm font-bold text-white transition hover:bg-[#0d1117]"
                >
                  <PencilIcon />
                  Edit
                </button>
                {canArchive && (
                  <button
                    type="button"
                    onClick={onArchive}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-200 px-4 text-sm font-bold text-amber-700 transition hover:bg-amber-50"
                  >
                    <ArchiveIcon />
                    Archive
                  </button>
                )}
              </>
            )
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-[#f7f6f3] px-5 text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff]"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function PatientConfirmModal({
  actionType,
  archiveReason,
  error,
  isSaving,
  onCancel,
  onConfirm,
  onReasonChange,
  patientName,
}) {
  const copy = {
    archive: {
      title: "Archive Patient",
      description: "This patient will be hidden from the active list, but their dispensing history will stay preserved.",
      icon: <ArchiveIcon />,
      confirmLabel: "Archive Patient",
      buttonClass: "bg-black text-white hover:bg-[#0d1117]",
    },
    restore: {
      title: "Restore Patient",
      description: "This patient will return to the active patient list.",
      icon: <BackIcon />,
      confirmLabel: "Restore Patient",
      buttonClass: "bg-black text-white hover:bg-[#0d1117]",
    },
    delete: {
      title: "Delete Permanently",
      description:
        "Warning: this action cannot be undone. Deletion is only possible when there is no dispensing or patient medicine history.",
      icon: <TrashIcon />,
      confirmLabel: "Delete Permanently",
      buttonClass: "bg-red-600 text-white hover:bg-red-700",
    },
  }[actionType];

  if (!copy) {
    return null;
  }

  return (
    <ModalShell
      labelledBy="patient-confirm-modal-title"
      onClose={onCancel}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="max-w-md"
    >
      <div className="w-full rounded-xl border border-[#d8dadc] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e5e7eb] px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                actionType === "delete"
                  ? "bg-red-50 text-red-600"
                  : "bg-[#dffbf2] text-[#008f68]"
              }`}
            >
              {copy.icon}
            </span>
            <div>
              <h2 id="patient-confirm-modal-title" className="text-lg font-bold text-[#0d1117]">
                {copy.title}
              </h2>
              <p className="mt-0.5 text-sm font-semibold text-[#42474e]">{patientName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition hover:bg-[#eff4ff] hover:text-[#0d1117] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Close confirmation"
          >
            <XIcon />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-sm leading-6 text-[#42474e]">{copy.description}</p>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold leading-6 text-red-700">
              {error}
            </div>
          )}

          {actionType === "archive" && (
            <Field label="Reason for archive">
              <textarea
                value={archiveReason}
                onChange={(event) => onReasonChange(event.target.value)}
                className="min-h-24 w-full resize-none rounded-lg border border-[#d8dadc] bg-white px-3 py-2 text-sm text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/40"
                placeholder="Optional note for activity history"
              />
            </Field>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-[#e5e7eb] px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="h-10 rounded-lg bg-[#f7f6f3] px-5 text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
            className={`inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:bg-neutral-400 ${copy.buttonClass}`}
          >
            {copy.icon}
            {isSaving ? "Saving..." : copy.confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function InfoBox({ icon, label, sub, value }) {
  return (
    <div className="rounded-lg bg-[#f8f9ff] p-3">
      <div className="flex items-center gap-2">
        <span className="text-[#008f68]">{icon}</span>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">{label}</p>
      </div>
      <p className="mt-1.5 text-sm font-bold text-[#0d1117]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[#5f6673]">{sub}</p>}
    </div>
  );
}

function DetailLine({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#edf0f2] pb-3 text-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-[#6b7280]">{label}</p>
      <p className="text-right font-bold text-[#0d1117]">{value}</p>
    </div>
  );
}

export function PatientFormModal({
  canChooseFacility,
  error,
  facilities,
  formValues,
  isClosing = false,
  isSaving,
  mode,
  onClose,
  onChange,
  onSubmit,
}) {
  const isReadOnly = mode === "view";
  const title =
    mode === "create"
      ? "Register New Patient"
      : mode === "edit"
        ? "Edit Patient Record"
        : "Patient Details";

  return (
    <ModalShell
      closing={isClosing}
      labelledBy="patient-form-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="max-w-2xl"
    >
      <form
        onSubmit={onSubmit}
        className="max-h-[86vh] w-full overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e5e7eb] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#dffbf2] text-[#008f68]">
              <UsersIcon />
            </span>
            <div>
              <h2 id="patient-form-modal-title" className="text-lg font-bold text-[#0d1117]">
                {title}
              </h2>
              <p className="mt-0.5 text-sm text-[#5f6673]">
                {mode === "create"
                  ? "Add a bonafide citizen to the patient logbook."
                  : "Update the patient's registration details."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition hover:bg-[#eff4ff] hover:text-[#0d1117]"
            aria-label="Close modal"
          >
            <XIcon />
          </button>
        </div>

        <div className="prds-modal-scrollbar max-h-[calc(86vh-140px)] overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First Name" required>
              <Input
                name="first_name"
                value={formValues.first_name}
                onChange={onChange}
                disabled={isReadOnly}
                placeholder="e.g. Maria"
                maxLength={60}
                required
              />
            </Field>
            <Field label="Middle Name">
              <Input
                name="middle_name"
                value={formValues.middle_name || ""}
                onChange={onChange}
                disabled={isReadOnly}
                placeholder="Optional"
                maxLength={60}
              />
            </Field>
            <Field label="Last Name" required>
              <Input
                name="last_name"
                value={formValues.last_name}
                onChange={onChange}
                disabled={isReadOnly}
                placeholder="e.g. Reyes"
                maxLength={60}
                required
              />
            </Field>
            <Field label="Suffix">
              <Select
                name="suffix"
                value={formValues.suffix || ""}
                onChange={onChange}
                disabled={isReadOnly}
              >
                <option value="">None</option>
                <option value="Jr.">Jr.</option>
                <option value="Sr.">Sr.</option>
                <option value="II">II</option>
                <option value="III">III</option>
                <option value="IV">IV</option>
              </Select>
            </Field>
            <Field label="Gender" required>
              <Select
                name="gender"
                value={formValues.gender || ""}
                onChange={onChange}
                disabled={isReadOnly}
                required
              >
                <option value="">Select gender</option>
                {PATIENT_GENDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date of Birth" required>
              <Input
                name="date_of_birth"
                type="date"
                value={formValues.date_of_birth || ""}
                onChange={onChange}
                disabled={isReadOnly}
                max={new Date().toISOString().slice(0, 10)}
                required
              />
            </Field>
            <Field label="Contact Number">
              <Input
                name="contact_number"
                value={formValues.contact_number || ""}
                onChange={onChange}
                disabled={isReadOnly}
                placeholder="e.g. 0917 123 4567"
                inputMode="tel"
                maxLength={16}
              />
            </Field>
            <Field label="Address (Purok / Barangay)">
              <Input
                name="address"
                value={formValues.address || ""}
                onChange={onChange}
                disabled={isReadOnly}
                placeholder="e.g. Purok 3, Barangay San"
              />
            </Field>

            {canChooseFacility ? (
              <div className="sm:col-span-2">
                <Field label="Health Center / Facility" required>
                  <Select
                    name="facility_id"
                    value={formValues.facility_id || ""}
                    onChange={onChange}
                    disabled={isReadOnly}
                    required
                  >
                    <option value="">Select facility</option>
                    {facilities.map((facility) => (
                      <option key={facility.id} value={facility.id}>
                        {facility.facility_name} ({facility.facility_code})
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <div className="sm:col-span-2">
                <Field label="Health Center / Facility" required>
                  <Input
                    value={facilities[0]?.facility_name || "—"}
                    disabled
                  />
                </Field>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[#e5e7eb] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-[#f7f6f3] px-5 text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff]"
          >
            Cancel
          </button>
          {mode !== "view" && (
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-5 text-sm font-bold text-white transition hover:bg-[#0d1117] disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              <PlusIcon />
              {isSaving
                ? mode === "create"
                  ? "Registering..."
                  : "Saving..."
                : mode === "create"
                  ? "Register Patient"
                  : "Save Changes"}
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  );
}

const getRegisteredByName = (registeredBy) => {
  if (!registeredBy) {
    return "—";
  }

  return `${registeredBy.first_name || ""} ${registeredBy.last_name || ""}`.trim() || "—";
};
