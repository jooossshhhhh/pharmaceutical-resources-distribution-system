import { useEffect, useMemo, useState } from "react";
import { BuildingIcon, DispensingModal, FOCUS_RING, PatientAvatar } from "./DispensingUi";
import {
  FOLLOW_UP_ACTIONS,
  getDefaultFollowUpDate,
  getMedicineLabel,
} from "@shared/utils/dispensingUtils";
import { formatPatientCode, formatPatientName } from "@shared/utils/patientUtils";
import { isChoFacility } from "@shared/utils/facilityUtils";
import {
  getFacilityMedicineStockOverview,
  updateDispensingFollowUp,
} from "@backend/services/dispensingService";

export default function UpdateFollowUpModal({
  isOpen,
  onClose,
  patient,
  breakdown = [],
  facilities = [],
  onSuccess,
}) {
  if (!isOpen || !patient) {
    return null;
  }

  const patientName = formatPatientName(patient);
  const patientCode = formatPatientCode(patient.patient_code);
  const pendingItems = useMemo(
    () => (Array.isArray(breakdown) ? breakdown.filter((item) => !item.is_completed) : []),
    [breakdown]
  );

  const pendingMedicineIds = useMemo(
    () => pendingItems.map((item) => item.medicine_id).filter(Boolean),
    [pendingItems]
  );

  // Identify patient's registered barangay facility
  const targetBarangay = useMemo(() => {
    const regId = String(patient.facility_id || patient.facility?.id || "");
    if (regId) {
      const match = (facilities || []).find((f) => String(f.id) === regId);
      if (match) return match;
    }
    if (patient.facility && patient.facility.facility_name && !isChoFacility(patient.facility)) {
      return patient.facility;
    }
    return (
      (facilities || []).find(
        (f) => f && !isChoFacility(f) && (f.status === "ACTIVE" || !f.status)
      ) || null
    );
  }, [patient, facilities]);

  const initialAction =
    pendingItems[0]?.follow_up_action || FOLLOW_UP_ACTIONS.schedule;
  const initialDate =
    pendingItems[0]?.follow_up_date || getDefaultFollowUpDate();
  const initialFacilityId =
    targetBarangay?.id ||
    pendingItems[0]?.referred_facility_id ||
    "";

  const [followUpAction, setFollowUpAction] = useState(initialAction);
  const [followUpDate, setFollowUpDate] = useState(initialDate);
  const [referredFacilityId, setReferredFacilityId] = useState(initialFacilityId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Referral stock checking state
  const [referralStockRows, setReferralStockRows] = useState([]);
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [stockError, setStockError] = useState("");

  // Keep referredFacilityId synchronized with the patient's registered barangay
  useEffect(() => {
    if (targetBarangay?.id) {
      setReferredFacilityId(targetBarangay.id);
    }
  }, [targetBarangay]);

  // Check stock at the patient's registered barangay whenever referring
  useEffect(() => {
    if (
      !targetBarangay?.id ||
      pendingMedicineIds.length === 0 ||
      followUpAction !== FOLLOW_UP_ACTIONS.refer
    ) {
      return;
    }

    let active = true;
    setIsLoadingStock(true);
    setStockError("");

    getFacilityMedicineStockOverview({
      facilityId: targetBarangay.id,
      medicineIds: pendingMedicineIds,
    })
      .then((rows) => {
        if (active) {
          setReferralStockRows(rows || []);
          setStockError("");
        }
      })
      .catch((err) => {
        if (active) {
          console.warn("Failed to check barangay stock:", err);
          setStockError("Unable to verify barangay stock. Proceeding will still transfer the claim.");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingStock(false);
        }
      });

    return () => {
      active = false;
    };
  }, [targetBarangay?.id, pendingMedicineIds, followUpAction]);

  const stockByMedicineId = useMemo(() => {
    const map = new Map();
    referralStockRows.forEach((row) => {
      const medId = String(row.medicine_id);
      if (!map.has(medId)) {
        map.set(medId, { totalUnits: 0, batches: [] });
      }
      const entry = map.get(medId);
      entry.totalUnits += Number(row.quantity || 0);
      entry.batches.push(row);
    });
    return map;
  }, [referralStockRows]);

  const setPresetDate = (days) => {
    const target = new Date();
    target.setDate(target.getDate() + days);
    setFollowUpDate(target.toISOString().slice(0, 10));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (followUpAction === FOLLOW_UP_ACTIONS.schedule && !followUpDate) {
      setErrorMessage("Please select a valid scheduled return date.");
      return;
    }

    const finalReferredFacilityId = targetBarangay?.id || referredFacilityId;
    if (followUpAction === FOLLOW_UP_ACTIONS.refer && !finalReferredFacilityId) {
      setErrorMessage("This patient has no registered Barangay Health Center to refer to.");
      return;
    }

    setIsSubmitting(true);

    try {
      const dispensingIds = pendingItems.flatMap((item) => item.dispensing_ids || []);

      await updateDispensingFollowUp({
        dispensingIds,
        patientId: patient.id,
        followUpAction,
        followUpDate: followUpAction === FOLLOW_UP_ACTIONS.schedule ? followUpDate : null,
        referredFacilityId: followUpAction === FOLLOW_UP_ACTIONS.refer ? finalReferredFacilityId : null,
      });

      onSuccess?.({
        followUpAction,
        followUpDate,
        referredFacilityId: finalReferredFacilityId,
      });
      onClose();
    } catch (err) {
      console.error("Failed to update follow-up option:", err);
      setErrorMessage(err.message || "Failed to update follow-up option.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <DispensingModal
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      title="Update Follow-up Plan"
      subtitle="Modify the return schedule or refer the patient to their Barangay Health Center."
    >
      <form onSubmit={handleSave} className="space-y-4">
        {/* Patient Summary Card */}
        <div className="flex items-center gap-3 rounded-xl border border-[#CFDDE0] bg-[#E3EEF5]/40 p-3.5">
          <PatientAvatar name={patientName} sizeClass="h-11 w-11 text-sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-[#1B2B30] truncate">{patientName}</h3>
              <span className="font-mono text-xs font-bold text-[#34769B] bg-white border border-[#34769B]/30 px-2 py-0.5 rounded-md">
                {patientCode}
              </span>
            </div>
            {patient.address && (
              <p className="mt-0.5 text-xs text-[#5B7077] truncate">{patient.address}</p>
            )}
            {targetBarangay && (
              <p className="mt-0.5 text-[11px] font-semibold text-[#1F4A66]">
                Registered Barangay: {targetBarangay.facility_name}
              </p>
            )}
          </div>
        </div>

        {/* Pending Medicines Breakdown */}
        {pendingItems.length > 0 && (
          <div className="rounded-xl border border-[#CFDDE0] bg-white p-3 text-xs">
            <p className="font-bold uppercase tracking-wider text-[10px] text-[#5B7077] mb-2">
              Pending Prescriptions ({pendingItems.length} item{pendingItems.length === 1 ? "" : "s"}):
            </p>
            <div className="space-y-1.5">
              {pendingItems.map((item) => (
                <div
                  key={item.medicine_id}
                  className="flex items-center justify-between gap-2 border-b border-[#CFDDE0]/40 pb-1.5 last:border-b-0 last:pb-0"
                >
                  <span className="font-bold text-[#1B2B30] truncate">
                    {getMedicineLabel(item.medicine)}
                  </span>
                  <span className="shrink-0 font-mono font-bold text-amber-700">
                    {item.released_quantity}/{item.needed_quantity} claimed ({item.remaining_quantity} left)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Follow-up Action Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-[#5B7077]">
            Select Follow-up Action
          </label>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {/* Option 1: Return to CHO */}
            <button
              type="button"
              onClick={() => setFollowUpAction(FOLLOW_UP_ACTIONS.schedule)}
              className={`flex flex-col rounded-xl border p-3.5 text-left transition cursor-pointer ${
                followUpAction === FOLLOW_UP_ACTIONS.schedule
                  ? "border-[#34769B] bg-[#E3EEF5]/50 ring-1 ring-[#34769B]"
                  : "border-[#CFDDE0] bg-white hover:border-[#34769B]/40 hover:bg-[#F9FBFB]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1B2B30]">Return to CHO</span>
                <span
                  className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                    followUpAction === FOLLOW_UP_ACTIONS.schedule
                      ? "border-[#34769B] bg-[#34769B]"
                      : "border-[#CFDDE0] bg-white"
                  }`}
                >
                  {followUpAction === FOLLOW_UP_ACTIONS.schedule && (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#5B7077]">
                Patient returns to City Health Office on scheduled date to claim remaining medicine.
              </p>
            </button>

            {/* Option 2: Refer to Barangay */}
            <button
              type="button"
              onClick={() => {
                setFollowUpAction(FOLLOW_UP_ACTIONS.refer);
                if (targetBarangay?.id) {
                  setReferredFacilityId(targetBarangay.id);
                }
              }}
              className={`flex flex-col rounded-xl border p-3.5 text-left transition cursor-pointer ${
                followUpAction === FOLLOW_UP_ACTIONS.refer
                  ? "border-[#34769B] bg-[#E3EEF5]/50 ring-1 ring-[#34769B]"
                  : "border-[#CFDDE0] bg-white hover:border-[#34769B]/40 hover:bg-[#F9FBFB]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1B2B30]">Refer to Barangay</span>
                <span
                  className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                    followUpAction === FOLLOW_UP_ACTIONS.refer
                      ? "border-[#34769B] bg-[#34769B]"
                      : "border-[#CFDDE0] bg-white"
                  }`}
                >
                  {followUpAction === FOLLOW_UP_ACTIONS.refer && (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#5B7077]">
                Transfer claim to their registered Barangay Station so BHW can dispense the remaining balance.
              </p>
            </button>
          </div>
        </div>

        {/* Action-specific inputs */}
        {followUpAction === FOLLOW_UP_ACTIONS.schedule && (
          <div className="rounded-xl border border-[#CFDDE0] bg-white p-3.5 space-y-3">
            <label
              htmlFor="schedule-date-input"
              className="block text-xs font-bold uppercase tracking-wider text-[#5B7077]"
            >
              Scheduled Return Date
            </label>
            <input
              id="schedule-date-input"
              type="date"
              min={todayStr}
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className={`w-full rounded-lg border border-[#CFDDE0] bg-white px-3 py-2 text-xs font-bold text-[#1B2B30] ${FOCUS_RING}`}
              required
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#5B7077]">Quick presets:</span>
              <button
                type="button"
                onClick={() => setPresetDate(7)}
                className="rounded-md border border-[#CFDDE0] bg-[#F9FBFB] px-2 py-0.5 text-[11px] font-semibold text-[#34769B] hover:bg-[#E3EEF5]/40 transition cursor-pointer"
              >
                +7 Days (Next Week)
              </button>
              <button
                type="button"
                onClick={() => setPresetDate(14)}
                className="rounded-md border border-[#CFDDE0] bg-[#F9FBFB] px-2 py-0.5 text-[11px] font-semibold text-[#34769B] hover:bg-[#E3EEF5]/40 transition cursor-pointer"
              >
                +14 Days
              </button>
              <button
                type="button"
                onClick={() => setPresetDate(30)}
                className="rounded-md border border-[#CFDDE0] bg-[#F9FBFB] px-2 py-0.5 text-[11px] font-semibold text-[#34769B] hover:bg-[#E3EEF5]/40 transition cursor-pointer"
              >
                +30 Days (Next Month)
              </button>
            </div>
          </div>
        )}

        {followUpAction === FOLLOW_UP_ACTIONS.refer && (
          <div className="rounded-xl border border-[#CFDDE0] bg-white p-3.5 space-y-3.5">
            <div>
              <p className="block text-xs font-bold uppercase tracking-wider text-[#5B7077] mb-2">
                Destination Barangay Health Center
              </p>

              {targetBarangay ? (
                <div className="flex items-center justify-between rounded-xl border border-[#34769B]/30 bg-[#E3EEF5]/40 p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#34769B] text-white shadow-xs">
                      <BuildingIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[#1B2B30]">
                        {targetBarangay.facility_name}
                      </p>
                      <p className="text-xs text-[#5B7077] mt-0.5">
                        Patient's registered facility · Only this station's BHW can dispense the remaining balance
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  This patient does not have a registered Barangay Health Center. Please assign a facility in the Patients module before referring.
                </div>
              )}
            </div>

            {/* Barangay Stock Verification Card */}
            {targetBarangay && (
              <div className="rounded-xl border border-[#CFDDE0]/80 bg-[#F9FBFB] p-3 text-xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#CFDDE0]/60 pb-2">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-[#5B7077]">
                    Barangay Stock Verification ({targetBarangay.facility_name})
                  </span>
                  {isLoadingStock && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#34769B]">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#34769B] border-t-transparent" />
                      Checking stock...
                    </span>
                  )}
                </div>

                {stockError ? (
                  <p className="text-[11px] text-amber-700">{stockError}</p>
                ) : !isLoadingStock && (
                  <div className="space-y-2">
                    {pendingItems.map((item) => {
                      const stock = stockByMedicineId.get(String(item.medicine_id));
                      const availableUnits = stock ? stock.totalUnits : 0;
                      const neededRemaining = item.remaining_quantity;
                      const isCovered = availableUnits >= neededRemaining;
                      const isPartial = availableUnits > 0 && availableUnits < neededRemaining;

                      return (
                        <div
                          key={item.medicine_id}
                          className="rounded-lg border border-[#CFDDE0]/60 bg-white p-2.5 space-y-1.5 shadow-2xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#1B2B30] truncate">
                              {getMedicineLabel(item.medicine)}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                                isCovered
                                  ? "bg-[#E2F3EC] text-[#226048] border border-[#4C9F80]/30"
                                  : isPartial
                                  ? "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/30"
                                  : "bg-red-50 text-red-700 border border-red-200"
                              }`}
                            >
                              {isCovered
                                ? `In Stock (${availableUnits} units)`
                                : isPartial
                                ? `Partial Stock (${availableUnits} units)`
                                : "Out of Stock (0 units)"}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                            <span className="text-[#5B7077]">
                              Needed balance: <strong className="text-[#1B2B30]">{neededRemaining} units</strong>
                            </span>
                            {stock?.batches?.[0]?.expiration_date && (
                              <span className="font-mono text-[#5B7077]">
                                Earliest expiry: {stock.batches[0].expiration_date}
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] font-medium leading-snug">
                            {isCovered ? (
                              <span className="text-[#226048]">
                                ✓ Station has sufficient stock to fulfill the remaining {neededRemaining} units.
                              </span>
                            ) : isPartial ? (
                              <span className="text-[#8F3F2B]">
                                ⚠ Station only has {availableUnits} units available (shortfall of {neededRemaining - availableUnits} units).
                              </span>
                            ) : (
                              <span className="text-red-600 font-semibold">
                                ✕ Station currently has 0 available units in stock. BHW will require restock from CHO.
                              </span>
                            )}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-bold text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#CFDDE0]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={`btn-secondary h-9 rounded-lg px-4 text-xs font-bold transition cursor-pointer ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`btn-primary h-9 rounded-lg px-4 text-xs font-bold shadow-sm transition cursor-pointer ${FOCUS_RING} ${
              isSubmitting ? "opacity-70 cursor-not-allowed" : ""
            }`}
          >
            {isSubmitting ? "Updating..." : "Update"}
          </button>
        </div>
      </form>
    </DispensingModal>
  );
}
