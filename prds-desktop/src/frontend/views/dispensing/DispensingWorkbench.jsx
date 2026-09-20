import { useCallback, useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import {
  calculateAge,
  formatPatientCode,
  formatPatientName,
} from "@shared/utils/patientUtils";
import {
  completeWalkInDispensing,
  getClaimedPatientIds,
  getFacilityMedicineStockOverview,
  getWalkInInventory,
  searchDispensingPatients,
} from "@backend/services/dispensingService";
import {
  buildDispensingCsv,
  buildFefoPreview,
  buildMedicineOptions,
  downloadCsv,
  FOLLOW_UP_ACTIONS,
  formatDispensingDateTime,
  formatTransactionNumber,
  getCartLineError,
  getDispensingStepBlocker,
  getDefaultFollowUpDate,
  getMedicineFullLabel,
  getMedicineLabel,
} from "@shared/utils/dispensingUtils";
import {
  ArrowRightIcon,
  CheckIcon,
  DispensingModal,
  FOCUS_RING,
  Input,
  PatientAvatar,
  PillIcon,
  SearchIcon,
  XIcon,
} from "./DispensingUi";

function StepperBar({ blockerFor, onStepClick, step }) {
  const steps = [
    { id: 1, label: "Patient" },
    { id: 2, label: "Medicines" },
    { id: 3, label: "Review & Release" },
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
      title="Medicine Released"
      subtitle="The release has been recorded and stock has been deducted."
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
        </div>

        <section className="rounded-xl border border-[#e5e7eb] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Patient</p>
          <p className="mt-1 text-sm font-bold text-[#0d1117]">
            {formatPatientName(receipt.patient)}{" "}
            <span className="font-medium text-[#5f6673]">
              · {formatPatientCode(receipt.patient.patient_code)}
            </span>
          </p>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Prescribed By</p>
          <p className="mt-1 text-sm font-semibold text-[#0d1117]">{receipt.prescribedBy}</p>
        </section>

        <div className="overflow-hidden rounded-xl border border-[#e5e7eb]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f8f9ff] text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3 text-right">Needed</th>
                <th className="px-4 py-3 text-right">Released</th>
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
                      {allocationIndex === 0
                        ? Number(line.needed_quantity ?? line.quantity).toLocaleString()
                        : ""}
                    </td>
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


export default function DispensingWorkbench() {
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

  const [medicineKeyword, setMedicineKeyword] = useState("");
  const [cart, setCart] = useState([]);
  const [prescribedBy, setPrescribedBy] = useState("");
  const [referralStockRows, setReferralStockRows] = useState([]);
  const [referralStockError, setReferralStockError] = useState("");
  const [isLoadingReferralStock, setIsLoadingReferralStock] = useState(false);
  const [stockModalMedicineId, setStockModalMedicineId] = useState("");

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
    const term = patientKeyword.trim();

    if (!term) {
      setPatientResults([]);
      setClaimedIds(new Set());
      setIsSearchingPatients(false);
      return;
    }

    setIsSearchingPatients(true);

    try {
      const rows = await searchDispensingPatients({
        keyword: term,
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

  const selectedClaimed = selectedPatient ? claimedIds.has(selectedPatient.id) : false;

  const referralMedicineIds = useMemo(
    () =>
      cart
        .filter(
          (line) =>
            line.follow_up_action === FOLLOW_UP_ACTIONS.refer &&
            Number(line.needed_quantity || 0) > Number(line.quantity || 0)
        )
        .map((line) => line.medicine_id),
    [cart]
  );

  const referralStockByMedicineId = useMemo(() => {
    const stock = new Map();

    referralStockRows.forEach((row) => {
      if (!stock.has(row.medicine_id)) {
        stock.set(row.medicine_id, {
          batchCount: 0,
          nearestExpiration: row.expiration_date,
          totalUnits: 0,
        });
      }

      const entry = stock.get(row.medicine_id);
      entry.batchCount += 1;
      entry.totalUnits += Number(row.quantity || 0);
      entry.nearestExpiration =
        !entry.nearestExpiration || row.expiration_date < entry.nearestExpiration
          ? row.expiration_date
          : entry.nearestExpiration;
    });

    return stock;
  }, [referralStockRows]);

  const stockModalLine = useMemo(
    () => cartLines.find((line) => line.medicine_id === stockModalMedicineId) || null,
    [cartLines, stockModalMedicineId]
  );

  useEffect(() => {
    if (wizardStep !== 3 || !selectedPatient?.facility_id || referralMedicineIds.length === 0) {
      setReferralStockRows([]);
      setReferralStockError("");
      setIsLoadingReferralStock(false);
      return;
    }

    let active = true;

    setIsLoadingReferralStock(true);
    getFacilityMedicineStockOverview({
      facilityId: selectedPatient.facility_id,
      medicineIds: referralMedicineIds,
    })
      .then((rows) => {
        if (active) {
          setReferralStockRows(rows);
          setReferralStockError("");
        }
      })
      .catch((stockError) => {
        if (active) {
          setReferralStockRows([]);
          setReferralStockError(stockError.message || "Unable to load barangay stock.");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingReferralStock(false);
        }
      });

    return () => {
      active = false;
    };
  }, [referralMedicineIds, selectedPatient?.facility_id, wizardStep]);

  const canReview = Boolean(
    selectedPatient &&
      cart.length > 0 &&
      prescribedBy.trim() &&
      cartLines.every((line) => !line.error && line.preview.shortfall === 0 && Number(line.quantity) > 0)
  );

  const canComplete = canReview && !selectedClaimed;

  const stepBlockers = (target) =>
    getDispensingStepBlocker({
      claimed: selectedClaimed,
      hasLineErrors: cartLines.some((line) => Boolean(line.error) || line.preview.shortfall > 0),
      hasPatient: Boolean(selectedPatient),
      hasPrescriber: Boolean(prescribedBy.trim()),
      lineCount: cart.length,
      step: target,
    });

  const selectPatient = (patient) => {
    if (claimedIds.has(patient.id)) {
      return;
    }

    setCart([]);
    setPrescribedBy("");
    setSelectedPatient((current) => (current?.id === patient.id ? null : patient));
  };

  const addToCart = (option) => {
    setCart((current) =>
      current.some((line) => line.medicine_id === option.medicine_id)
        ? current
        : [
            ...current,
            {
              follow_up_action: "",
              follow_up_date: "",
              medicine_id: option.medicine_id,
              needed_quantity: 1,
              quantity: 1,
              referred_facility_id: "",
            },
          ]
    );
  };

  const updateCartQuantity = (medicineId, field, value) => {
    if (value !== "" && !/^\d+$/.test(value)) {
      return;
    }

    setCart((current) =>
      current.map((line) => {
        if (line.medicine_id !== medicineId) {
          return line;
        }

        const nextValue = value === "" ? "" : Number(value);
        const nextLine = { ...line, [field]: nextValue };
        const needed = Number(nextLine.needed_quantity || 0);
        const released = Number(nextLine.quantity || 0);

        if (field === "quantity" && released > needed) {
          nextLine.needed_quantity = nextValue;
        }

        if (Number(nextLine.needed_quantity || 0) <= Number(nextLine.quantity || 0)) {
          nextLine.follow_up_action = "";
          nextLine.follow_up_date = "";
          nextLine.referred_facility_id = "";
        }

        return nextLine;
      })
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
        const needed = Math.max(Number(line.needed_quantity || 1), bounded);

        return {
          ...line,
          follow_up_action: needed > bounded ? line.follow_up_action : "",
          follow_up_date: needed > bounded ? line.follow_up_date : "",
          needed_quantity: needed,
          quantity: bounded,
          referred_facility_id: needed > bounded ? line.referred_facility_id : "",
        };
      })
    );
  };

  const updateFollowUpAction = (medicineId, action) => {
    setCart((current) =>
      current.map((line) =>
        line.medicine_id === medicineId
          ? {
              ...line,
              follow_up_action: action,
              follow_up_date:
                action === FOLLOW_UP_ACTIONS.schedule
                  ? line.follow_up_date || getDefaultFollowUpDate()
                  : "",
              referred_facility_id:
                action === FOLLOW_UP_ACTIONS.refer ? selectedPatient?.facility_id || "" : "",
            }
          : line
      )
    );
  };

  const updateFollowUpDate = (medicineId, date) => {
    setCart((current) =>
      current.map((line) =>
        line.medicine_id === medicineId ? { ...line, follow_up_date: date } : line
      )
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
        facilityId: profileFacilityId,
        items: cartLines.map((line) => ({
          follow_up_action: line.follow_up_action || null,
          follow_up_date: line.follow_up_date || null,
          medicine_id: line.medicine_id,
          needed_quantity: Number(line.needed_quantity ?? line.quantity),
          quantity: Number(line.quantity),
          referred_facility_id: line.referred_facility_id || null,
        })),
        patientId: selectedPatient.id,
        prescribedBy: prescribedBy.trim(),
      });

      setReceipt({
        dispensedAt: result?.dispensed_at || new Date().toISOString(),
        lines: cartLines,
        patient: selectedPatient,
        prescribedBy: prescribedBy.trim(),
        transactionId: result?.transaction_id,
      });
      setCart([]);
      setPrescribedBy("");
      setSelectedPatient(null);
      setClaimedIds(new Set());
      setWizardStep(1);
      await Promise.all([loadInventory(), runPatientSearch()]);
    } catch (completeError) {
      setError(completeError.message || "Unable to release the medicine.");
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
            needed_quantity: Number(line.needed_quantity ?? line.quantity),
            medicine: line.option.medicine,
            prescribed_by: receipt.prescribedBy,
            quantity: allocation.quantity,
            follow_up_action: line.follow_up_action || null,
            follow_up_date: line.follow_up_date || null,
            referred_facility: line.follow_up_action === FOLLOW_UP_ACTIONS.refer ? receipt.patient.facility : null,
          }))
        ),
        totalQuantity: receipt.lines.reduce((total, line) => total + Number(line.quantity || 0), 0),
        transactionId: receipt.transactionId,
        patient: receipt.patient,
      },
    ]);

    downloadCsv(csv, `${receipt.transactionId}-receipt.csv`);
  };

  const commitQuantity = (medicineId, field = "quantity") => {
    setCart((current) =>
      current.map((line) => {
        if (line.medicine_id !== medicineId) {
          return line;
        }

        const option = optionsById.get(medicineId);
        const ceiling = option ? option.total_quantity : null;
        const parsed = Math.max(1, Math.floor(Number(line[field]) || 1));
        const bounded = field === "quantity" && ceiling !== null ? Math.min(parsed, ceiling) : parsed;
        const nextLine = Number(line[field]) === bounded ? { ...line } : { ...line, [field]: bounded };
        const needed = Number(nextLine.needed_quantity || 0);
        const released = Number(nextLine.quantity || 0);

        if (field === "quantity" && released > needed) {
          nextLine.needed_quantity = released;
        }

        if (Number(nextLine.needed_quantity || 0) <= Number(nextLine.quantity || 0)) {
          nextLine.follow_up_action = "";
          nextLine.follow_up_date = "";
          nextLine.referred_facility_id = "";
        }

        return nextLine;
      })
    );
  };

  const renderReferralStockOverview = (line) => {
    if (isLoadingReferralStock) {
      return <p className="text-sm text-[#5f6673]">Checking barangay stock...</p>;
    }

    if (referralStockError) {
      return <p className="text-sm font-bold text-red-600">{referralStockError}</p>;
    }

    const stock = referralStockByMedicineId.get(line.medicine_id);

    if (!stock || stock.totalUnits <= 0) {
      return <p className="rounded-xl border border-dashed border-[#d8dadc] bg-[#f8f9ff] p-4 text-sm text-[#5f6673]">No available stock recorded.</p>;
    }

    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Available quantity</p>
          <p className="mt-1 text-lg font-bold text-[#0d1117] tabular-nums">{stock.totalUnits.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Batch count</p>
          <p className="mt-1 text-lg font-bold text-[#0d1117] tabular-nums">{stock.batchCount.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Nearest expiration</p>
          <p className="mt-1 text-sm font-bold text-[#0d1117]">{stock.nearestExpiration || "No date"}</p>
        </div>
      </div>
    );
  };

  const renderFollowUpControl = (line) => {
    const isPartialRelease = Number(line.needed_quantity || 0) > Number(line.quantity || 0);

    if (!isPartialRelease) {
      return <span className="text-xs font-semibold text-[#5f6673]">None</span>;
    }

    return (
      <div className="min-w-[240px] space-y-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-[#42474e]">
          <input
            name={`follow-up-${line.medicine_id}`}
            type="radio"
            checked={!line.follow_up_action}
            onChange={() => updateFollowUpAction(line.medicine_id, "")}
          />
          No follow-up recorded
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-[#42474e]">
          <input
            name={`follow-up-${line.medicine_id}`}
            type="radio"
            checked={line.follow_up_action === FOLLOW_UP_ACTIONS.schedule}
            onChange={() => updateFollowUpAction(line.medicine_id, FOLLOW_UP_ACTIONS.schedule)}
          />
          Schedule next release
        </label>
        {line.follow_up_action === FOLLOW_UP_ACTIONS.schedule && (
          <Input
            type="date"
            value={line.follow_up_date || ""}
            onChange={(event) => updateFollowUpDate(line.medicine_id, event.target.value)}
          />
        )}
        <label className="flex items-center gap-2 text-xs font-semibold text-[#42474e]">
          <input
            name={`follow-up-${line.medicine_id}`}
            type="radio"
            checked={line.follow_up_action === FOLLOW_UP_ACTIONS.refer}
            onChange={() => {
              updateFollowUpAction(line.medicine_id, FOLLOW_UP_ACTIONS.refer);
              setIsLoadingReferralStock(true);
              setStockModalMedicineId(line.medicine_id);
            }}
          />
          Refer to barangay
        </label>
        {line.follow_up_action === FOLLOW_UP_ACTIONS.refer && (
          <button
            type="button"
            onClick={() => setStockModalMedicineId(line.medicine_id)}
            className={`h-9 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-[#0d1117] transition hover:bg-[#eff4ff] ${FOCUS_RING}`}
          >
            View barangay stock
          </button>
        )}
        {line.error && <p className="text-xs font-bold text-red-600">{line.error}</p>}
      </div>
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
            Find a patient, confirm their monthly eligibility, select available medicines, then release the claim.
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
                </div>

                <div className="p-4">
                  <div className="space-y-4">
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
                              className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 ${
                                claimed
                                  ? "border-[#e5e7eb] bg-[#f4f5f7] text-[#8a93a3]"
                                  : "border-[#e5e7eb] bg-[#f8f9ff]"
                              }`}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <PatientAvatar name={patientName} sizeClass="h-10 w-10 text-xs" />
                                <div className="min-w-0">
                                  <p
                                    className={`max-w-full truncate rounded-md px-2 py-1 text-sm font-bold ${
                                      claimed
                                        ? "text-[#5f6673]"
                                        : isSelectedCard
                                          ? "bg-white text-[#0d1117] shadow-sm ring-1 ring-[#d8dadc]"
                                          : "text-[#0d1117]"
                                    }`}
                                  >
                                    {patientName}
                                  </p>
                                  {patient.address && (
                                    <p className="mt-0.5 truncate text-xs text-[#5f6673]">{patient.address}</p>
                                  )}
                                  {claimed && (
                                    <p className="mt-1 text-xs font-bold text-[#6b7280]">
                                      Monthly claim already recorded.
                                    </p>
                                  )}
                                </div>
                              </div>

                              {claimed ? (
                                <button
                                  type="button"
                                  disabled
                                  aria-label={`${patientName} cannot be selected`}
                                  className="h-9 shrink-0 cursor-not-allowed rounded-lg border border-[#d8dadc] bg-white/70 px-3 text-xs font-bold text-[#8a93a3]"
                                >
                                  Select
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  aria-label={`${isSelectedCard ? "Unselect" : "Select"} ${patientName}`}
                                  onClick={() => selectPatient(patient)}
                                  className={`h-9 shrink-0 rounded-lg px-4 text-xs font-bold shadow-sm transition ${FOCUS_RING} ${
                                    isSelectedCard
                                      ? "border border-[#d8dadc] bg-white text-[#0d1117] hover:bg-[#f7f6f3]"
                                      : "bg-black text-white hover:bg-[#0d1117]"
                                  }`}
                                >
                                  {isSelectedCard ? "Unselect" : "Select"}
                                </button>
                              )}
                            </div>
                          );
                        })}

                      {!isSearchingPatients && patientResults.length === 0 && (
                        <div className="w-full rounded-xl bg-[#f8f9ff] p-6 text-center text-sm font-medium text-[#5f6673]">
                          {patientKeyword.trim()
                            ? "No matching patients found. Register the patient in the Patient module before dispensing."
                            : "Search patient"}
                        </div>
                      )}
                    </div>

                    {selectedPatient && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d8dadc] bg-[#f8f9ff] px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-[#5f6673]">
                            Selected patient
                          </p>
                          <p className="mt-1 truncate text-sm font-bold text-[#0d1117]">
                            {formatPatientName(selectedPatient)}
                          </p>
                          {selectedPatient.address && (
                            <p className="mt-0.5 text-xs text-[#5f6673]">{selectedPatient.address}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setWizardStep(2)}
                          disabled={selectedClaimed}
                          className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-black px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
                        >
                          Continue to Medicines <ArrowRightIcon />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
            </section>
          </div>
        )}

        {wizardStep === 2 && (
          <div className="prds-step-in">
            <section className="self-start rounded-xl border border-[#d8dadc] bg-white shadow-sm">
                <div className="border-b border-[#e5e7eb] px-4 py-3">
                  <h2 className="text-base font-bold text-[#0d1117] focus:outline-none" tabIndex={-1} data-step-heading>
                    Choose medicine
                  </h2>
                  <p className="mt-1 text-sm text-[#5f6673]">
                    Pick medicines from available stock, then review the quantities.
                  </p>
                </div>

                <div className="grid gap-4 px-4 pb-4 pt-3 lg:grid-cols-[minmax(0,1fr)_480px] xl:grid-cols-[minmax(0,1fr)_540px]">
                  <section className="min-w-0 rounded-xl border border-[#e5e7eb] bg-white p-3">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-[#0d1117]">Available medicines</h3>
                        <p className="mt-0.5 text-xs text-[#5f6673]">Select from current facility stock.</p>
                      </div>
                      <span className="rounded-full bg-[#f7f6f3] px-2.5 py-1 text-xs font-bold text-[#5f6673] tabular-nums">
                        {medicineOptions.length.toLocaleString()} shown
                      </span>
                    </div>

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
                    <div className="mt-3">
                      <div className="h-40 animate-pulse rounded-xl bg-[#f8f9ff]" />
                      <div role="status" className="sr-only">
                        Loading available medicine stock
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 grid max-h-[520px] gap-2 overflow-auto pr-1 xl:grid-cols-2">
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
                                ? "cursor-default border-[#d8dadc] bg-[#f7f6f3]"
                                : "border-[#e5e7eb] bg-[#f8f9ff] hover:border-[#c7ccd3] hover:bg-white hover:shadow-sm"
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
                                  lowStock ? "bg-amber-100 text-amber-700" : "bg-[#f7f6f3] text-[#42474e]"
                                }`}
                              >
                                {option.total_quantity.toLocaleString()} units
                              </span>
                            </div>
                            {inCart && <p className="mt-2 text-xs font-bold text-[#5f6673]">Added</p>}
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
                  </section>

                  <aside className="min-w-0 rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-3 lg:sticky lg:top-4 lg:self-start">
                    <div className="mb-3">
                      <h3 className="text-sm font-bold text-[#0d1117]">Selected medicines</h3>
                      <p className="mt-0.5 text-xs text-[#5f6673]">Confirm patient, doctor, and quantities.</p>
                    </div>

                    <div className="mb-3 space-y-3">
                      {selectedPatient && (
                        <section className="rounded-xl border border-[#e5e7eb] bg-white p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                            Selected patient
                          </p>
                          <p className="mt-1 truncate text-sm font-bold text-[#0d1117]">
                            {formatPatientName(selectedPatient)}
                          </p>
                          {selectedPatient.address && (
                            <p className="mt-0.5 truncate text-xs text-[#5f6673]">{selectedPatient.address}</p>
                          )}
                        </section>
                      )}
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                          Prescribed by <span className="text-red-500">*</span>
                        </span>
                        <Input
                          value={prescribedBy}
                          onChange={(event) => setPrescribedBy(event.target.value)}
                          placeholder="Doctor name"
                          required
                        />
                      </label>
                    </div>

                  {cartLines.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#d8dadc] bg-white px-4 py-10 text-center">
                      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f6f3] text-[#9aa1ad]">
                        <PillIcon />
                      </span>
                      <p className="mt-3 text-sm font-bold text-[#0d1117]">No medicines added yet</p>
                      <p className="mt-1 text-sm text-[#5f6673]">
                        Select from available stock to prepare this release.
                      </p>
                    </div>
                  ) : (
                    <ul className="max-h-[460px] space-y-3 overflow-auto pr-1">
                        {cartLines.map((line) => {
                          const stockAfterRelease = Math.max(
                            0,
                            Number(line.option?.total_quantity || 0) - Number(line.quantity || 0)
                          );

                          return (
                            <li
                              key={line.medicine_id}
                              className="rounded-xl border border-[#e5e7eb] bg-white p-4 prds-flash-once"
                            >
                              <div className="space-y-3">
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-[#0d1117]">
                                      {line.option ? getMedicineLabel(line.option.medicine) : "Unavailable"}
                                    </p>
                                    {line.option && (
                                      <p className="mt-0.5 text-xs text-[#5f6673]">
                                        {getMedicineFullLabel(line.option.medicine)}
                                      </p>
                                    )}
                                  </div>
                                  <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                                      Needed quantity
                                    </span>
                                    <Input
                                      aria-label={`${line.option ? getMedicineLabel(line.option.medicine) : "Medicine"} needed quantity`}
                                      value={line.needed_quantity}
                                      inputMode="numeric"
                                      onChange={(event) =>
                                        updateCartQuantity(line.medicine_id, "needed_quantity", event.target.value)
                                      }
                                      onBlur={() => commitQuantity(line.medicine_id, "needed_quantity")}
                                      className="text-center tabular-nums"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    aria-label={`Remove ${line.option ? getMedicineLabel(line.option.medicine) : "medicine"} from claim`}
                                    onClick={() => removeCartLine(line.medicine_id)}
                                    className={`inline-flex h-10 w-10 items-center justify-center self-end rounded-lg text-[#6b7280] transition hover:bg-red-50 hover:text-red-600 ${FOCUS_RING}`}
                                  >
                                    <XIcon />
                                  </button>
                                </div>

                                <div className="rounded-lg bg-[#f8f9ff] p-3">
                                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                                    Release quantity
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      aria-label={`Decrease ${line.option ? getMedicineLabel(line.option.medicine) : "medicine"} quantity`}
                                      disabled={Number(line.quantity) <= 1}
                                      onClick={() => bumpQuantity(line.medicine_id, -1)}
                                      className={`h-10 w-10 rounded-lg border border-[#d8dadc] bg-white text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff] disabled:opacity-40 ${FOCUS_RING}`}
                                    >
                                      -
                                    </button>
                                    <Input
                                      aria-label={`${line.option ? getMedicineLabel(line.option.medicine) : "Medicine"} release quantity`}
                                      value={line.quantity}
                                      inputMode="numeric"
                                      onChange={(event) =>
                                        updateCartQuantity(line.medicine_id, "quantity", event.target.value)
                                      }
                                      onBlur={() => commitQuantity(line.medicine_id, "quantity")}
                                      className="h-10 w-24 text-center tabular-nums"
                                    />
                                    <button
                                      type="button"
                                      aria-label={`Increase ${line.option ? getMedicineLabel(line.option.medicine) : "medicine"} quantity`}
                                      onClick={() => bumpQuantity(line.medicine_id, 1)}
                                      className={`h-10 w-10 rounded-lg border border-[#d8dadc] bg-white text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff] ${FOCUS_RING}`}
                                    >
                                      +
                                    </button>
                                  </div>
                                  <p className="mt-2 text-xs font-medium text-[#5f6673]">
                                    Stock after release: {stockAfterRelease.toLocaleString()}
                                  </p>
                                </div>
                                {line.error && (
                                  <p className="text-xs font-bold text-red-600">{line.error}</p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                  </aside>
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
                    Review <ArrowRightIcon />
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
                    Review &amp; Release
                  </h2>
                  <p className="mt-1 text-sm text-[#5f6673]">
                    Verify every detail before the medicine is released.
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
                      {calculateAge(selectedPatient.date_of_birth) ?? "?"} yrs
                    </p>
                    <p className="mt-1 text-xs text-[#5f6673]">
                      {selectedPatient.address || "No address on file"}
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
                        Prescribed By
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#0d1117]">
                        {prescribedBy.trim() || "Not provided"}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-[#e5e7eb]">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="bg-[#f8f9ff] text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                        <tr>
                          <th className="px-4 py-3">Medicine</th>
                          <th className="px-4 py-3 text-right">Needed quantity</th>
                          <th className="px-4 py-3 text-right">Release quantity</th>
                          <th className="px-4 py-3">Follow-up</th>
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
                            <td className="px-4 py-3 text-right font-bold text-[#0d1117] tabular-nums">
                              {Number(line.needed_quantity ?? line.quantity).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-[#0d1117] tabular-nums">
                              {Number(line.quantity).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 align-top">
                              {renderFollowUpControl(line)}
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
                    <CheckIcon /> Release
                  </button>
                </div>
            </section>
          </div>
        )}
      </div>

      {stockModalLine && (
        <DispensingModal
          title="Barangay Stock Overview"
          subtitle={selectedPatient?.facility?.facility_name || "Patient barangay facility"}
          onClose={() => setStockModalMedicineId("")}
          widthClass="max-w-xl"
        >
          <div className="space-y-4">
            <section className="rounded-xl border border-[#e5e7eb] bg-white p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Medicine</p>
              <p className="mt-1 text-base font-bold text-[#0d1117]">
                {stockModalLine.option ? getMedicineLabel(stockModalLine.option.medicine) : "Unavailable"}
              </p>
              {stockModalLine.option && (
                <p className="mt-1 text-xs text-[#5f6673]">
                  {getMedicineFullLabel(stockModalLine.option.medicine)}
                </p>
              )}
            </section>
            {renderReferralStockOverview(stockModalLine)}
          </div>
        </DispensingModal>
      )}

      {receipt && (
        <ReceiptModal onClose={closeReceipt} onExport={exportReceipt} receipt={receipt} />
      )}
    </AdminShell>
  );
}
