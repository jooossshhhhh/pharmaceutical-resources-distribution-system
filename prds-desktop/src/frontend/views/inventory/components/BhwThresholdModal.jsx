import { useEffect, useMemo, useState } from "react";
import { Info, Package, Sparkles, Sliders, X } from "lucide-react";
import ModalShell from "../../../components/ModalShell";
import {
  formatNumber,
  getMedicineName,
  getStockStatus,
  getThresholdCalculationDetails,
} from "@shared/utils/inventoryUtils";
import { isChoFacility } from "@shared/utils/facilityUtils";

export default function BhwThresholdModal({
  isOpen,
  item,
  facilityName = "Barangay Health Station",
  consumptionByMedicine = {},
  onClose,
  onSave,
}) {
  const displayFacilityName =
    (typeof facilityName === "string" ? facilityName : facilityName?.facility_name) ||
    item?.facility?.facility_name ||
    "Barangay Health Station";
  const medicineId = item?.medicine_id || item?.id;
  const totalQuantity = useMemo(() => {
    if (item?.lots?.length) {
      return item.lots.reduce((sum, l) => sum + Number(l.quantity || 0), 0);
    }
    return Number(item?.quantity || 0);
  }, [item]);

  const currentThreshold = Number(item?.threshold || 0);

  const threshDetails = useMemo(() => {
    return getThresholdCalculationDetails({
      adc: consumptionByMedicine?.[medicineId],
      quantity: totalQuantity,
    });
  }, [consumptionByMedicine, medicineId, totalQuantity]);

  const [thresholdInput, setThresholdInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setThresholdInput(String(currentThreshold > 0 ? currentThreshold : threshDetails.threshold));
      setModalError("");
      setIsSaving(false);
    }
  }, [isOpen, currentThreshold, threshDetails.threshold]);

  if (!isOpen || !item) {
    return null;
  }

  const stockStatus = getStockStatus({
    quantity: totalQuantity,
    threshold: Number(thresholdInput || currentThreshold),
  });

  const isMatchingSuggested = Number(thresholdInput) === threshDetails.threshold;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const val = Number(thresholdInput);
    if (!Number.isFinite(val) || val < 0) {
      setModalError("Threshold must be a valid number (0 or higher).");
      return;
    }

    setIsSaving(true);
    setModalError("");
    try {
      await onSave({
        medicineId,
        threshold: Math.floor(val),
        facilityId: item.facility_id || item.facility?.id,
      });
      onClose();
    } catch (err) {
      setModalError(err.message || "Failed to update threshold.");
    } finally {
      setIsSaving(false);
    }
  };

  const isCho = isChoFacility(facilityName);

  return (
    <ModalShell
      labelledBy="bhw-threshold-modal-title"
      onClose={isSaving ? undefined : onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="max-w-lg"
    >
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl animate-in fade-in duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h3 id="bhw-threshold-modal-title" className="text-base font-black leading-tight text-[#0d1117]">
                {isCho ? "Medicine Restock Threshold" : "Station Restock Threshold"}
              </h3>
              <p className="text-xs font-semibold text-neutral-500">
                {displayFacilityName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {modalError && (
            <div className="flex items-start justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              <span>{modalError}</span>
              <button
                type="button"
                onClick={() => setModalError("")}
                className="text-red-500 hover:text-red-700 p-0.5 rounded cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Medicine Identification Card */}
          <div className="rounded-xl border border-neutral-200/80 bg-[#fbfaf8] p-3.5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
              Selected Medicine
            </p>
            <p className="mt-0.5 text-sm font-black text-[#0d1117]">
              {getMedicineName(item)}
            </p>
            <div className="mt-2 flex items-center justify-between border-t border-neutral-200/60 pt-2 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-neutral-600">
                <Package className="h-3.5 w-3.5 text-neutral-400" />
                On-hand Station Stock:
                <strong className="text-[#0d1117]">{formatNumber(totalQuantity)}</strong>
              </span>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${stockStatus.badgeClass}`}>
                {stockStatus.label}
              </span>
            </div>
          </div>

          {/* Threshold Input Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="bhw-threshold-input" className="block text-xs font-black uppercase tracking-wide text-neutral-700">
                Minimum Restock Threshold <span className="text-red-500">*</span>
              </label>

              {isMatchingSuggested ? (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1F4E5A] bg-[#E5EFF1] border border-[#34769B]/25 rounded-md px-2 py-0.5"
                  title={threshDetails.description}
                >
                  <Sparkles className="h-3 w-3 text-[#1F4E5A]" />
                  Dynamic ({threshDetails.shortLabel})
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setThresholdInput(String(threshDetails.threshold))}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-300 rounded-md px-2 py-0.5 transition cursor-pointer shadow-2xs"
                  title={`Apply dynamically calculated threshold: ${threshDetails.threshold}`}
                >
                  <Sparkles className="h-3 w-3 text-teal-700" />
                  Apply Suggested ({formatNumber(threshDetails.threshold)})
                </button>
              )}
            </div>

            <div className="relative">
              <input
                id="bhw-threshold-input"
                type="number"
                min="0"
                step="1"
                required
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                placeholder={String(threshDetails.threshold)}
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-bold text-[#0d1117] outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400 pointer-events-none">
                units
              </span>
            </div>

            {/* Helper Info Card */}
            <div className="flex items-start gap-2 rounded-lg border border-neutral-200/70 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              <Info className="h-4 w-4 shrink-0 text-teal-600 mt-0.5" />
              <div className="leading-snug">
                <p className="font-semibold text-neutral-700">
                  {threshDetails.description}.
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  When your on-hand stock reaches or drops below this number, PRDS flags your station with a <strong>Low Stock</strong> warning and automatically elevates your requisition priority to <strong>HIGH</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-neutral-100 px-6 py-3.5 bg-neutral-50/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-9 rounded-lg border border-neutral-200 bg-white px-4 text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="btn-primary inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-black text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Threshold"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
