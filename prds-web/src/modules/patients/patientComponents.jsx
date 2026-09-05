import ModalShell from "../../components/ModalShell";
import {
  formatPatientAge,
  formatPatientArchivedAt,
  formatPatientCode,
  formatPatientContact,
  formatPatientDateOfBirth,
  formatPatientName,
  formatPatientRegisteredAt,
  PATIENT_GENDER_OPTIONS,
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
        <div className="h-3 w-16 animate-pulse rounded bg-[#f0f1f4]" />
      </td>
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
          <td colSpan={isCho ? 5 : 4} className="px-4 py-14">
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
            className={`cursor-pointer border-l-2 transition ${
              isSelected
                ? "border-l-[#00a36c] bg-[#eff4ff]"
                : "border-l-transparent hover:bg-[#f8f9ff]"
            }`}
          >
            <td className="px-4 py-3.5 text-xs font-bold text-[#008f68]">
              {formatPatientCode(patient.patient_code)}
            </td>
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

export function PatientDetailsPanel({
  archiveMode = "active",
  canArchive,
  canDelete,
  onArchive,
  onBack,
  onDelete,
  onEdit,
  onRestore,
  patient,
}) {
  if (!patient) {
    return (
      <div className="flex h-full min-h-72 items-center justify-center rounded-xl border border-[#d8dadc] bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eff4ff] text-[#5f6673]">
            <ClipboardIcon />
          </span>
          <p className="text-sm font-bold text-[#0d1117]">No patient selected</p>
          <p className="max-w-60 text-sm text-[#5f6673]">
            Select a patient from the list to view their full record.
          </p>
        </div>
      </div>
    );
  }

  const isArchived = archiveMode === "archived";

  return (
    <div className="flex h-full flex-col rounded-xl border border-[#d8dadc] bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-[#e5e7eb] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#008f68]">
            {formatPatientCode(patient.patient_code)}
          </p>
          <h2 className="mt-1 truncate text-lg font-bold text-[#0d1117]">
            {formatPatientName(patient)}
          </h2>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition hover:bg-[#eff4ff] hover:text-[#0d1117]"
          title="Back to list"
          aria-label="Back to list"
        >
          <BackIcon />
        </button>
      </div>

      <div className="prds-modal-scrollbar flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-4 flex items-center gap-2">
          <GenderBadge gender={patient.gender} />
          <span className="inline-flex rounded-full bg-[#eff4ff] px-2.5 py-1 text-[11px] font-bold text-[#42474e]">
            {formatPatientAge(patient.date_of_birth)}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <InfoBox
            icon={<CalendarIcon />}
            label="Date of Birth"
            value={formatPatientDateOfBirth(patient.date_of_birth)}
          />
          <InfoBox
            icon={<PhoneIcon />}
            label="Contact Number"
            value={formatPatientContact(patient.contact_number)}
          />
        </div>

        <div className="mt-3">
          <InfoBox
            icon={<PinIcon />}
            label="Address"
            value={patient.address || "—"}
          />
        </div>

        <div className="mt-3">
          <InfoBox
            icon={<UserIcon />}
            label="Registered Facility"
            value={patient.facility?.facility_name || "—"}
            sub={patient.facility?.facility_code ? `${patient.facility.facility_code} · ${patient.facility.facility_type || ""}` : undefined}
          />
        </div>

        <div className="mt-6 space-y-3">
          {isArchived && (
            <>
              <DetailLine label="Archived" value={formatPatientArchivedAt(patient.archived_at)} />
              <DetailLine label="Archive Reason" value={patient.archive_reason || "No reason provided"} />
              <DetailLine label="Archived by" value={patient.archived_by ? "CHO staff" : "-"} />
            </>
          )}
          <DetailLine label="Registered by" value={getRegisteredByName(patient.registered_by)} />
          <DetailLine label="Registered" value={formatPatientRegisteredAt(patient.created_at)} />
          <DetailLine label="Full Name" value={formatPatientName(patient)} />
          <DetailLine label="Gender" value={patient.gender || "—"} />
        </div>
      </div>

      <div className="flex gap-3 border-t border-[#e5e7eb] px-5 py-4">
        {isArchived ? (
          <>
            {canArchive && (
              <button
                type="button"
                onClick={onRestore}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-black text-sm font-bold text-white transition hover:bg-[#0d1117]"
              >
                <BackIcon />
                Restore
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-bold text-red-600 transition hover:bg-red-50"
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
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-black text-sm font-bold text-white transition hover:bg-[#0d1117]"
            >
              <PencilIcon />
              Edit
            </button>
            {canArchive && (
              <button
                type="button"
                onClick={onArchive}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-amber-200 px-4 text-sm font-bold text-amber-700 transition hover:bg-amber-50"
              >
                <ArchiveIcon />
                Archive
              </button>
            )}
          </>
        )}
      </div>
    </div>
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
      overlayClassName="bg-black/45"
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
                placeholder="Optional note for audit history"
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
      overlayClassName="bg-black/45"
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
              />
            </Field>
            <Field label="Last Name" required>
              <Input
                name="last_name"
                value={formValues.last_name}
                onChange={onChange}
                disabled={isReadOnly}
                placeholder="e.g. Reyes"
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
