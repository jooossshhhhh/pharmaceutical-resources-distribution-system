import {
  formatPatientAge,
  formatPatientCode,
  formatPatientDateOfBirth,
  formatPatientName,
  formatPatientRegisteredAt,
} from "../patients/patientUtils";
import {
  ArrowRightIcon,
  EligibilityBadge,
  FOCUS_RING,
  HistoryIcon,
  PatientAvatar,
  XIcon,
} from "./DispensingUi";

export default function PatientInfoPanel({
  claimedWarning,
  isSelected,
  onClose,
  onContinue,
  onOpenHistory,
  onSelect,
  patient,
}) {
  const patientName = formatPatientName(patient);

  const facts = [
    { label: "Gender", value: patient.gender || "—" },
    { label: "Age", value: `${formatPatientAge(patient.date_of_birth) ?? "?"} yrs` },
    { label: "Date of Birth", value: formatPatientDateOfBirth(patient.date_of_birth) || "—" },
    { label: "Contact Number", value: patient.contact_number || "—" },
    { label: "Address", value: patient.address || "—", wide: true },
    { label: "Health Center", value: patient.facility?.facility_name || "—", wide: true },
    { label: "Registered", value: formatPatientRegisteredAt(patient.created_at) || "—", wide: true },
  ];

  return (
    <section
      aria-label={`${patientName} information`}
      className="flex h-full flex-col overflow-hidden rounded-xl border border-[#6be9c2] bg-white shadow-sm"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[#e5e7eb] bg-[#ecfff8] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <PatientAvatar name={patientName} sizeClass="h-10 w-10 text-sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#0d1117]" title={patientName}>
              {patientName}
            </p>
            <p className="mt-0.5 truncate text-xs text-[#5f6673] tabular-nums">
              {formatPatientCode(patient.patient_code)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close patient info panel"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition hover:bg-[#eff4ff] hover:text-[#0d1117] ${FOCUS_RING}`}
        >
          <XIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <section aria-label="Patient information">
          <h3 className="text-base font-bold text-[#0d1117]">Patient Information</h3>
          <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-3.5">
            {facts.map((fact) => (
              <div key={fact.label} className={`min-w-0 ${fact.wide ? "col-span-2" : ""}`}>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">{fact.label}</dt>
                <dd
                  className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium leading-snug text-[#0d1117]"
                  title={fact.value}
                >
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {isSelected && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e5e7eb] bg-[#f8f9ff] px-4 py-2.5">
          <EligibilityBadge claimedThisMonth={Boolean(claimedWarning)} />
          {claimedWarning && (
            <p className="text-[11px] font-bold text-orange-700">{claimedWarning}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e5e7eb] bg-white px-4 py-3">
        <button
          type="button"
          onClick={onOpenHistory}
          className={`inline-flex h-9 items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-[#0d1117] shadow-sm transition hover:border-[#6be9c2] hover:bg-[#eff4ff] ${FOCUS_RING}`}
        >
          <HistoryIcon /> History
        </button>

        {isSelected ? (
          <button
            type="button"
            onClick={onContinue}
            disabled={Boolean(claimedWarning)}
            title={claimedWarning || undefined}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-black px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            Continue to Medicines <ArrowRightIcon />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-black px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117] ${FOCUS_RING}`}
          >
            Select this patient
          </button>
        )}
      </div>
    </section>
  );
}
