import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { supabase } from "@backend/client/supabase";
import { getSnapshot, saveSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { isChoFacility } from "@shared/utils/facilityUtils";
import {
  calculateAge,
  formatPatientCode,
  formatPatientName,
} from "@shared/utils/patientUtils";
import {
  completeWalkInDispensing,
  getClaimedPatientIds,
  getFacilityMedicineStockOverview,
  getPatientsMonthlyClaimOverview,
  getWalkInInventory,
  searchDispensingPatients,
} from "@backend/services/dispensingService";
import { downloadExportFile } from "@frontend/services/downloadManager";
import {
  buildDispensingCsv,
  buildFefoPreview,
  buildMedicineOptions,
  filterAndSortMedicineOptions,
  FOLLOW_UP_ACTIONS,
  formatDispensingDateTime,
  formatTransactionNumber,
  getCartLineError,
  getDispensingStepBlocker,
  getDefaultFollowUpDate,
  getFollowUpDisplay,
  getMedicineFullLabel,
  getMedicineLabel,
} from "@shared/utils/dispensingUtils";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BuildingIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  DispensingModal,
  EyeIcon,
  FOCUS_RING,
  Input,
  PatientAvatar,
  PillIcon,
  SearchIcon,
  XIcon,
} from "./DispensingUi";
import DispensingTabToggle from "./DispensingTabToggle";
import DispensingHistoryView from "./DispensingHistoryView";
import UpdateFollowUpModal from "./UpdateFollowUpModal";

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
                      ? "bg-[#34769B] text-white shadow-sm"
                      : done
                        ? "border border-[#4C9F80]/30 bg-[#E2F3EC] text-[#226048]"
                        : "border border-[#CFDDE0] bg-[#F9FBFB] text-[#5B7077]"
                  }`}
                >
                  {done ? <CheckIcon /> : entry.id}
                </span>
                <span
                  className={`hidden whitespace-nowrap text-sm font-bold sm:block ${
                    active ? "text-[#1B2B30]" : done ? "text-[#226048]" : "text-[#5B7077]"
                  }`}
                >
                  {entry.label}
                </span>
              </button>
              {index < steps.length - 1 && (
                <span aria-hidden="true" className="relative mx-3 h-0.5 min-w-6 flex-1 overflow-hidden rounded-full bg-[#CFDDE0]">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full bg-[#4C9F80] transition-[width] duration-300 ${
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

function ReceiptModal({ onClose, onExport, onViewInHistory, receipt }) {
  return (
    <DispensingModal
      title="Medicine Released"
      subtitle="The release has been recorded and stock has been deducted."
      onClose={onClose}
      widthClass="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="flex flex-col items-center rounded-xl border border-[#4C9F80]/30 bg-[#E2F3EC] p-6 text-center transition-all duration-200">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#4C9F80] text-white">
            <CheckIcon />
          </span>
          <h3 className="mt-3 text-lg font-bold text-[#1B2B30] tabular-nums">
            {formatTransactionNumber(receipt.transactionId)}
          </h3>
          <p className="mt-1 text-xs text-[#5B7077]">{formatDispensingDateTime(receipt.dispensedAt)}</p>
        </div>

        <section className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#5B7077]">Patient</p>
          <p className="mt-1 text-sm font-bold text-[#1B2B30]">
            {formatPatientName(receipt.patient)}{" "}
            <span className="font-medium text-[#5B7077]">
              · {formatPatientCode(receipt.patient.patient_code)}
            </span>
          </p>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-[#5B7077]">Prescribed By</p>
          <p className="mt-1 text-sm font-semibold text-[#1B2B30]">{receipt.prescribedBy}</p>
        </section>

        <div className="overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#CFDDE0] bg-[#F9FBFB] text-[11px] font-bold uppercase tracking-wider text-[#5B7077]">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3 text-right">Needed</th>
                <th className="px-4 py-3 text-right">Released</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#CFDDE0]/40">
              {receipt.lines.flatMap((line) =>
                line.preview.allocations.map((allocation, allocationIndex) => (
                  <tr key={`${line.medicine_id}-${allocation.inventory_id}`}>
                    <td className="px-4 py-3 font-bold text-[#1B2B30]">
                      {allocationIndex === 0 ? (
                        <div>
                          <p>{getMedicineLabel(line.option.medicine)}</p>
                          {line.follow_up_action && (
                            <span className="mt-1 inline-block rounded bg-[#E2F3EC] px-2 py-0.5 text-[10px] font-semibold text-[#226048] border border-[#4C9F80]/25">
                              {getFollowUpDisplay(line)}
                            </span>
                          )}
                        </div>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#5B7077]">{allocation.batch_number}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#1B2B30] tabular-nums">
                      {allocationIndex === 0
                        ? Number(line.needed_quantity ?? line.quantity).toLocaleString()
                        : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-[#1B2B30] tabular-nums">
                      {allocation.quantity.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#CFDDE0] pt-4">
          <button
            type="button"
            onClick={onExport}
            className={`btn-secondary h-10 rounded-lg px-5 text-sm font-bold shadow-xs transition cursor-pointer ${FOCUS_RING}`}
          >
            Export
          </button>
          <div className="flex items-center gap-2">
            {onViewInHistory && (
              <button
                type="button"
                onClick={onViewInHistory}
                className={`btn-secondary h-10 inline-flex items-center gap-1.5 rounded-lg px-4 text-sm font-bold shadow-xs transition cursor-pointer ${FOCUS_RING}`}
              >
                View in History
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`btn-primary inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-bold text-white shadow-sm transition cursor-pointer ${FOCUS_RING}`}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </DispensingModal>
  );
}

export default function DispensingWorkbench() {
  const { profile } = useAuth();
  const isBhw = profile?.role === "BHW";

  const [facilities, setFacilities] = useState(() => getSnapshot(STORAGE_KEYS.FACILITIES, []));

  useEffect(() => {
    let active = true;
    const cached = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    if (cached && cached.length > 0) {
      setFacilities(cached);
    }
    supabase
      .from("facilities")
      .select("id, facility_name, facility_code, facility_type, status, address")
      .eq("status", "ACTIVE")
      .then(({ data, error }) => {
        if (!error && data && active) {
          setFacilities(data);
          saveSnapshot(STORAGE_KEYS.FACILITIES, data);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const choFacility = useMemo(() => {
    const list = facilities.length > 0 ? facilities : getSnapshot(STORAGE_KEYS.FACILITIES, []);
    return (
      list.find(
        (f) =>
          f.facility_code === "CHO-NAGA" ||
          f.facility_code === "CHO" ||
          f.facility_type === "CHO" ||
          isChoFacility(f)
      ) || null
    );
  }, [facilities]);

  const profileFacilityId = useMemo(() => {
    if (profile?.facility_id) return profile.facility_id;
    return choFacility?.id || null;
  }, [profile?.facility_id, choFacility?.id]);

  const currentFacility = useMemo(() => {
    return (
      profile?.facility ||
      facilities.find((f) => f.id === profileFacilityId) ||
      null
    );
  }, [profile?.facility, facilities, profileFacilityId]);

  const isDispensingFromCho = useMemo(() => {
    if (isBhw) return false;
    return isChoFacility(currentFacility);
  }, [isBhw, currentFacility]);

  // Wizard step
  const [wizardStep, setWizardStep] = useState(1);
  const [activeTab, setActiveTab] = useState("DISPENSE"); // "DISPENSE" | "HISTORY"

  const [inventoryRows, setInventoryRows] = useState([]);
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);
  const [error, setError] = useState("");

  // Patient search state
  const [patientKeyword, setPatientKeyword] = useState("");
  const [patientResults, setPatientResults] = useState([]);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const [patientsOverview, setPatientsOverview] = useState(() => new Map());
  const [claimedIds, setClaimedIds] = useState(() => new Set());
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [activePatientClaim, setActivePatientClaim] = useState(null);

  // If dispensing from Barangay Health Center (BHW or HC), refer to City Health Office (CHO).
  // If dispensing from CHO, refer to the patient's assigned Barangay Health Center.
  const defaultReferralFacility = useMemo(() => {
    if (!isDispensingFromCho) {
      return (
        choFacility || {
          id: "CHO",
          facility_name: "City Health Office",
          facility_code: "CHO-NAGA",
          facility_type: "CHO",
        }
      );
    }
    return selectedPatient?.facility || null;
  }, [isDispensingFromCho, choFacility, selectedPatient?.facility]);

  // Cart & dispensing state
  const [medicineKeyword, setMedicineKeyword] = useState("");
  const [cart, setCart] = useState([]);
  const [prescribedBy, setPrescribedBy] = useState("");
  const [referralStockRows, setReferralStockRows] = useState([]);
  const [referralStockError, setReferralStockError] = useState("");
  const [isLoadingReferralStock, setIsLoadingReferralStock] = useState(false);
  const [stockModalMedicineId, setStockModalMedicineId] = useState("");
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [isUpdateFollowUpModalOpen, setIsUpdateFollowUpModalOpen] = useState(false);
  const [updateFollowUpPatientData, setUpdateFollowUpPatientData] = useState(null);

  const [receipt, setReceipt] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const location = useLocation();

  useEffect(() => {
    if (location.state?.prefillMedicineName) {
      setActiveTab("DISPENSE");
      setMedicineKeyword(location.state.prefillMedicineName);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

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

  // Keep inventory fresh when arriving at the Medicines selection step
  useEffect(() => {
    if (wizardStep === 2) {
      loadInventory();
    }
  }, [wizardStep, loadInventory]);

  // Sync with live inventory changes across facilities/modules
  useEffect(() => {
    const channel = supabase
      .channel("dispensing-inventory-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        () => {
          loadInventory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadInventory]);

  const runPatientSearch = useCallback(async () => {
    const term = patientKeyword.trim();

    if (!term) {
      setPatientResults([]);
      setPatientsOverview(new Map());
      setClaimedIds(new Set());
      setIsSearchingPatients(false);
      return;
    }

    setIsSearchingPatients(true);

    try {
      const rows = await searchDispensingPatients({
        keyword: term,
        facilityId: isBhw ? profileFacilityId : null,
      });
      setPatientResults(rows);

      const patientIds = rows.map((row) => row.id);
      const overviewMap = await getPatientsMonthlyClaimOverview(patientIds, {
        currentFacilityId: profileFacilityId,
        isBhw,
      });
      setPatientsOverview(overviewMap);

      const blockedIds = [];
      overviewMap.forEach((entry, pId) => {
        if (entry.isBlocked) {
          blockedIds.push(pId);
        }
      });
      setClaimedIds(new Set(blockedIds));
    } catch (searchError) {
      setError(searchError.message || "Unable to search patients.");
    } finally {
      setIsSearchingPatients(false);
    }
  }, [patientKeyword, isBhw, profileFacilityId]);

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

  // All eligible available non-expired stock in facility inventory
  const allAvailableMedicines = useMemo(
    () => buildMedicineOptions(inventoryRows, ""),
    [inventoryRows]
  );

  const optionsById = useMemo(
    () => new Map(allAvailableMedicines.map((option) => [option.medicine_id, option])),
    [allAvailableMedicines]
  );

  // Only display medicine cards when the user is actively searching
  const isSearchActive = Boolean(medicineKeyword.trim());

  const displayedMedicineOptions = useMemo(() => {
    if (!isSearchActive) {
      return [];
    }

    return filterAndSortMedicineOptions({
      options: allAvailableMedicines,
      keyword: medicineKeyword,
      sortBy: "NAME_ASC",
    });
  }, [isSearchActive, allAvailableMedicines, medicineKeyword]);

  const cartLines = useMemo(
    () =>
      cart.map((line) => {
        const option =
          optionsById.get(line.medicine_id) ||
          allAvailableMedicines.find((entry) => entry.medicine_id === line.medicine_id) ||
          null;

        const patientClaim = line.is_existing_claim
          ? {
              is_completed: false,
              needed_quantity: line.needed_quantity,
              remaining_quantity: line.remaining_quantity,
              released_quantity: line.previous_released || 0,
            }
          : null;

        return {
          ...line,
          error: option
            ? getCartLineError({ line, medicineOptions: [option], patientClaim })
            : "This medicine is no longer in stock.",
          option,
          preview: option ? buildFefoPreview(option.batches, line.quantity) : { allocations: [], shortfall: 0 },
        };
      }),
    [cart, allAvailableMedicines, optionsById]
  );

  const selectedClaimed = selectedPatient ? claimedIds.has(selectedPatient.id) : false;

  const unreleasedMedicineIds = useMemo(
    () =>
      cart
        .filter((line) => {
          const needed = Number(line.needed_quantity || line.quantity || 0);
          const released = Number(line.previous_released || 0) + Number(line.quantity || 0);
          return needed > released;
        })
        .map((line) => line.medicine_id),
    [cart]
  );

  const partiallyReleasedLines = useMemo(
    () =>
      cartLines.filter((line) => {
        const needed = Number(line.needed_quantity ?? line.quantity ?? 0);
        const released = Number(line.previous_released || 0) + Number(line.quantity || 0);
        return needed > released;
      }),
    [cartLines]
  );

  const hasPartialReleases = partiallyReleasedLines.length > 0;

  const referralStockByMedicineId = useMemo(() => {
    const stock = new Map();

    referralStockRows.forEach((row) => {
      if (!stock.has(row.medicine_id)) {
        stock.set(row.medicine_id, {
          batchCount: 0,
          batches: [],
          nearestExpiration: row.expiration_date,
          totalUnits: 0,
        });
      }

      const entry = stock.get(row.medicine_id);
      entry.batchCount += 1;
      entry.totalUnits += Number(row.quantity || 0);
      entry.batches.push({
        id: row.id,
        batch_number: row.batch_number,
        expiration_date: row.expiration_date,
        quantity: Number(row.quantity || 0),
      });
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

  const targetReferralFacilityId = defaultReferralFacility?.id;

  useEffect(() => {
    if (wizardStep !== 3 || !targetReferralFacilityId || unreleasedMedicineIds.length === 0) {
      setReferralStockRows([]);
      setReferralStockError("");
      setIsLoadingReferralStock(false);
      return;
    }

    let active = true;

    setIsLoadingReferralStock(true);
    getFacilityMedicineStockOverview({
      facilityId: targetReferralFacilityId,
      medicineIds: unreleasedMedicineIds,
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
          setReferralStockError(
            stockError.message ||
              `Unable to load ${isDispensingFromCho ? "barangay" : "City Health Office"} stock.`
          );
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
  }, [unreleasedMedicineIds, targetReferralFacilityId, wizardStep, isDispensingFromCho]);

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

  const selectPatient = (patient, explicitOverview = null) => {
    const overview = explicitOverview || patientsOverview.get(patient.id);

    if (overview?.isBlocked) {
      return;
    }

    if (selectedPatient?.id === patient.id) {
      setSelectedPatient(null);
      setActivePatientClaim(null);
      setCart([]);
      setPrescribedBy("");
      return;
    }

    setSelectedPatient(patient);
    setActivePatientClaim(overview || null);

    if (overview?.hasPartial) {
      const pendingItems = overview.breakdown.filter((b) => !b.is_completed);
      const initialCart = pendingItems.map((item) => {
        const option = buildMedicineOptions(inventoryRows, "").find(
          (entry) => entry.medicine_id === item.medicine_id
        );
        const stock = option ? option.total_quantity : 0;
        const initialRelease = Math.min(item.remaining_quantity, Math.max(1, stock));

        return {
          follow_up_action: "",
          follow_up_date: "",
          is_existing_claim: true,
          medicine_id: item.medicine_id,
          needed_quantity: item.needed_quantity,
          previous_released: item.released_quantity,
          quantity: stock > 0 ? initialRelease : 1,
          referred_facility_id: "",
          remaining_quantity: item.remaining_quantity,
        };
      });

      setCart(initialCart);
      const doctor = pendingItems.find((p) => p.prescribed_by)?.prescribed_by;
      setPrescribedBy(doctor || "");
    } else {
      setCart([]);
      setPrescribedBy("");
    }
  };

  const addToCart = (option) => {
    const existingBreakdownItem = activePatientClaim?.breakdown?.find(
      (b) => b.medicine_id === option.medicine_id
    );

    if (existingBreakdownItem) {
      if (existingBreakdownItem.is_completed) {
        return;
      }

      setCart((current) =>
        current.some((line) => line.medicine_id === option.medicine_id)
          ? current
          : [
              ...current,
              {
                follow_up_action: "",
                follow_up_date: "",
                is_existing_claim: true,
                medicine_id: option.medicine_id,
                needed_quantity: existingBreakdownItem.needed_quantity,
                previous_released: existingBreakdownItem.released_quantity,
                quantity: Math.min(
                  existingBreakdownItem.remaining_quantity,
                  Math.max(1, option.total_quantity)
                ),
                referred_facility_id: "",
                remaining_quantity: existingBreakdownItem.remaining_quantity,
              },
            ]
      );
    } else {
      setCart((current) =>
        current.some((line) => line.medicine_id === option.medicine_id)
          ? current
          : [
              ...current,
              {
                follow_up_action: "",
                follow_up_date: "",
                is_existing_claim: false,
                medicine_id: option.medicine_id,
                needed_quantity: 1,
                previous_released: 0,
                quantity: 1,
                referred_facility_id: "",
                remaining_quantity: null,
              },
            ]
      );
    }
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

        if (field === "needed_quantity" && line.is_existing_claim) {
          return line;
        }

        const nextValue = value === "" ? "" : Number(value);
        const nextLine = { ...line, [field]: nextValue };

        if (line.is_existing_claim) {
          if (field === "quantity" && nextValue !== "" && nextValue > line.remaining_quantity) {
            nextLine.quantity = line.remaining_quantity;
          }
        } else {
          const needed = Number(nextLine.needed_quantity || 0);
          const released = Number(nextLine.quantity || 0);
          if (field === "quantity" && released > needed) {
            nextLine.needed_quantity = nextValue;
          }
        }

        const totalReleasedSoFar = (line.previous_released || 0) + Number(nextLine.quantity || 0);
        if (Number(nextLine.needed_quantity || 0) <= totalReleasedSoFar) {
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
        const stockCeiling = option ? option.total_quantity : null;
        const maxAllowed = line.is_existing_claim
          ? Math.min(
              line.remaining_quantity,
              stockCeiling !== null ? stockCeiling : line.remaining_quantity
            )
          : stockCeiling;

        const next = Number(line.quantity || 1) + delta;
        const bounded = maxAllowed !== null ? Math.min(Math.max(1, next), maxAllowed) : Math.max(1, next);
        const needed = line.is_existing_claim
          ? line.needed_quantity
          : Math.max(Number(line.needed_quantity || 1), bounded);

        const totalReleasedSoFar = (line.previous_released || 0) + bounded;
        const hasBalance = Number(needed || 0) > totalReleasedSoFar;

        return {
          ...line,
          follow_up_action: hasBalance ? line.follow_up_action : "",
          follow_up_date: hasBalance ? line.follow_up_date : "",
          needed_quantity: needed,
          quantity: bounded,
          referred_facility_id: hasBalance ? line.referred_facility_id : "",
        };
      })
    );
  };

  const commitQuantity = (medicineId, field = "quantity") => {
    setCart((current) =>
      current.map((line) => {
        if (line.medicine_id !== medicineId) {
          return line;
        }

        if (field === "needed_quantity" && line.is_existing_claim) {
          return line;
        }

        const option = optionsById.get(medicineId);
        const stockCeiling = option ? option.total_quantity : null;
        const maxAllowed = line.is_existing_claim
          ? Math.min(
              line.remaining_quantity,
              stockCeiling !== null ? stockCeiling : line.remaining_quantity
            )
          : stockCeiling;

        const parsed = Math.max(1, Math.floor(Number(line[field]) || 1));
        const bounded = field === "quantity" && maxAllowed !== null ? Math.min(parsed, maxAllowed) : parsed;
        const nextLine = Number(line[field]) === bounded ? { ...line } : { ...line, [field]: bounded };
        const needed = Number(nextLine.needed_quantity || 0);
        const released = Number(nextLine.quantity || 0);

        if (!line.is_existing_claim && field === "quantity" && released > needed) {
          nextLine.needed_quantity = released;
        }

        const totalReleasedSoFar = (line.previous_released || 0) + Number(nextLine.quantity || 0);
        if (Number(nextLine.needed_quantity || 0) <= totalReleasedSoFar) {
          nextLine.follow_up_action = "";
          nextLine.follow_up_date = "";
          nextLine.referred_facility_id = "";
        }

        return nextLine;
      })
    );
  };

  const getPresetDate = (days) => {
    const target = new Date();
    target.setDate(target.getDate() + days);
    return target.toISOString().slice(0, 10);
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
              referred_facility:
                action === FOLLOW_UP_ACTIONS.refer ? defaultReferralFacility : null,
              referred_facility_id:
                action === FOLLOW_UP_ACTIONS.refer ? defaultReferralFacility?.id || "" : "",
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
          referred_facility_id:
            line.referred_facility_id ||
            (line.follow_up_action === FOLLOW_UP_ACTIONS.refer ? defaultReferralFacility?.id : null),
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
      setActivePatientClaim(null);
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
            referred_facility:
              line.follow_up_action === FOLLOW_UP_ACTIONS.refer
                ? (line.referred_facility || defaultReferralFacility)
                : null,
          }))
        ),
        totalQuantity: receipt.lines.reduce((total, line) => total + Number(line.quantity || 0), 0),
        transactionId: receipt.transactionId,
        patient: receipt.patient,
      },
    ]);

    downloadExportFile({
      filename: `${receipt.transactionId}-receipt`,
      csv,
    });
  };

  const renderReferralStockOverview = (line) => {
    const destinationShortName = isDispensingFromCho ? "Barangay Health Center" : "City Health Office (CHO)";
    const destinationFullName =
      defaultReferralFacility?.facility_name || destinationShortName;

    if (isLoadingReferralStock) {
      return (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-[#CFDDE0] bg-[#F9FBFB] p-5 text-sm text-[#5B7077]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#34769B] border-t-transparent" />
          <span>Checking stock availability at {destinationFullName}...</span>
        </div>
      );
    }

    if (referralStockError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
          {referralStockError}
        </div>
      );
    }

    const totalReleasedSoFar = Number(line.previous_released || 0) + Number(line.quantity || 0);
    const needed = Number(line.needed_quantity ?? line.quantity ?? 0);
    const remainingAfterThisRelease = Math.max(0, needed - totalReleasedSoFar);

    const stock = referralStockByMedicineId.get(line.medicine_id);
    const totalUnits = stock ? stock.totalUnits : 0;
    const isFullyCovered = totalUnits >= remainingAfterThisRelease;
    const hasBatches = stock?.batches && stock.batches.length > 0;

    return (
      <div className="space-y-3.5">
        {/* Medicine & Balance Card */}
        <div className="rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Medicine</p>
              <p className="mt-0.5 text-sm font-bold text-[#0d1117] leading-snug">
                {line.option ? getMedicineLabel(line.option.medicine) : "Unavailable"}
              </p>
              {line.option && (
                <p className="mt-0.5 text-xs text-[#5f6673]">
                  {getMedicineFullLabel(line.option.medicine)}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Unreleased</p>
              <span className="mt-0.5 inline-flex items-center rounded-lg bg-[#fdf3e9] px-2.5 py-1 text-xs font-black text-[#965315] border border-[#dc8939]/30">
                {remainingAfterThisRelease} {remainingAfterThisRelease === 1 ? "unit" : "units"}
              </span>
            </div>
          </div>
        </div>

        {/* Compact Stock Status Banner */}
        <div
          className={`flex items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs ${
            totalUnits <= 0
              ? "border-[#D9826B]/30 bg-[#FBE9E3] text-[#8F3F2B]"
              : isFullyCovered
              ? "border-[#4C9F80]/30 bg-[#E2F3EC] text-[#226048]"
              : "border-[#34769B]/30 bg-[#E3EEF5] text-[#1F4A66]"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                totalUnits <= 0
                  ? "bg-[#D9826B]"
                  : isFullyCovered
                  ? "bg-[#4C9F80]"
                  : "bg-[#34769B]"
              }`}
            >
              {totalUnits <= 0 ? "✕" : isFullyCovered ? "✓" : "!"}
            </span>
            <span className="font-semibold">
              {totalUnits <= 0
                ? `0 units available at ${destinationShortName}`
                : isFullyCovered
                ? `Stock available (${totalUnits.toLocaleString()} units available)`
                : `Partial stock: ${totalUnits.toLocaleString()} of ${remainingAfterThisRelease} units available`}
            </span>
          </div>

          {stock?.nearestExpiration && totalUnits > 0 && (
            <span className="shrink-0 text-[11px] font-medium text-[#5f6673]">
              Exp: {stock.nearestExpiration}
            </span>
          )}
        </div>

        {/* Batch Breakdown Table */}
        {hasBatches ? (
          <div className="overflow-hidden rounded-xl border border-[#e5e7eb]">
            <div className="border-b border-[#e5e7eb] bg-[#f8f9ff] px-3.5 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#6b7280]">
                Active Batches ({destinationShortName})
              </p>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/80 bg-white text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3.5 py-2">Batch / Lot #</th>
                  <th className="px-3.5 py-2 text-right">Available Qty</th>
                  <th className="px-3.5 py-2 text-right">Expiration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f2]">
                {stock.batches.map((batch) => (
                  <tr key={batch.id || batch.batch_number}>
                    <td className="px-3.5 py-2 font-mono font-bold text-[#0d1117]">
                      {batch.batch_number || "No Batch #"}
                    </td>
                    <td className="px-3.5 py-2 text-right font-bold text-[#0d1117] tabular-nums">
                      {batch.quantity.toLocaleString()}
                    </td>
                    <td className="px-3.5 py-2 text-right text-[#5f6673]">
                      {batch.expiration_date || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : totalUnits <= 0 ? (
          <div className="rounded-xl border border-dashed border-[#d8dadc] p-4 text-center text-xs text-[#5f6673]">
            No batches available at {destinationFullName}. Consider scheduling a return date instead.
          </div>
        ) : null}

        {/* Modal Action Footer */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => setStockModalMedicineId("")}
            className={`btn-primary h-9 rounded-lg px-5 text-xs font-bold text-white shadow-xs transition cursor-pointer ${FOCUS_RING}`}
          >
            Got It
          </button>
        </div>
      </div>
    );
  };

  const renderFollowUpOptions = (line, remainingAfterThisRelease) => {
    const destinationName =
      defaultReferralFacility?.facility_name ||
      (isDispensingFromCho ? "Barangay Health Center" : "City Health Office (CHO)");
    const destinationShortName = isDispensingFromCho ? "Barangay" : "CHO";
    const referralActionLabel = isDispensingFromCho
      ? `Refer to barangay${defaultReferralFacility?.facility_name ? ` - ${defaultReferralFacility.facility_name}` : ""}`
      : "Refer to City Health Office (CHO)";

    const stock = referralStockByMedicineId.get(line.medicine_id);
    const hasStock = Boolean(stock);
    const availableUnits = stock ? stock.totalUnits : 0;

    return (
      <div className="space-y-2">
        {/* Option 1: No Follow-Up */}
        <label
          className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition ${
            !line.follow_up_action
              ? "border-[#34769B] bg-[#E3EEF5]/40 ring-1 ring-[#34769B]"
              : "border-[#CFDDE0] bg-[#F9FBFB] hover:border-[#34769B]/40 hover:bg-[#E5EFF1]"
          }`}
        >
          <input
            name={`follow-up-${line.medicine_id}`}
            type="radio"
            checked={!line.follow_up_action}
            onChange={() => updateFollowUpAction(line.medicine_id, "")}
            className="mt-0.5 text-[#34769B] focus:ring-[#34769B]"
          />
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-[#1B2B30]">No follow-up recorded</span>
            <span className="block text-[11px] text-[#5B7077]">
              Close claim without scheduling or referral
            </span>
          </div>
        </label>

        {/* Option 2: Schedule Return Release */}
        <div
          className={`rounded-lg border p-2.5 transition ${
            line.follow_up_action === FOLLOW_UP_ACTIONS.schedule
              ? "border-[#34769B] bg-[#E3EEF5]/40 ring-1 ring-[#34769B]"
              : "border-[#CFDDE0] bg-[#F9FBFB] hover:border-[#34769B]/40 hover:bg-[#E5EFF1]"
          }`}
        >
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              name={`follow-up-${line.medicine_id}`}
              type="radio"
              checked={line.follow_up_action === FOLLOW_UP_ACTIONS.schedule}
              onChange={() => updateFollowUpAction(line.medicine_id, FOLLOW_UP_ACTIONS.schedule)}
              className="mt-0.5 text-[#34769B] focus:ring-[#34769B]"
            />
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-[#1B2B30]">Schedule next release</span>
              <span className="block text-[11px] text-[#5B7077]">
                Patient returns to this health center on a set date
              </span>
            </div>
          </label>

          {line.follow_up_action === FOLLOW_UP_ACTIONS.schedule && (
            <div className="mt-2.5 space-y-2 border-t border-[#CFDDE0] pt-2">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={line.follow_up_date || ""}
                  onChange={(event) => updateFollowUpDate(line.medicine_id, event.target.value)}
                  className="h-8 text-xs font-medium"
                />
              </div>
              {/* Date Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => updateFollowUpDate(line.medicine_id, getPresetDate(7))}
                  className="btn-secondary rounded-md px-2 py-0.5 text-[10px] font-bold shadow-xs transition cursor-pointer"
                >
                  +7 Days (Next week)
                </button>
                <button
                  type="button"
                  onClick={() => updateFollowUpDate(line.medicine_id, getPresetDate(14))}
                  className="btn-secondary rounded-md px-2 py-0.5 text-[10px] font-bold shadow-xs transition cursor-pointer"
                >
                  +14 Days
                </button>
                <button
                  type="button"
                  onClick={() => updateFollowUpDate(line.medicine_id, getPresetDate(30))}
                  className="btn-secondary rounded-md px-2 py-0.5 text-[10px] font-bold shadow-xs transition cursor-pointer"
                >
                  +30 Days
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Option 3: Refer to Facility (City Health Office or Barangay) */}
        <div
          className={`rounded-lg border p-2.5 transition ${
            line.follow_up_action === FOLLOW_UP_ACTIONS.refer
              ? "border-[#34769B] bg-[#E3EEF5]/40 ring-1 ring-[#34769B]"
              : "border-[#CFDDE0] bg-[#F9FBFB] hover:border-[#34769B]/40 hover:bg-[#E5EFF1]"
          }`}
        >
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              name={`follow-up-${line.medicine_id}`}
              type="radio"
              checked={line.follow_up_action === FOLLOW_UP_ACTIONS.refer}
              onChange={() => updateFollowUpAction(line.medicine_id, FOLLOW_UP_ACTIONS.refer)}
              className="mt-0.5 text-[#34769B] focus:ring-[#34769B]"
            />
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-[#1B2B30]">{referralActionLabel}</span>
              <span className="block text-[11px] text-[#5B7077]">
                {destinationName}
              </span>
            </div>
          </label>

          {/* Live Stock Availability Preview & Details Link */}
          <div className="mt-2 space-y-1.5 border-t border-[#CFDDE0] pt-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              {isLoadingReferralStock ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#5B7077] animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-[#5B7077]"></span>
                  Checking {destinationShortName} stock...
                </span>
              ) : hasStock && availableUnits >= remainingAfterThisRelease ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-[#E2F3EC] px-2 py-0.5 text-[11px] font-bold text-[#226048]">
                  <CheckIcon /> {availableUnits.toLocaleString()} units available at {destinationShortName}
                </span>
              ) : hasStock && availableUnits > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-[#E3EEF5] px-2 py-0.5 text-[11px] font-bold text-[#1F4A66]">
                  ⚠ Only {availableUnits.toLocaleString()} units at {destinationShortName} (Partial)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-[#FBE9E3] px-2 py-0.5 text-[11px] font-bold text-[#8F3F2B]">
                  ✕ 0 units available at {destinationShortName}
                </span>
              )}

              <button
                type="button"
                onClick={() => setStockModalMedicineId(line.medicine_id)}
                className="btn-secondary inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold shadow-xs transition cursor-pointer"
                title={`View detailed batch list and expiration dates at ${destinationName}`}
              >
                <EyeIcon /> View {destinationShortName} Stock
              </button>
            </div>
          </div>
        </div>

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

        {/* Top Header Card */}
        <section className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] px-5 py-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#34769B]">
                  Dispensing Management
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E3EEF5] px-3 py-1 text-xs font-bold text-[#1F4A66]">
                  <PillIcon /> {isDispensingFromCho ? "CHO Medicine Release" : "Barangay Health Center Release"}
                </span>
              </div>
              <h1 className="mt-2 text-xl font-bold text-[#1B2B30]">
                {activeTab === "DISPENSE" ? "Dispensing" : "Dispensing History"}
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-[#5B7077]">
                {activeTab === "DISPENSE"
                  ? "Find a patient, check their monthly medicine status, select available medicines, then release the claim."
                  : "Search, audit, and inspect past dispensing transactions by patient code, name, dispensing ID, or medicine."}
              </p>
            </div>

            <div className="shrink-0">
              <DispensingTabToggle
                activeTab={activeTab}
                onSelectTab={setActiveTab}
              />
            </div>
          </div>
        </section>

        {activeTab === "HISTORY" ? (
          <DispensingHistoryView
            facilities={facilities}
            facilityId={profileFacilityId}
            isCho={isDispensingFromCho}
          />
        ) : (
          <>
            {/* Stepper Progress */}
            <StepperBar blockerFor={stepBlockers} onStepClick={setWizardStep} step={wizardStep} />

        {/* STEP 1: PATIENT SEARCH */}
        {wizardStep === 1 && (
          <div className="prds-step-in">
            <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] px-4 py-3">
                <div>
                  <h2
                    className="text-base font-bold text-[#0d1117] focus:outline-none"
                    tabIndex={-1}
                    data-step-heading
                  >
                    Search Patient
                  </h2>
                  <p className="mt-1 text-sm text-[#5f6673]">
                    Search by patient name or code. Patients with pending follow-up schedules remain selectable.
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
                    className="prds-main-scrollbar flex max-h-[520px] flex-col gap-2.5 overflow-auto pr-1"
                  >
                    {isSearchingPatients && (
                      <>
                        {[0, 1, 2].map((key) => (
                          <div key={key} className="h-[84px] animate-pulse rounded-xl bg-[#f8f9ff]" />
                        ))}
                        <div role="status" className="sr-only">
                          Searching patients
                        </div>
                      </>
                    )}

                    {!isSearchingPatients &&
                      patientResults.map((patient) => {
                        const overview = patientsOverview.get(patient.id);
                        const isBlocked = overview?.isBlocked ?? claimedIds.has(patient.id);
                        const status = overview?.status;
                        const isSelectedCard = selectedPatient?.id === patient.id;
                        const patientName = formatPatientName(patient);

                        return (
                          <div
                            key={patient.id}
                            className={`flex w-full flex-col gap-3 rounded-xl border p-4 transition ${
                              isBlocked
                                ? "border-[#CFDDE0] bg-[#E5EFF1]/60 opacity-85"
                                : isSelectedCard
                                  ? "border-[#34769B] bg-[#E3EEF5]/40 ring-1 ring-[#34769B]"
                                  : "border-[#CFDDE0] bg-[#F9FBFB] hover:border-[#34769B]/40 hover:bg-[#E5EFF1]/40"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <PatientAvatar name={patientName} sizeClass="h-10 w-10 text-xs" />
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-bold text-[#1B2B30] truncate">
                                      {patientName}
                                    </p>
                                    <span className="font-mono text-xs text-[#5B7077]">
                                      {formatPatientCode(patient.patient_code)}
                                    </span>
                                  </div>
                                  {patient.address && (
                                    <p className="mt-0.5 truncate text-xs text-[#5B7077]">{patient.address}</p>
                                  )}
                                </div>
                              </div>

                              {/* Status Badge */}
                              <div className="shrink-0">
                                {status?.code === "COMPLETED" ? (
                                  <span className="inline-flex items-center rounded-full bg-[#E5EFF1] px-2.5 py-1 text-xs font-bold text-[#5B7077]">
                                    Already received all medicines for this month
                                  </span>
                                ) : status?.code === "SCHEDULED_AT_CHO" ? (
                                  <span className="inline-flex items-center rounded-full bg-[#FBE9E3] border border-[#D9826B]/30 px-2.5 py-1 text-xs font-bold text-[#8F3F2B]">
                                    {status.label}
                                  </span>
                                ) : status?.code === "PARTIAL_SCHEDULED" ? (
                                  <span className="inline-flex items-center rounded-full bg-[#FBE9E3] border border-[#D9826B]/30 px-2.5 py-1 text-xs font-bold text-[#8F3F2B]">
                                    {status.label}
                                  </span>
                                ) : status?.code === "PARTIAL_REFERRED" ? (
                                  <span className="inline-flex items-center rounded-full bg-[#E3EEF5] border border-[#34769B]/30 px-2.5 py-1 text-xs font-bold text-[#1F4A66]">
                                    {status.label}
                                  </span>
                                ) : status?.code === "REFERRED_OTHER_BARANGAY" ? (
                                  <span className="inline-flex items-center rounded-full bg-[#E3EEF5] border border-[#34769B]/30 px-2.5 py-1 text-xs font-bold text-[#1F4A66]">
                                    {status.label}
                                  </span>
                                ) : status?.code === "PARTIAL_READY" ? (
                                  <span className="inline-flex items-center rounded-full bg-[#E2F3EC] border border-[#4C9F80]/30 px-2.5 py-1 text-xs font-bold text-[#226048]">
                                    {status.label}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-[#E2F3EC] border border-[#4C9F80]/30 px-2.5 py-1 text-xs font-bold text-[#226048]">
                                    Ready to claim
                                  </span>
                                )}
                              </div>

                              {/* Action Buttons */}
                              <div className="shrink-0 flex items-center gap-2">
                                {isDispensingFromCho && overview?.hasPartial && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setUpdateFollowUpPatientData({ patient, overview });
                                      setIsUpdateFollowUpModalOpen(true);
                                    }}
                                    className={`h-9 inline-flex items-center gap-1.5 rounded-lg border border-[#34769B]/40 bg-white px-3 text-xs font-bold text-[#34769B] shadow-xs hover:bg-[#E3EEF5]/50 transition cursor-pointer ${FOCUS_RING}`}
                                    title="Update return schedule or refer patient to Barangay Health Center"
                                  >
                                    <CalendarIcon className="h-3.5 w-3.5" />
                                    Update Follow-up
                                  </button>
                                )}

                                {!isBlocked && (
                                  <button
                                    type="button"
                                    aria-label={`${isSelectedCard ? "Unselect" : "Select"} ${patientName}`}
                                    onClick={() => selectPatient(patient)}
                                    className={`h-9 rounded-lg px-4 text-xs font-bold shadow-sm transition cursor-pointer ${FOCUS_RING} ${
                                      isSelectedCard
                                        ? "btn-secondary"
                                        : "btn-primary"
                                    }`}
                                  >
                                    {isSelectedCard ? "Unselect" : "Select"}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Active Monthly Claims Itemized Breakdown (if existing) */}
                            {overview?.breakdown?.length > 0 && (
                              <div className="rounded-lg border border-[#e5e7eb] bg-white p-2.5 text-xs">
                                <p className="mb-1.5 font-bold uppercase tracking-wider text-[10px] text-[#6b7280]">
                                  Monthly Prescription Progress:
                                </p>
                                <div className="grid gap-1 sm:grid-cols-2">
                                  {overview.breakdown.map((item) => (
                                    <div
                                      key={item.medicine_id}
                                      className="flex items-center justify-between gap-2 text-xs"
                                    >
                                      <span className="font-medium text-[#0d1117] truncate">
                                        {getMedicineLabel(item.medicine)}
                                      </span>
                                      <span className="shrink-0 tabular-nums">
                                        {item.is_completed ? (
                                          <span className="font-bold text-[#226048]">
                                            {item.released_quantity}/{item.needed_quantity} (Done)
                                          </span>
                                        ) : (
                                          <span className="font-bold text-amber-700">
                                            {item.released_quantity}/{item.needed_quantity} (
                                            {item.remaining_quantity} left)
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                    {!isSearchingPatients && patientResults.length === 0 && (
                      <div className="w-full rounded-xl bg-[#f8f9ff] p-6 text-center text-sm font-medium text-[#5f6673]">
                        {patientKeyword.trim()
                          ? "No matching patients found. Register the patient in the Patient module before dispensing."
                          : "Search patient to start"}
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
                        className={`btn-primary inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-bold text-white shadow-xs transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${FOCUS_RING}`}
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

        {/* STEP 2: CHOOSE MEDICINES */}
        {wizardStep === 2 && (
          <div className="prds-step-in">
            <section className="self-start rounded-xl border border-[#d8dadc] bg-white shadow-sm">
              <div className="border-b border-[#e5e7eb] px-4 py-3">
                <h2
                  className="text-base font-bold text-[#0d1117] focus:outline-none"
                  tabIndex={-1}
                  data-step-heading
                >
                  Choose medicine
                </h2>
                <p className="mt-1 text-sm text-[#5f6673]">
                  Pick medicines from available stock, then review the quantities.
                </p>
              </div>

              <div className="p-4">
                {/* Active Monthly Prescription Card */}
                {activePatientClaim?.breakdown?.length > 0 && (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                    <h3 className="text-sm font-bold text-amber-950">
                      Active Monthly Prescription for this Patient
                    </h3>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {activePatientClaim.breakdown.map((item) => (
                        <div
                          key={item.medicine_id}
                          className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 text-xs ${
                            item.is_completed
                              ? "border-emerald-200 bg-emerald-50/80 text-emerald-900"
                              : "border-amber-200 bg-white text-[#0d1117]"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="font-bold truncate">{getMedicineLabel(item.medicine)}</p>
                            <p className="text-[11px] text-[#5f6673]">
                              Prescribed: <span className="font-semibold">{item.needed_quantity}</span> ·
                              Released: <span className="font-semibold">{item.released_quantity}</span>
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            {item.is_completed ? (
                              <span className="inline-flex items-center gap-1 font-bold text-[#226048]">
                                <CheckIcon /> All released
                              </span>
                            ) : (
                              <div>
                                <span className="font-bold text-amber-700 tabular-nums">
                                  {item.remaining_quantity} remaining
                                </span>
                                {item.follow_up_action === FOLLOW_UP_ACTIONS.schedule && item.follow_up_date && (
                                  <p className="text-[10px] text-[#5f6673]">Return: {item.follow_up_date}</p>
                                )}
                                {item.follow_up_action === FOLLOW_UP_ACTIONS.refer && (
                                  <p className="text-[10px] text-[#5f6673]">Referred</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_480px] xl:grid-cols-[minmax(0,1fr)_540px]">
                  {/* Available Medicines Catalog */}
                  <section className="min-w-0 rounded-xl border border-[#e5e7eb] bg-white p-3">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-[#0d1117]">Available medicines</h3>
                        <p className="mt-0.5 text-xs text-[#5f6673]">Select from current facility stock.</p>
                      </div>
                      <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 tabular-nums">
                        {isSearchActive
                          ? `${displayedMedicineOptions.length.toLocaleString()} matching`
                          : `${allAvailableMedicines.length.toLocaleString()} in stock`}
                      </span>
                    </div>

                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a93a3]">
                        <SearchIcon />
                      </span>
                      <Input
                        value={medicineKeyword}
                        onChange={(event) => setMedicineKeyword(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && displayedMedicineOptions[0]) {
                            event.preventDefault();
                            addToCart(displayedMedicineOptions[0]);
                          }
                        }}
                        placeholder="Search available medicine, brand, dosage, lot..."
                        title="Type to search and select available stock"
                        className="pl-9 pr-8"
                      />
                      {medicineKeyword && (
                        <button
                          type="button"
                          onClick={() => setMedicineKeyword("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#8a93a3] hover:text-[#0d1117] rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                          aria-label="Clear search"
                        >
                          <XIcon />
                        </button>
                      )}
                    </div>

                    {isLoadingInventory ? (
                      <div className="mt-3">
                        <div className="h-40 animate-pulse rounded-xl bg-[#f8f9ff]" />
                        <div role="status" className="sr-only">
                          Loading available medicine stock
                        </div>
                      </div>
                    ) : !isSearchActive ? (
                      /* Prompt state when user hasn't typed in search or picked a filter */
                      <div className="mt-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-[#d8dadc] bg-[#f8f9ff]/70 px-4 py-12 text-center">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 shadow-xs mb-3">
                          <SearchIcon />
                        </div>
                        <h4 className="text-sm font-bold text-[#0d1117]">Search to view medicines</h4>
                        <p className="mt-1 max-w-sm text-xs text-[#5f6673]">
                          Type a medicine name, brand, dosage, or form above to view available stock and add to the claim.
                        </p>
                        <div className="mt-3.5 inline-flex items-center gap-2 rounded-full border border-[#d8dadc] bg-white px-3 py-1 text-xs text-[#42474e]">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>
                            {allAvailableMedicines.length}{" "}
                            {allAvailableMedicines.length === 1 ? "medicine" : "medicines"} available in facility stock
                          </span>
                        </div>
                      </div>
                    ) : (
                      /* Matching results when search or filter is active */
                      <div className="mt-3 grid max-h-[520px] gap-2 overflow-auto pr-1 xl:grid-cols-2">
                        {displayedMedicineOptions.map((option) => {
                          const inCart = cart.some((line) => line.medicine_id === option.medicine_id);
                          const lowStock = option.total_quantity <= 10;
                          const existingClaimItem = activePatientClaim?.breakdown?.find(
                            (b) => b.medicine_id === option.medicine_id
                          );
                          const isCompletedForMonth = existingClaimItem?.is_completed;
                          const expDate = option.nearest_expiration
                            ? new Date(option.nearest_expiration).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : null;

                          return (
                            <button
                              type="button"
                              key={option.medicine_id}
                              onClick={() => addToCart(option)}
                              disabled={inCart || isCompletedForMonth}
                              aria-label={`Add ${getMedicineLabel(option.medicine)} to claim`}
                              className={`rounded-xl border p-3 text-left transition-all duration-200 ${FOCUS_RING} ${
                                isCompletedForMonth
                                  ? "cursor-not-allowed border-[#e5e7eb] bg-[#f4f5f7] opacity-60"
                                  : inCart
                                    ? "cursor-default border-slate-200 bg-slate-100"
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
                                  {expDate && (
                                    <p className="mt-0.5 text-[11px] text-slate-500">
                                      Earliest exp: {expDate}
                                    </p>
                                  )}
                                </div>
                                <span
                                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                                    lowStock
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {option.total_quantity.toLocaleString()} units
                                </span>
                              </div>

                              {isCompletedForMonth && (
                                <p className="mt-2 text-xs font-bold text-[#226048]">
                                  Already completed this month
                                </p>
                              )}
                              {inCart && !isCompletedForMonth && (
                                <p className="mt-2 text-xs font-bold text-[#5f6673]">Added</p>
                              )}
                              {lowStock && !inCart && !isCompletedForMonth && (
                                <p className="mt-2 text-xs font-bold text-amber-700">
                                  Low stock — confirm remaining supply
                                </p>
                              )}
                            </button>
                          );
                        })}

                        {displayedMedicineOptions.length === 0 && (
                          <div className="col-span-full rounded-xl border border-[#d8dadc] bg-[#f8f9ff] p-6 text-center text-sm font-medium text-[#5f6673]">
                            <p className="font-bold text-[#0d1117]">No matching medicines found</p>
                            <p className="mt-1 text-xs">
                              No available medicines match "{medicineKeyword}". Check the spelling or generic name.
                            </p>
                            <button
                              type="button"
                              onClick={() => setMedicineKeyword("")}
                              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#d8dadc] bg-white px-3 py-1.5 text-xs font-semibold text-[#0d1117] hover:bg-slate-50 cursor-pointer shadow-xs"
                            >
                              <span>Clear search</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  {/* Selected Medicines (Cart aside) */}
                  <aside className="min-w-0 rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-3 lg:sticky lg:top-4 lg:self-start">
                    <div className="mb-3">
                      <h3 className="text-sm font-bold text-[#0d1117]">Selected medicines</h3>
                      <p className="mt-0.5 text-xs text-[#5f6673]">
                        Confirm patient, doctor, and quantities.
                      </p>
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
                            <p className="mt-0.5 truncate text-xs text-[#5f6673]">
                              {selectedPatient.address}
                            </p>
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
                      <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-10 text-center">
                        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
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
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-[#0d1117]">
                                      {line.option ? getMedicineLabel(line.option.medicine) : "Unavailable"}
                                    </p>
                                    {line.option && (
                                      <p className="mt-0.5 text-xs text-[#5f6673]">
                                        {getMedicineFullLabel(line.option.medicine)}
                                      </p>
                                    )}
                                    {line.is_existing_claim && (
                                      <p className="mt-1 text-[11px] font-semibold text-amber-700">
                                        Prior release: {line.previous_released || 0} units · Balance:{" "}
                                        {line.remaining_quantity} units
                                      </p>
                                    )}
                                  </div>

                                  <label className="block">
                                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                                      {line.is_existing_claim ? "Prescribed" : "Needed quantity"}
                                    </span>
                                    <Input
                                      aria-label={`${line.option ? getMedicineLabel(line.option.medicine) : "Medicine"} needed quantity`}
                                      value={line.needed_quantity}
                                      inputMode="numeric"
                                      disabled={line.is_existing_claim}
                                      readOnly={line.is_existing_claim}
                                      onChange={(event) =>
                                        updateCartQuantity(
                                          line.medicine_id,
                                          "needed_quantity",
                                          event.target.value
                                        )
                                      }
                                      onBlur={() => commitQuantity(line.medicine_id, "needed_quantity")}
                                      className={`text-center tabular-nums ${
                                        line.is_existing_claim
                                          ? "cursor-not-allowed bg-[#f4f5f7] text-[#5f6673]"
                                          : ""
                                      }`}
                                      title={
                                        line.is_existing_claim
                                          ? "Doctor prescribed needed quantity cannot be altered during follow-up."
                                          : undefined
                                      }
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
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="block text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                                      Release quantity
                                    </span>
                                    {line.is_existing_claim && (
                                      <span className="text-[11px] font-bold text-amber-800">
                                        Max allowed: {line.remaining_quantity}
                                      </span>
                                    )}
                                  </div>

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
                                      disabled={
                                        line.is_existing_claim &&
                                        Number(line.quantity) >= line.remaining_quantity
                                      }
                                      onClick={() => bumpQuantity(line.medicine_id, 1)}
                                      className={`h-10 w-10 rounded-lg border border-[#d8dadc] bg-white text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff] disabled:opacity-40 ${FOCUS_RING}`}
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

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7eb] pt-4 mt-4">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className={`h-10 rounded-lg bg-slate-100 px-5 text-sm font-bold text-slate-800 transition hover:bg-slate-200/80 ${FOCUS_RING}`}
                  >
                    Back to Patient
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep(3)}
                    disabled={!canReview}
                    title={stepBlockers(3) || undefined}
                    className="btn-primary inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-5 text-sm font-bold text-white shadow-xs transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                  >
                    Review <ArrowRightIcon />
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* STEP 3: REVIEW & RELEASE */}
        {wizardStep === 3 && (
          <div className="prds-step-in">
            <section className="self-start rounded-xl border border-[#d8dadc] bg-white shadow-sm">
              <div className="border-b border-[#e5e7eb] px-4 py-3">
                <h2
                  className="text-base font-bold text-[#0d1117] focus:outline-none"
                  tabIndex={-1}
                  data-step-heading
                >
                  Review &amp; Release
                </h2>
                <p className="mt-1 text-sm text-[#5f6673]">
                  Verify every detail before the medicine is released.
                </p>
              </div>

              <div className="space-y-4 px-4 pb-4 pt-3">
                {selectedClaimed && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700">
                    This patient already received all prescribed medicines for this month.
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
                    <thead className="border-b border-slate-200/80 bg-white text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Medicine</th>
                        <th className="px-4 py-3 text-right">Needed quantity</th>
                        <th className="px-4 py-3 text-right">Release quantity</th>
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
                            {line.is_existing_claim && (
                              <span className="block text-[11px] font-normal text-[#5f6673]">
                                ({line.previous_released || 0} already released)
                              </span>
                            )}
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
                  className={`h-10 rounded-lg bg-slate-100 px-5 text-sm font-bold text-slate-800 transition hover:bg-slate-200/80 ${FOCUS_RING}`}
                >
                  Back to Medicines
                </button>
                <div className="flex items-center gap-2.5">
                  {hasPartialReleases && (
                    <button
                      type="button"
                      onClick={() => setIsFollowUpModalOpen(true)}
                      className={`inline-flex h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-900 shadow-sm transition hover:bg-amber-100 ${FOCUS_RING}`}
                      title="Configure follow-up action for partially released medicines"
                    >
                      <AlertTriangleIcon className="h-4 w-4 text-amber-600" />
                      Follow-up
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-black text-amber-900">
                        {partiallyReleasedLines.length}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleComplete}
                    disabled={!canComplete || isSaving}
                    title={stepBlockers(3) || undefined}
                    className={`btn-primary inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-5 text-sm font-bold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${FOCUS_RING}`}
                  >
                    <CheckIcon /> Release
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
          </>
        )}
      </div>

      {isFollowUpModalOpen && hasPartialReleases && (
        <DispensingModal
          title="Follow-up Action Setup"
          subtitle={`Review follow-up actions for ${partiallyReleasedLines.length} partially released ${partiallyReleasedLines.length === 1 ? "medicine" : "medicines"} (${selectedPatient ? formatPatientName(selectedPatient) : "patient"})`}
          onClose={() => setIsFollowUpModalOpen(false)}
          widthClass="max-w-2xl"
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
              <p className="font-bold">Unreleased Balances Detected</p>
              <p className="mt-0.5 text-amber-800">
                The current release does not fulfill the total needed quantity for the medicines below. Choose whether to schedule a return date, refer the patient to {isDispensingFromCho ? "their barangay health center" : "the City Health Office (CHO)"}, or record no follow-up.
              </p>
            </div>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              {partiallyReleasedLines.map((line) => {
                const totalReleasedSoFar = Number(line.previous_released || 0) + Number(line.quantity || 0);
                const needed = Number(line.needed_quantity ?? line.quantity ?? 0);
                const remainingAfterThisRelease = Math.max(0, needed - totalReleasedSoFar);

                return (
                  <div
                    key={line.medicine_id}
                    className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-xs space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e7eb] pb-3">
                      <div>
                        <p className="text-sm font-bold text-[#0d1117]">
                          {line.option ? getMedicineLabel(line.option.medicine) : "Medicine"}
                        </p>
                        {line.option && (
                          <p className="mt-0.5 text-xs text-[#5f6673]">
                            {getMedicineFullLabel(line.option.medicine)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-[#42474e]">
                          Needed: {needed}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-[#42474e]">
                          Releasing: {line.quantity}
                        </span>
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 font-bold text-amber-900">
                          Remaining: {remainingAfterThisRelease}
                        </span>
                      </div>
                    </div>

                    {renderFollowUpOptions(line, remainingAfterThisRelease)}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end border-t border-[#e5e7eb] pt-3">
              <button
                type="button"
                onClick={() => setIsFollowUpModalOpen(false)}
                className={`btn-primary h-10 rounded-lg px-6 text-sm font-bold text-white shadow-sm transition cursor-pointer ${FOCUS_RING}`}
              >
                Done
              </button>
            </div>
          </div>
        </DispensingModal>
      )}

      {stockModalLine && (
        <DispensingModal
          title={isDispensingFromCho ? "Barangay Stock Availability" : "City Health Office (CHO) Stock Availability"}
          subtitle={
            defaultReferralFacility?.facility_name ||
            (isDispensingFromCho ? "Patient's Barangay Health Station" : "City Health Office Central Pharmacy")
          }
          onClose={() => setStockModalMedicineId("")}
          widthClass="max-w-lg"
        >
          {renderReferralStockOverview(stockModalLine)}
        </DispensingModal>
      )}

      {receipt && (
        <ReceiptModal
          onClose={closeReceipt}
          onExport={exportReceipt}
          onViewInHistory={() => {
            closeReceipt();
            setActiveTab("HISTORY");
          }}
          receipt={receipt}
        />
      )}

      <UpdateFollowUpModal
        isOpen={isUpdateFollowUpModalOpen}
        onClose={() => {
          setIsUpdateFollowUpModalOpen(false);
          setUpdateFollowUpPatientData(null);
        }}
        patient={updateFollowUpPatientData?.patient}
        breakdown={updateFollowUpPatientData?.overview?.breakdown}
        facilities={facilities}
        onSuccess={async () => {
          await runPatientSearch();
          if (selectedPatient && updateFollowUpPatientData?.patient?.id === selectedPatient.id) {
            const updatedOverview = await getPatientsMonthlyClaimOverview([selectedPatient.id], {
              currentFacilityId: profileFacilityId,
              isBhw,
            });
            const overview = updatedOverview.get(selectedPatient.id);
            if (overview) {
              setActivePatientClaim(overview);
            }
          }
        }}
      />
    </AdminShell>
  );
}
