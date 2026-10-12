import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Pill, RotateCcw, X } from "lucide-react";

import ModalShell from "../../../components/ModalShell";
import {
  createStockReturn,
  RETURN_REASON_OPTIONS,
} from "@backend/services/stockReturnsService";

const createInitialForm = (profile) => ({
  lot_no: "",
  medicine_id: "",
  quantity: "",
  unit_cost: 0,
  expiration_date: "",
  reason: "EXCESS_STOCK",
  facility_id: profile?.role === "BHW" ? profile?.facility_id || "" : "",
});

export default function RecordStockReturnModal({
  isOpen,
  onClose,
  onSuccess,
  facilities = [],
  medicines = [],
  currentUserProfile = null,
}) {
  const isBhw = currentUserProfile?.role === "BHW";
  const [formValues, setFormValues] = useState(() => createInitialForm(currentUserProfile));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const barangayFacilities = useMemo(() => {
    return (facilities || []).filter(
      (facility) =>
        facility.facility_type === "BARANGAY_HEALTH_STATION" ||
        (facility.facility_code &&
          facility.facility_code !== "CHO" &&
          !facility.facility_name?.includes("City Health Office"))
    );
  }, [facilities]);

  const selectedMedicine = useMemo(
    () => medicines.find((medicine) => medicine.id === formValues.medicine_id) || null,
    [formValues.medicine_id, medicines]
  );

  const selectedFacility = useMemo(
    () => facilities.find((facility) => facility.id === formValues.facility_id) || null,
    [facilities, formValues.facility_id]
  );

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    let isActive = true;
    void Promise.resolve().then(() => {
      if (!isActive) {
        return;
      }
      setFormValues(createInitialForm(currentUserProfile));
      setFormError("");
      setIsSubmitting(false);
    });

    return () => {
      isActive = false;
    };
  }, [currentUserProfile, isOpen]);

  const handleFieldChange = (field, value) => {
    setFormValues((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "medicine_id") {
        const medicine = medicines.find((item) => item.id === value);
        if (medicine?.unit_cost != null) {
          next.unit_cost = Number(medicine.unit_cost) || 0;
        }
      }
      return next;
    });
  };

  const totalEstimatedCost = useMemo(() => {
    const qty = parseInt(formValues.quantity, 10) || 0;
    const cost = parseFloat(formValues.unit_cost) || 0;
    return qty * cost;
  }, [formValues.quantity, formValues.unit_cost]);

  const handleSubmit = async (event) => {
    event?.preventDefault();
    setFormError("");

    if (!formValues.facility_id) {
      setFormError("Returning facility is required.");
      return;
    }
    if (!formValues.lot_no.trim()) {
      setFormError("Lot number is required.");
      return;
    }
    if (!formValues.medicine_id) {
      setFormError("Please select the medicine being returned.");
      return;
    }
    if ((parseInt(formValues.quantity, 10) || 0) <= 0) {
      setFormError("Quantity must be greater than zero.");
      return;
    }
    if (!formValues.expiration_date) {
      setFormError("Expiration date is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createStockReturn({
        stockReturnData: formValues,
        medicine: selectedMedicine,
        userProfile: currentUserProfile,
      });
      onSuccess?.({
        ...result,
        facility: selectedFacility,
      });
      onClose();
    } catch (err) {
      console.error("[RecordStockReturnModal] Submission error:", err);
      setFormError(err.message || "Unable to save the stock return.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="max-w-3xl w-full p-0 overflow-hidden rounded-xl bg-white shadow-2xl"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[90vh] flex-col overflow-hidden">
        {/* Standard PRDS Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-black leading-tight text-[#0d1117]">
              {isBhw ? "Send Stock Return to CHO" : "Record Stock Return"}
            </h3>
            <p className="text-xs font-medium text-neutral-500">
              {isBhw
                ? "Document and dispatch returned medicines from your barangay station to CHO Central Warehouse."
                : "Record returned medicine items from barangay stations into the official return ledger."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="prds-modal-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {formError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="flex-1">{formError}</p>
            </div>
          )}

          {/* Section 1: Facility & Reason */}
          <section className="rounded-xl border border-[#d8dadc] bg-[#fbfaf8] p-4 shadow-2xs">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-700 mb-3">
              Facility &amp; Return Purpose
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-neutral-700">
                  Returning Facility <span className="text-red-500">*</span>
                </label>
                {isBhw ? (
                  <div className="flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-black text-[#0d1117]">
                    <Building2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>{currentUserProfile?.facility_name || selectedFacility?.facility_name || "Your Barangay Health Center"}</span>
                  </div>
                ) : (
                  <select
                    value={formValues.facility_id}
                    onChange={(event) => handleFieldChange("facility_id", event.target.value)}
                    className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-xs font-bold text-[#0d1117] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 cursor-pointer"
                    required
                  >
                    <option value="">Select returning facility...</option>
                    {barangayFacilities.map((facility) => (
                      <option key={facility.id} value={facility.id}>
                        {facility.facility_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-neutral-700">
                  Return Reason <span className="text-red-500">*</span>
                </label>
                <select
                  value={formValues.reason}
                  onChange={(event) => handleFieldChange("reason", event.target.value)}
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-xs font-bold text-[#0d1117] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 cursor-pointer"
                >
                  {RETURN_REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Section 2: Medicine Item Information */}
          <section className="rounded-xl border border-[#d8dadc] bg-[#fbfaf8] p-4 shadow-2xs">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-700 mb-3">
              Medicine Item Details
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-neutral-700">
                  Medicine Name <span className="text-red-500">*</span>
                </label>
                <select
                  value={formValues.medicine_id}
                  onChange={(event) => handleFieldChange("medicine_id", event.target.value)}
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-xs font-bold text-[#0d1117] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 cursor-pointer"
                  required
                >
                  <option value="">Select medicine from master catalog...</option>
                  {medicines.map((medicine) => (
                    <option key={medicine.id} value={medicine.id}>
                      {medicine.generic_name} {medicine.dosage ? `(${medicine.dosage})` : ""} {medicine.brand_name ? `- ${medicine.brand_name}` : ""}
                    </option>
                  ))}
                </select>
                {selectedMedicine && (
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500">
                    <Pill className="h-3 w-3 text-emerald-600" />
                    <span>Brand: {selectedMedicine.brand_name || "Generic"}</span>
                    <span>• Unit: {selectedMedicine.unit_of_measure || "units"}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-neutral-700">
                    Lot / Batch No. <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formValues.lot_no}
                    onChange={(event) => handleFieldChange("lot_no", event.target.value)}
                    className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 font-mono text-xs font-bold uppercase text-[#0d1117] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    placeholder="LOT-4021"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-neutral-700">
                    Expiration Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formValues.expiration_date}
                    onChange={(event) => handleFieldChange("expiration_date", event.target.value)}
                    className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-[#0d1117] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-neutral-700">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formValues.quantity}
                    onChange={(event) => handleFieldChange("quantity", event.target.value)}
                    className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-xs font-black text-[#0d1117] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    placeholder="e.g. 50"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-neutral-700">
                    Unit Cost (PHP)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formValues.unit_cost}
                    onChange={(event) => handleFieldChange("unit_cost", event.target.value)}
                    className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-[#0d1117] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-700">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="font-bold text-[#0d1117]">Return Batch Summary</span>
            </div>
            <div className="flex items-center gap-5">
              <span>
                Total Units: <strong className="text-[#0d1117]">{parseInt(formValues.quantity, 10) || 0}</strong>
              </span>
              <span>
                Est. Value: <strong className="text-emerald-800">PHP {totalEstimatedCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Standard PRDS Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-neutral-100 bg-neutral-50 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0d1117] px-5 py-2 text-xs font-black text-white shadow-sm hover:bg-neutral-800 active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                {isBhw ? "Submit Return to CHO" : "Save Stock Return"}
              </>
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
