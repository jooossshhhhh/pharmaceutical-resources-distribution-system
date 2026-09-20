import { useCallback, useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { getExpiryStatus } from "../inventory/inventoryUtils";
import {
  PATIENT_GENDER_OPTIONS,
  calculateAge,
  formatPatientCode,
  formatPatientName,
  normalizePatientText,
} from "../patients/patientUtils";
import {
  completeWalkInDispensing,
  getClaimedPatientIds,
  getWalkInInventory,
  registerQuickPatient,
  searchDispensingPatients,
} from "./DispensingService";
import {
  buildDispensingCsv,
  buildFefoPreview,
  buildMedicineOptions,
  downloadCsv,
  formatDispensingDateTime,
  formatTransactionNumber,
  getCartLineError,
  getCartSummary,
  getDispensingStepBlocker,
  getMedicineFullLabel,
  getMedicineLabel,
} from "./dispensingUtils";
import {
  ArrowRightIcon,
  CheckIcon,
  DispensingModal,
  EligibilityBadge,
  Field,
  FOCUS_RING,
  Input,
  PatientAvatar,
  PillIcon,
  SearchIcon,
  Select,
  Textarea,
  UserPlusIcon,
  XIcon,
} from "./DispensingUi";
import PatientInfoPanel from "./PatientInfoPanel";
import PatientHistoryModal from "./PatientHistoryModal";

const CLAIMED_THIS_MONTH_NOTICE =
  "This patient already claimed this month. They are eligible again next month.";

const emptyRegisterForm = {
  address: "",
  contact_number: "",
  date_of_birth: "",
  facility_id: "",
  first_name: "",
  gender: "",
  last_name: "",
  middle_name: "",
  suffix: "",
};

function QuickRegisterModal({ facilities, isCho, onClose, onRegistered, profileId }) {
  const [form, setForm] = useState({
    ...emptyRegisterForm,
    facility_id: !isCho && facilities[0] ? facilities[0].id : "",
  });
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDuplicateWarning(null);
  };

  const validationError = (() => {
    if (!form.first_name.trim()) {
      return "First name is required.";
    }

    if (!form.last_name.trim()) {
      return "Last name is required.";
    }

    if (!form.gender) {
      return "Gender is required.";
    }

    if (!form.date_of_birth) {
      return "Date of birth is required.";
    }

    if (isCho && !form.facility_id) {
      return "Facility is required.";
    }

    return "";
  })();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!duplicateWarning) {
      setIsSaving(true);

      try {
        const existing = await searchDispensingPatients({
          facilityId: isCho ? form.facility_id : null,
          keyword: `${form.first_name} ${form.last_name}`,
        });

        const duplicates = existing.filter(
          (patient) =>
            normalizePatientText(`${patient.first_name} ${patient.last_name}`) ===
              normalizePatientText(`${form.first_name} ${form.last_name}`) &&
            (!form.date_of_birth || patient.date_of_birth === form.date_of_birth)
        );

        if (duplicates.length > 0) {
          setDuplicateWarning(duplicates);
          setIsSaving(false);
          return;
        }
      } catch (searchError) {
        setError(searchError.message || "Unable to verify duplicate patients.");
        setIsSaving(false);
        return;
      }
    }

    setIsSaving(true);

    try {
      const patient = await registerQuickPatient({
        payload: {
          address: form.address.trim() || null,
          contact_number: form.contact_number.trim() || null,
          date_of_birth: form.date_of_birth,
          facility_id: form.facility_id,
          first_name: form.first_name.trim(),
          gender: form.gender,
          last_name: form.last_name.trim(),
          middle_name: form.middle_name.trim() || null,
          suffix: form.suffix.trim() || null,
        },
        profileId,
      });
      onRegistered(patient);
    } catch (saveError) {
      setError(saveError.message || "Unable to register the patient.");
      setIsSaving(false);
    }
  };

  return (
    <DispensingModal
      title="Register New Patient"
      subtitle="Add the walk-in patient so they can receive their monthly claim."
      onClose={onClose}
      widthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {duplicateWarning && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
            <p className="font-bold">Possible duplicate patient found:</p>
            <ul className="mt-1 list-inside list-disc">
              {duplicateWarning.map((patient) => (
                <li key={patient.id}>
                  {formatPatientName(patient)} · {formatPatientCode(patient.patient_code)}
                </li>
              ))}
            </ul>
            <p className="mt-1">Submit again to register anyway.</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First Name *">
            <Input
              value={form.first_name}
              onChange={(event) => updateForm("first_name", event.target.value)}
              placeholder="Juan"
              required
            />
          </Field>
          <Field label="Middle Name">
            <Input
              value={form.middle_name}
              onChange={(event) => updateForm("middle_name", event.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Last Name *">
            <Input
              value={form.last_name}
              onChange={(event) => updateForm("last_name", event.target.value)}
              placeholder="Dela Cruz"
              required
            />
          </Field>
          <Field label="Suffix">
            <Input
              value={form.suffix}
              onChange={(event) => updateForm("suffix", event.target.value)}
              placeholder="Jr., III (optional)"
            />
          </Field>
          <Field label="Gender *">
            <Select
              value={form.gender}
              onChange={(event) => updateForm("gender", event.target.value)}
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
          <Field label="Date of Birth *">
            <Input
              type="date"
              value={form.date_of_birth}
              onChange={(event) => updateForm("date_of_birth", event.target.value)}
              required
            />
          </Field>
          {isCho && (
            <Field label="Facility *">
              <Select
                value={form.facility_id}
                onChange={(event) => updateForm("facility_id", event.target.value)}
                required
              >
                <option value="">Select facility</option>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.facility_name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Contact Number">
            <Input
              value={form.contact_number}
              onChange={(event) => updateForm("contact_number", event.target.value)}
              placeholder="09XXXXXXXXX"
            />
          </Field>
        </div>

        <Field label="Address">
          <Textarea
            value={form.address}
            onChange={(event) => updateForm("address", event.target.value)}
            placeholder="House / street / barangay"
          />
        </Field>

        <div className="flex justify-end gap-3 border-t border-[#e5e7eb] pt-4">
          <button
            type="button"
            onClick={onClose}
            className={`h-10 rounded-lg bg-[#f7f6f3] px-5 text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff] ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || Boolean(validationError)}
            title={validationError || ""}
            className={`inline-flex h-10 items-center gap-2 rounded-lg bg-black px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            <UserPlusIcon /> Register Patient
          </button>
        </div>
      </form>
    </DispensingModal>
  );
}

function StepperBar({ blockerFor, onStepClick, step }) {
  const steps = [
    { id: 1, label: "Patient" },
    { id: 2, label: "Medicines" },
    { id: 3, label: "Review & Complete" },
  ];

  return (
    <nav
      aria-label="Dispensing progress"
      className="rounded-xl border border-[#d8dadc] bg-white px-4 py-3 shadow-sm"
    >
      <ol className="flex items-center">
        {steps.map((entry, index) => {
          const done = entry.id < step;
          const active = entry.id === step;
          const blocker = blockerFor(entry.id);
          const unlocked = entry.id <= step || !blocker;

          return (
            <li
              key={entry.id}
              className={`flex min-w-0 items-center ${index < steps.length - 1 ? "flex-1" : ""}`}
            >
              <button
                type="button"
                onClick={() => onStepClick(entry.id)}
                disabled={!unlocked}
                aria-current={active ? "step" : undefined}
                title={unlocked ? undefined : blocker}
                className={`flex min-w-0 items-center gap-2 rounded-lg disabled:cursor-not-allowed ${FOCUS_RING}`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition ${
                    active
                      ? "bg-[#00a36c] text-white shadow-sm"
                      : done
                        ? "border border-[#6be9c2] bg-[#ecfff8] text-[#008f68]"
                        : "border border-[#d8dadc] bg-white text-[#9aa1ad]"
                  }`}
                >
                  {done ? <CheckIcon /> : entry.id}
                </span>
                <span
                  className={`hidden whitespace-nowrap text-sm font-bold sm:block ${
                    active ? "text-[#0d1117]" : done ? "text-[#008f68]" : "text-[#9aa1ad]"
                  }`}
                >
                  {entry.label}
                </span>
              </button>
              {index < steps.length - 1 && (
                <span aria-hidden="true" className="relative mx-3 h-0.5 min-w-6 flex-1 overflow-hidden rounded-full bg-[#e5e7eb]">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full bg-[#6be9c2] transition-[width] duration-300 ${
                      done ? "w-full" : "w-0"
                    }`}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ReceiptModal({ onClose, onExport, receipt }) {
  return (
    <DispensingModal
      title="Dispensing Complete"
      subtitle="The claim has been recorded and stock has been deducted."
      onClose={onClose}
      widthClass="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="flex flex-col items-center rounded-xl border border-[#6be9c2] bg-[#ecfff8] p-6 text-center transition-all duration-200">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a36c] text-white">
            <CheckIcon />
          </span>
          <h3 className="mt-3 text-lg font-bold text-[#0d1117] tabular-nums">
            {formatTransactionNumber(receipt.transactionId)}
          </h3>
          <p className="mt-1 text-xs text-[#5f6673]">{formatDispensingDateTime(receipt.dispensedAt)}</p>
          <EligibilityBadge claimedThisMonth={false} />
        </div>

        <section className="rounded-xl border border-[#e5e7eb] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Patient</p>
          <p className="mt-1 text-sm font-bold text-[#0d1117]">
            {formatPatientName(receipt.patient)}{" "}
            <span className="font-medium text-[#5f6673]">
              · {formatPatientCode(receipt.patient.patient_code)}
            </span>
          </p>
        </section>

        <div className="overflow-hidden rounded-xl border border-[#e5e7eb]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f8f9ff] text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3 text-right">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0f2]">
              {receipt.lines.flatMap((line) =>
                line.preview.allocations.map((allocation, allocationIndex) => (
                  <tr key={`${line.medicine_id}-${allocation.inventory_id}`}>
                    <td className="px-4 py-3 font-bold text-[#0d1117]">
                      {allocationIndex === 0 ? getMedicineLabel(line.option.medicine) : ""}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#5f6673]">{allocation.batch_number}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#0d1117] tabular-nums">
                      {allocation.quantity.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-3 border-t border-[#e5e7eb] pt-4">
          <button
            type="button"
            onClick={onExport}
            className={`h-10 rounded-lg border border-[#d8dadc] bg-white px-5 text-sm font-bold text-[#0d1117] shadow-sm transition hover:border-[#6be9c2] hover:bg-[#eff4ff] ${FOCUS_RING}`}
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-10 items-center gap-2 rounded-lg bg-black px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117] ${FOCUS_RING}`}
          >
            Done
          </button>
        </div>
      </div>
    </DispensingModal>
  );
}


export default function DispensingWorkbench({ facilities, isCho }) {
  const { profile } = useAuth();
  const profileFacilityId = profile?.facility_id;

  const [wizardStep, setWizardStep] = useState(1);

  const [inventoryRows, setInventoryRows] = useState([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);
  const [error, setError] = useState("");

  const [patientKeyword, setPatientKeyword] = useState("");
  const [patientResults, setPatientResults] = useState([]);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const [claimedIds, setClaimedIds] = useState(() => new Set());
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [infoPatient, setInfoPatient] = useState(null);
  const [closingPatient, setClosingPatient] = useState(null);
  const [historyPatient, setHistoryPatient] = useState(null);

  const [medicineKeyword, setMedicineKeyword] = useState("");
  const [cart, setCart] = useState([]);

  const [receipt, setReceipt] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentDateTime = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date()),
    []
  );

  const loadInventory = useCallback(async () => {
    if (!profileFacilityId) {
      setIsLoadingInventory(false);
      return;
    }

    setIsLoadingInventory(true);

    try {
      const rows = await getWalkInInventory(profileFacilityId);
      setInventoryRows(rows);
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Unable to load your facility inventory.");
    } finally {
      setIsLoadingInventory(false);
    }
  }, [profileFacilityId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadInventory();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadInventory]);

  const runPatientSearch = useCallback(async () => {
    setIsSearchingPatients(true);

    try {
      const rows = await searchDispensingPatients({
        keyword: patientKeyword,
      });
      setPatientResults(rows);
      const claimed = await getClaimedPatientIds(rows.map((row) => row.id));
      setClaimedIds(new Set(claimed));
    } catch (searchError) {
      setError(searchError.message || "Unable to search patients.");
    } finally {
      setIsSearchingPatients(false);
    }
  }, [patientKeyword]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      runPatientSearch();
    }, 250);

    return () => window.clearTimeout(timerId);
  }, [runPatientSearch]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      const heading = document.querySelector("[data-step-heading]");

      if (heading instanceof HTMLElement) {
        heading.focus();
      }
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [wizardStep]);

  const medicineOptions = useMemo(
    () => buildMedicineOptions(inventoryRows, medicineKeyword),
    [inventoryRows, medicineKeyword]
  );

  const optionsById = useMemo(
    () => new Map(medicineOptions.map((option) => [option.medicine_id, option])),
    [medicineOptions]
  );

  const cartLines = useMemo(
    () =>
      cart.map((line) => {
        const option =
          optionsById.get(line.medicine_id) ||
          buildMedicineOptions(inventoryRows, "").find((entry) => entry.medicine_id === line.medicine_id) ||
          null;

        return {
          ...line,
          error: option ? getCartLineError({ line, medicineOptions: [option] }) : "This medicine is no longer in stock.",
          option,
          preview: option ? buildFefoPreview(option.batches, line.quantity) : { allocations: [], shortfall: 0 },
        };
      }),
    [cart, inventoryRows, optionsById]
  );

  const cartSummary = useMemo(() => getCartSummary(cart), [cart]);

  const selectedClaimed = selectedPatient ? claimedIds.has(selectedPatient.id) : false;

  const canReview = Boolean(
    selectedPatient &&
      cart.length > 0 &&
      cartLines.every((line) => !line.error && line.preview.shortfall === 0 && Number(line.quantity) > 0)
  );

  const canComplete = canReview && !selectedClaimed;

  const stepBlockers = (target) =>
    getDispensingStepBlocker({
      claimed: selectedClaimed,
      hasLineErrors: cartLines.some((line) => Boolean(line.error) || line.preview.shortfall > 0),
      hasPatient: Boolean(selectedPatient),
      lineCount: cart.length,
      step: target,
    });

  const selectPatient = (patient) => {
    setSelectedPatient(patient);
    setClosingPatient(null);
    setInfoPatient(patient);
  };

  const openPatientInfo = (patient) => {
    if (infoPatient?.id === patient.id) {
      closePatientInfo();
      return;
    }

    setClosingPatient(null);
    setInfoPatient(patient);
  };

  const closePatientInfo = () => {
    if (!infoPatient) {
      return;
    }

    setClosingPatient(infoPatient);
    setInfoPatient(null);
    window.setTimeout(() => setClosingPatient(null), 500);
  };

  const refreshEligibility = useCallback(() => {
    runPatientSearch();
  }, [runPatientSearch]);

  const panelPatient = infoPatient || closingPatient;
  const panelIsClosing = Boolean(closingPatient) && !infoPatient;

  const addToCart = (option) => {
    setCart((current) =>
      current.some((line) => line.medicine_id === option.medicine_id)
        ? current
        : [...current, { medicine_id: option.medicine_id, quantity: 1 }]
    );
  };

  const updateCartQuantity = (medicineId, value) => {
    if (value !== "" && !/^\d+$/.test(value)) {
      return;
    }

    setCart((current) =>
      current.map((line) =>
        line.medicine_id === medicineId
          ? { ...line, quantity: value === "" ? "" : Number(value) }
          : line
      )
    );
  };

  const bumpQuantity = (medicineId, delta) => {
    setCart((current) =>
      current.map((line) => {
        if (line.medicine_id !== medicineId) {
          return line;
        }

        const option = optionsById.get(medicineId);
        const ceiling = option ? option.total_quantity : null;
        const next = Number(line.quantity || 1) + delta;
        const bounded =
          ceiling !== null ? Math.min(Math.max(1, next), ceiling) : Math.max(1, next);

        return { ...line, quantity: bounded };
      })
    );
  };

  const removeCartLine = (medicineId) => {
    setCart((current) => current.filter((line) => line.medicine_id !== medicineId));
  };

  const handleComplete = async () => {
    if (!selectedPatient) {
      return;
    }

    setIsSaving(true);

    try {
      const result = await completeWalkInDispensing({
        items: cartLines.map((line) => ({
          medicine_id: line.medicine_id,
          quantity: Number(line.quantity),
        })),
        patientId: selectedPatient.id,
      });

      setReceipt({
        dispensedAt: result?.dispensed_at || new Date().toISOString(),
        lines: cartLines,
        patient: selectedPatient,
        transactionId: result?.transaction_id,
      });
      setCart([]);
      setSelectedPatient(null);
      setClosingPatient(null);
      setInfoPatient(null);
      setClaimedIds(new Set());
      setWizardStep(1);
      await Promise.all([loadInventory(), runPatientSearch()]);
    } catch (completeError) {
      setError(completeError.message || "Unable to complete the dispensing.");
    } finally {
      setIsSaving(false);
    }
  };

  const closeReceipt = () => {
    setReceipt(null);
  };

  const exportReceipt = () => {
    if (!receipt) {
      return;
    }

    const csv = buildDispensingCsv([
      {
        dispenser: { first_name: profile.first_name, last_name: profile.last_name },
        dispenseDate: receipt.dispensedAt,
        key: receipt.transactionId,
        rows: receipt.lines.flatMap((line) =>
          line.preview.allocations.map((allocation) => ({
            batch: { batch_number: allocation.batch_number },
            id: allocation.inventory_id,
            medicine: line.option.medicine,
            quantity: allocation.quantity,
          }))
        ),
        totalQuantity: receipt.lines.reduce((total, line) => total + Number(line.quantity || 0), 0),
        transactionId: receipt.transactionId,
        patient: receipt.patient,
      },
    ]);

    downloadCsv(csv, `${receipt.transactionId}-receipt.csv`);
  };

  const commitQuantity = (medicineId) => {
    setCart((current) =>
      current.map((line) => {
        if (line.medicine_id !== medicineId) {
          return line;
        }

        const option = optionsById.get(medicineId);
        const ceiling = option ? option.total_quantity : null;
        const parsed = Math.max(1, Math.floor(Number(line.quantity) || 1));
        const bounded = ceiling !== null ? Math.min(parsed, ceiling) : parsed;

        return Number(line.quantity) === bounded ? line : { ...line, quantity: bounded };
      })
    );
  };

  return (
    <AdminShell currentDateTime={currentDateTime} profile={profile} onSignOut={logoutUser}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-[#d8dadc] bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#008f68]">Walk-in service</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6be9c2] px-3 py-1 text-xs font-bold text-[#0d1117]">
              <PillIcon /> Active workflow
            </span>
          </div>
          <h1 className="mt-2 text-xl font-bold text-[#0d1117]">Dispensing</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#5f6673]">
            Find a patient, confirm their monthly eligibility, select available medicines, then complete the claim.
          </p>
        </section>

        <StepperBar blockerFor={stepBlockers} onStepClick={setWizardStep} step={wizardStep} />

        {wizardStep === 1 && (
          <div className="prds-step-in">
            <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] px-4 py-3">
                  <div>
                    <h2 className="text-base font-bold text-[#0d1117] focus:outline-none" tabIndex={-1} data-step-heading>
                      Search Patient
                    </h2>
                    <p className="mt-1 text-sm text-[#5f6673]">
                      Search by patient name or code, then select the patient for this walk-in claim.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRegisterModal(true)}
                    className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-black px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117] ${FOCUS_RING}`}
                  >
                    <UserPlusIcon /> Register New Patient
                  </button>
                </div>

                <div
                  className={`grid gap-5 p-4 transition-[grid-template-columns] duration-500 ease-in-out ${
                    infoPatient ? "lg:grid-cols-[minmax(0,1fr)_380px]" : "lg:grid-cols-[minmax(0,1fr)]"
                  }`}
                >
                  <div className="min-w-0 space-y-4">
                    <label className="relative block">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a93a3]">
                        <SearchIcon />
                      </span>
                      <Input
                        value={patientKeyword}
                        onChange={(event) => setPatientKeyword(event.target.value)}
                        placeholder="Search patient name or code..."
                        className="pl-9"
                      />
                    </label>

                    <div
                      aria-busy={isSearchingPatients}
                      className="prds-main-scrollbar flex max-h-[520px] flex-col gap-2 overflow-auto pr-1"
                    >
                      {isSearchingPatients && (
                        <>
                          {[0, 1, 2].map((key) => (
                            <div key={key} className="h-[76px] animate-pulse rounded-xl bg-[#f8f9ff]" />
                          ))}
                          <div role="status" className="sr-only">
                            Searching patients
                          </div>
                        </>
                      )}

                      {!isSearchingPatients &&
                        patientResults.map((patient) => {
                          const claimed = claimedIds.has(patient.id);
                          const isSelectedCard = selectedPatient?.id === patient.id;
                          const patientName = formatPatientName(patient);

                          return (
                            <div
                              key={patient.id}
                              className={`relative flex w-full items-center justify-between gap-3 rounded-xl border p-3 ${
                                claimed ? "border-orange-100 bg-orange-50/60" : "border-[#e5e7eb] bg-[#f8f9ff]"
                              } ${isSelectedCard ? "border-[#6be9c2] ring-2 ring-[#6be9c2]" : ""}`}
                            >
                              <button
                                type="button"
                                aria-label={`Select ${patientName}`}
                                onClick={() => selectPatient(patient)}
                                className={`absolute inset-0 z-0 rounded-xl ${FOCUS_RING}`}
                              />

                              <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-3">
                                <PatientAvatar name={patientName} sizeClass="h-10 w-10 text-xs" />
                                <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => openPatientInfo(patient)}
                                  title={
                                    infoPatient?.id === patient.id
                                      ? "Close patient info panel"
                                      : "View patient info and claim history"
                                  }
                                  className={`pointer-events-auto -mx-1 max-w-full truncate rounded px-1 text-sm font-bold text-[#0d1117] underline-offset-2 ${FOCUS_RING}`}
                                >
                                  {patientName}
                                </button>
                                {patient.facility && (
                                  <p className="mt-0.5 truncate text-xs text-[#5f6673]">
                                    {formatPatientCode(patient.patient_code)} - {patient.facility.facility_name}
                                  </p>
                                )}
                                </div>
                              </div>

                              <span className="pointer-events-none relative z-10 shrink-0">
                                <EligibilityBadge claimedThisMonth={claimed} />
                              </span>
                            </div>
                          );
                        })}

                      {!isSearchingPatients && patientResults.length === 0 && (
                        <div className="w-full rounded-xl bg-[#f8f9ff] p-6 text-center text-sm font-medium text-[#5f6673]">
                          No patients found. Use Register New Patient to add them.
                        </div>
                      )}
                    </div>
                  </div>

                  <aside
                    aria-hidden={!infoPatient}
                    className={`min-w-0 overflow-hidden transition-all duration-500 ease-in-out ${
                      infoPatient
                        ? "max-h-[720px] opacity-100 lg:max-h-none"
                        : "pointer-events-none max-h-0 opacity-0 lg:max-h-[600px]"
                    }`}
                  >
                    {panelPatient && (
                      <div
                        key={panelPatient.id}
                        className={`h-full ${
                          panelIsClosing ? "opacity-0 transition-opacity duration-500" : "prds-fade-in"
                        }`}
                      >
                        <PatientInfoPanel
                          claimedWarning={
                            selectedClaimed && selectedPatient?.id === panelPatient.id
                              ? CLAIMED_THIS_MONTH_NOTICE
                              : ""
                          }
                          isSelected={selectedPatient?.id === panelPatient.id}
                          onClose={closePatientInfo}
                          onContinue={() => setWizardStep(2)}
                          onOpenHistory={() => setHistoryPatient(panelPatient)}
                          onSelect={() => {
                            if (panelPatient) {
                              selectPatient(panelPatient);
                            }
                          }}
                          patient={panelPatient}
                        />
                      </div>
                    )}
                  </aside>
                </div>
            </section>
          </div>
        )}

        {wizardStep === 2 && (
          <div className="prds-step-in">
            <section className="self-start rounded-xl border border-[#d8dadc] bg-white shadow-sm">
                <div className="border-b border-[#e5e7eb] px-4 py-3">
                  <h2 className="text-base font-bold text-[#0d1117] focus:outline-none" tabIndex={-1} data-step-heading>
                    Build the Claim
                  </h2>
                  <p className="mt-1 text-sm text-[#5f6673]">
                    Pick medicines from available stock, then review the quantities.
                  </p>
                </div>

                <div className="space-y-4 px-4 pb-4 pt-3">
                  <label className="relative block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a93a3]">
                      <SearchIcon />
                    </span>
                    <Input
                      value={medicineKeyword}
                      onChange={(event) => setMedicineKeyword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && medicineOptions[0]) {
                          event.preventDefault();
                          addToCart(medicineOptions[0]);
                        }
                      }}
                      placeholder="Search available medicine, brand, dosage..."
                      title="Press Enter to add the closest match"
                      className="pl-9"
                    />
                  </label>

                  {isLoadingInventory ? (
                    <>
                      <div className="h-40 animate-pulse rounded-xl bg-[#f8f9ff]" />
                      <div role="status" className="sr-only">
                        Loading available medicine stock
                      </div>
                    </>
                  ) : (
                    <div className="grid max-h-[420px] gap-2 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                      {medicineOptions.map((option) => {
                        const inCart = cart.some((line) => line.medicine_id === option.medicine_id);
                        const lowStock = option.total_quantity <= 10;

                        return (
                          <button
                            type="button"
                            key={option.medicine_id}
                            onClick={() => addToCart(option)}
                            disabled={inCart}
                            aria-label={`Add ${getMedicineLabel(option.medicine)} to claim`}
                            className={`rounded-xl border p-3 text-left transition-all duration-200 ${FOCUS_RING} ${
                              inCart
                                ? "cursor-default border-[#6be9c2] bg-[#ecfff8]"
                                : "border-[#e5e7eb] bg-[#f8f9ff] hover:-translate-y-0.5 hover:border-[#6be9c2]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-bold text-[#0d1117]">
                                  {getMedicineLabel(option.medicine)}
                                </p>
                                <p className="mt-1 text-xs text-[#5f6673]">
                                  {getMedicineFullLabel(option.medicine)}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                                  lowStock ? "bg-amber-100 text-amber-700" : "bg-[#dffbf2] text-[#008f68]"
                                }`}
                              >
                                {option.total_quantity.toLocaleString()} units
                              </span>
                            </div>
                            {inCart && (
                              <p className="mt-2 text-xs font-bold text-[#008f68]">Added to claim</p>
                            )}
                            {lowStock && !inCart && (
                              <p className="mt-2 text-xs font-bold text-amber-700">
                                Low stock — confirm remaining supply
                              </p>
                            )}
                          </button>
                        );
                      })}

                      {medicineOptions.length === 0 && (
                        <div className="col-span-full rounded-xl bg-[#f8f9ff] p-6 text-center text-sm font-medium text-[#5f6673]">
                          No medicine stock is currently available at your facility.
                        </div>
                      )}
                    </div>
                  )}

                  {cartLines.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#d8dadc] bg-[#f8f9ff] px-4 py-10 text-center">
                      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#9aa1ad]">
                        <PillIcon />
                      </span>
                      <p className="mt-3 text-sm font-bold text-[#0d1117]">No medicines added yet</p>
                      <p className="mt-1 text-sm text-[#5f6673]">
                        Select from available stock above to build this claim.
                      </p>
                    </div>
                  ) : (
                    <>
                      <ul className="space-y-3">
                        {cartLines.map((line) => {
                          const expiringSoon = line.preview.allocations.some((allocation) => {
                            const expiry = getExpiryStatus({ expiration_date: allocation.expiration_date });

                            return expiry.days !== null && expiry.days <= 30;
                          });

                          return (
                            <li
                              key={line.medicine_id}
                              className="rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4 prds-flash-once"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-[#0d1117]">
                                    {line.option ? getMedicineLabel(line.option.medicine) : "Unavailable"}
                                  </p>
                                  {line.option && (
                                    <p className="mt-0.5 text-xs text-[#5f6673]">
                                      {getMedicineFullLabel(line.option.medicine)}
                                    </p>
                                  )}
                                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    {line.preview.allocations.map((allocation) => (
                                      <span
                                        key={allocation.inventory_id}
                                        className="rounded-full border border-white bg-white px-2 py-0.5 text-[11px] font-bold text-[#42474e] shadow-sm"
                                      >
                                        {allocation.batch_number} ×{allocation.quantity.toLocaleString()}
                                      </span>
                                    ))}
                                    {expiringSoon && (
                                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                                        Expiring soon
                                      </span>
                                    )}
                                  </div>
                                  {!line.error && line.option && (
                                    <p className="mt-2 text-xs text-[#5f6673]">
                                      {line.option.total_quantity.toLocaleString()} units available
                                    </p>
                                  )}
                                  {line.error && (
                                    <p className="mt-2 text-xs font-bold text-red-600">{line.error}</p>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <button
                                    type="button"
                                    aria-label={`Decrease ${line.option ? getMedicineLabel(line.option.medicine) : "medicine"} quantity`}
                                    disabled={Number(line.quantity) <= 1}
                                    onClick={() => bumpQuantity(line.medicine_id, -1)}
                                    className={`h-11 w-11 rounded-lg border border-[#d8dadc] bg-white text-base font-bold text-[#0d1117] transition hover:bg-[#eff4ff] disabled:opacity-40 md:h-9 md:w-9 md:text-sm ${FOCUS_RING}`}
                                  >
                                    −
                                  </button>
                                  <Input
                                    aria-label={`${line.option ? getMedicineLabel(line.option.medicine) : "Medicine"} quantity`}
                                    value={line.quantity}
                                    inputMode="numeric"
                                    onChange={(event) =>
                                      updateCartQuantity(line.medicine_id, event.target.value)
                                    }
                                    onBlur={() => commitQuantity(line.medicine_id)}
                                    className="w-14 text-center tabular-nums"
                                  />
                                  <button
                                    type="button"
                                    aria-label={`Increase ${line.option ? getMedicineLabel(line.option.medicine) : "medicine"} quantity`}
                                    onClick={() => bumpQuantity(line.medicine_id, 1)}
                                    className={`h-11 w-11 rounded-lg border border-[#d8dadc] bg-white text-base font-bold text-[#0d1117] transition hover:bg-[#eff4ff] md:h-9 md:w-9 md:text-sm ${FOCUS_RING}`}
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Remove ${line.option ? getMedicineLabel(line.option.medicine) : "medicine"} from claim`}
                                    onClick={() => removeCartLine(line.medicine_id)}
                                    className={`inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#6b7280] transition hover:bg-red-50 hover:text-red-600 md:h-9 md:w-9 ${FOCUS_RING}`}
                                  >
                                    <XIcon />
                                  </button>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      <div
                        aria-live="polite"
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm"
                      >
                        <span className="font-medium text-[#5f6673]">
                          <span className="sr-only">Claim summary: </span>
                          {cartSummary.lineCount} medicine line(s)
                        </span>
                        <span className="font-bold text-[#0d1117] tabular-nums">
                          {cartSummary.totalUnits.toLocaleString()} total units
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7eb] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className={`h-10 rounded-lg bg-[#f7f6f3] px-5 text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff] ${FOCUS_RING}`}
                  >
                    Back to Patient
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep(3)}
                    disabled={!canReview}
                    title={stepBlockers(3) || undefined}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-black px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Review Claim <ArrowRightIcon />
                  </button>
                </div>
            </section>
          </div>
        )}

        {wizardStep === 3 && (
          <div className="prds-step-in">
            <section className="self-start rounded-xl border border-[#d8dadc] bg-white shadow-sm">
                <div className="border-b border-[#e5e7eb] px-4 py-3">
                  <h2 className="text-base font-bold text-[#0d1117] focus:outline-none" tabIndex={-1} data-step-heading>
                    Review &amp; Complete
                  </h2>
                  <p className="mt-1 text-sm text-[#5f6673]">
                    Verify every detail before stock is deducted.
                  </p>
                </div>

                <div className="space-y-4 px-4 pb-4 pt-3">
                  {selectedClaimed && (
                    <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700">
                      This patient already received free medicine this month. The system will reject
                      this claim.
                    </div>
                  )}

                  <section className="rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Patient</p>
                    <p className="mt-1 text-base font-bold text-[#0d1117]">
                      {formatPatientName(selectedPatient)}
                    </p>
                    <p className="mt-1 text-xs text-[#5f6673]">
                      {formatPatientCode(selectedPatient.patient_code)} ·{" "}
                      {calculateAge(selectedPatient.date_of_birth) ?? "?"} yrs ·{" "}
                      {selectedPatient.gender}
                      {selectedPatient.facility ? ` · ${selectedPatient.facility.facility_name}` : ""}
                    </p>
                  </section>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                        Dispensed By
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#0d1117]">
                        {profile?.first_name ? `${profile.first_name} ${profile.last_name}` : "Unknown user"}
                      </p>
                      <p className="mt-1 text-xs text-[#5f6673]">{profile?.role || "No role"}</p>
                    </div>
                    <div className="rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                        Total Units
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#0d1117] tabular-nums">
                        {cartSummary.totalUnits.toLocaleString()} units
                      </p>
                      <p className="mt-1 text-xs text-[#5f6673]">{cartSummary.lineCount} medicine line(s)</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-[#e5e7eb]">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="bg-[#f8f9ff] text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                        <tr>
                          <th className="px-4 py-3">Medicine</th>
                          <th className="px-4 py-3">Batches (FEFO)</th>
                          <th className="px-4 py-3 text-right">Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf0f2]">
                        {cartLines.map((line) => (
                          <tr key={line.medicine_id}>
                            <td className="px-4 py-3">
                              <p className="font-bold text-[#0d1117]">
                                {line.option ? getMedicineLabel(line.option.medicine) : "Unavailable"}
                              </p>
                              {line.option && (
                                <p className="text-xs text-[#5f6673]">
                                  {getMedicineFullLabel(line.option.medicine)}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-[#5f6673]">
                              {line.preview.allocations
                                .map(
                                  (allocation) =>
                                    `${allocation.batch_number} ×${allocation.quantity.toLocaleString()}`
                                )
                                .join(", ") || "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-[#0d1117] tabular-nums">
                              {Number(line.quantity).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7eb] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className={`h-10 rounded-lg bg-[#f7f6f3] px-5 text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff] ${FOCUS_RING}`}
                  >
                    Back to Medicines
                  </button>
                  <button
                    type="button"
                    onClick={handleComplete}
                    disabled={!canComplete || isSaving}
                    title={stepBlockers(3) || undefined}
                    className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#00a36c] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#008f68] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
                  >
                    <CheckIcon /> Complete Dispensing
                  </button>
                </div>
            </section>
          </div>
        )}
      </div>

      {historyPatient && (
        <PatientHistoryModal
          canVoid={profile?.role === "PHARMA_II"}
          onClose={() => setHistoryPatient(null)}
          onClaimsChanged={refreshEligibility}
          patient={historyPatient}
        />
      )}

      {showRegisterModal && (
        <QuickRegisterModal
          facilities={facilities}
          isCho={isCho}
          onClose={() => setShowRegisterModal(false)}
          onRegistered={(patient) => {
            setShowRegisterModal(false);
            selectPatient(patient);
          }}
          profileId={profile?.id}
        />
      )}

      {receipt && (
        <ReceiptModal onClose={closeReceipt} onExport={exportReceipt} receipt={receipt} />
      )}
    </AdminShell>
  );
}
