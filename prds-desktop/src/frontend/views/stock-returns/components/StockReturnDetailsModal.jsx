import { useState, useMemo } from "react";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  RotateCcw,
  UserCheck,
} from "lucide-react";

import ModalShell from "../../../components/ModalShell";
import {
  confirmStockReturn,
  getReturnReasonLabel,
  getReturnReasonTone,
  getReturnStatusBadge,
  resolveStockReturnMedicineInfo,
} from "@backend/services/stockReturnsService";
import { formatCurrency, formatDate, formatNumber, formatReturnId } from "@shared/utils/inventoryUtils";

export default function StockReturnDetailsModal({
  isOpen,
  onClose,
  returnRecord,
  allReturns = [],
  medicines = [],
  inventory = [],
  onRecordUpdated,
  currentUserProfile,
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const medicinesMap = useMemo(() => {
    const map = new Map();
    for (const m of medicines || []) {
      if (m.id) map.set(m.id, m);
      if (m.generic_name) map.set(m.generic_name.toLowerCase().trim(), m);
    }
    return map;
  }, [medicines]);

  if (!isOpen || !returnRecord) return null;

  const isBhw = currentUserProfile?.role === "BHW";
  const isCho = !isBhw && (currentUserProfile?.role === "PHARMA_I" || currentUserProfile?.role === "PHARMA_II");
  const statusBadge = getReturnStatusBadge(returnRecord.status);
  const isConfirmed = statusBadge.value === "CONFIRMED";
  const reasonTone = getReturnReasonTone(returnRecord.reason);
  const reasonLabel = getReturnReasonLabel(returnRecord.reason);

  const targetReturnId = returnRecord.return_id || returnRecord.return_slip_no;
  const matchingItems = targetReturnId && allReturns?.length
    ? allReturns.filter((r) => {
        const idA = formatReturnId(r.return_id || r.return_slip_no);
        const idB = formatReturnId(targetReturnId);
        return idA === idB || (r.return_id || r.return_slip_no) === targetReturnId;
      })
    : [];

  const lineItems = Array.isArray(returnRecord.items) && returnRecord.items.length > 0
    ? returnRecord.items
    : matchingItems.length > 0
    ? matchingItems
    : [returnRecord];

  const resolveItemMedicine = (item) =>
    resolveStockReturnMedicineInfo(item, { medicinesMap, medicines, inventory });

  const totalQty = lineItems.reduce((acc, it) => acc + (parseInt(it.quantity, 10) || 0), 0);
  const totalValue = lineItems.reduce((acc, it) => {
    const info = resolveItemMedicine(it);
    return acc + info.itemTotal;
  }, 0);

  const returnIdDisplay =
    formatReturnId(returnRecord.return_id || returnRecord.return_slip_no) ||
    (returnRecord.id ? formatReturnId(returnRecord.id) : "-");

  const facilityName = returnRecord.facility?.facility_name || "Barangay Health Center";

  const handleConfirm = async () => {
    if (!currentUserProfile?.id) {
      setConfirmError("User profile is missing. Please re-login.");
      return;
    }
    setIsConfirming(true);
    setConfirmError("");
    try {
      const itemsToConfirm = lineItems.length > 0 ? lineItems : [returnRecord];
      await Promise.all(
        itemsToConfirm.map((it) => confirmStockReturn(it.id || it.return_id, currentUserProfile.id))
      );
      onRecordUpdated?.({
        ...returnRecord,
        status: "CONFIRMED",
        confirmed_by_id: currentUserProfile.id,
        confirmed_at: new Date().toISOString(),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("prds:inventory-changed", {
            detail: { action: "RETURN_CONFIRMED" },
          })
        );
        window.dispatchEvent(
          new CustomEvent("prds:stock-returns-changed", {
            detail: { action: "RETURN_CONFIRMED" },
          })
        );
      }
      onClose();
    } catch (err) {
      console.error("[StockReturnDetailsModal] Confirmation error:", err);
      setConfirmError(err.message || "Failed to confirm stock return.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="w-full max-w-4xl p-0 overflow-hidden rounded-2xl bg-white shadow-2xl transition-all"
    >
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden">
        {/* Standard PRDS Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 shrink-0">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-base sm:text-lg font-black leading-tight text-[#0d1117]">
                  {returnIdDisplay}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${statusBadge.tone}`}
                >
                  {isConfirmed && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                  {statusBadge.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs font-semibold text-neutral-500">
                {facilityName} to City Health Office
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="prds-modal-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-4.5">
          {confirmError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="flex-1">{confirmError}</p>
            </div>
          )}

          {/* Section 1: Overview Grid (Balanced 2x2 with Reorganized Confirmation Details) */}
          <section className="grid grid-cols-1 gap-2.5 sm:gap-3 rounded-xl border border-neutral-200/80 bg-neutral-50/70 p-3.5 text-xs sm:grid-cols-2">
            <div>
              <span className="block text-[10px] font-black uppercase tracking-wider text-neutral-400">
                Returning Station
              </span>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-[#0d1117]">
                <Building2 className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>{facilityName}</span>
              </p>
            </div>

            <div>
              <span className="block text-[10px] font-black uppercase tracking-wider text-neutral-400">
                Date Submitted / Returned
              </span>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-[#0d1117]">
                <Calendar className="h-4 w-4 text-neutral-400 shrink-0" />
                <span>
                  {returnRecord.return_date || returnRecord.submitted_at
                    ? formatDate(returnRecord.return_date || returnRecord.submitted_at)
                    : returnRecord.created_at
                    ? formatDate(returnRecord.created_at)
                    : "Today"}
                </span>
              </p>
            </div>

            <div>
              <span className="block text-[10px] font-black uppercase tracking-wider text-neutral-400">
                Reason
              </span>
              <div className="mt-0.5">
                <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${reasonTone}`}>
                  {reasonLabel}
                </span>
              </div>
            </div>

            <div>
              <span className="block text-[10px] font-black uppercase tracking-wider text-neutral-400">
                Confirmation Details
              </span>
              {isConfirmed ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-emerald-800">
                  <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    Confirmed on {formatDate(returnRecord.confirmed_at || returnRecord.return_date)} by CHO Pharmacist
                  </span>
                </p>
              ) : (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-amber-700">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  <span>Pending CHO Confirmation</span>
                </p>
              )}
            </div>

            {returnRecord.remarks && (
              <div className="sm:col-span-2 pt-2 border-t border-neutral-200/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mr-2">
                  Remarks:
                </span>
                <span className="text-xs font-medium text-neutral-700">{returnRecord.remarks}</span>
              </div>
            )}
          </section>

          {/* Section 2: Returned Line Items Table */}
          <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs sm:text-sm">
                <thead className="border-b border-neutral-200/80 bg-neutral-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 min-w-[240px]">Medicine Information</th>
                    <th className="px-4 py-2.5 whitespace-nowrap">Batch / Lot</th>
                    <th className="px-4 py-2.5 whitespace-nowrap">Expiration Date</th>
                    <th className="px-4 py-2.5 text-right whitespace-nowrap">Quantity</th>
                    {isCho && <th className="px-4 py-2.5 text-right whitespace-nowrap">Unit Cost</th>}
                    {isCho && <th className="px-4 py-2.5 text-right whitespace-nowrap">Total Value</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white">
                  {lineItems.map((item, idx) => {
                    const info = resolveItemMedicine(item);

                    return (
                      <tr key={item.id || idx} className="hover:bg-neutral-50/50 transition-colors">
                        {/* Column 1: Unified, Compact Medicine Information */}
                        <td className="px-4 py-2.5 align-middle">
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <span className="font-bold text-[#0d1117] text-sm leading-tight">
                                {info.genericName}
                              </span>
                              {info.dosage && (
                                <span className="text-xs font-medium text-neutral-600">
                                  {info.dosage}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500 font-medium">
                              {info.brand ? (
                                <span>
                                  Brand: <strong className="font-semibold text-neutral-700">{info.brand}</strong>
                                </span>
                              ) : (
                                <span className="text-neutral-400 italic">No brand (Generic)</span>
                              )}
                              {info.unit && (
                                <>
                                  <span className="text-neutral-300">·</span>
                                  <span>
                                    Unit: <span className="font-semibold text-neutral-700">{info.unit}</span>
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Column 2: Batch / Lot */}
                        <td className="px-4 py-2.5 align-middle font-mono font-bold text-neutral-800 text-xs sm:text-sm whitespace-nowrap">
                          {item.lot_no || item.batch_number || "—"}
                        </td>

                        {/* Column 3: Expiration Date */}
                        <td className="px-4 py-2.5 align-middle text-neutral-700 font-medium text-xs sm:text-sm whitespace-nowrap">
                          {item.expiration_date ? formatDate(item.expiration_date) : "—"}
                        </td>

                        {/* Column 4: Quantity */}
                        <td className="px-4 py-2.5 align-middle text-right font-black text-[#0d1117] text-sm tabular-nums whitespace-nowrap">
                          {formatNumber(info.itemQty)}
                          <span className="ml-1 text-xs font-semibold text-neutral-500 lowercase">
                            {info.unit}
                          </span>
                        </td>

                        {/* Column 5: Unit Cost (CHO only) */}
                        {isCho && (
                          <td className="px-4 py-2.5 align-middle text-right font-semibold text-neutral-700 text-xs sm:text-sm whitespace-nowrap">
                            {info.itemCost > 0 ? formatCurrency(info.itemCost) : "—"}
                          </td>
                        )}

                        {/* Column 6: Total Value (CHO only) */}
                        {isCho && (
                          <td className="px-4 py-2.5 align-middle text-right font-black text-emerald-800 text-sm whitespace-nowrap">
                            {info.itemTotal > 0 ? formatCurrency(info.itemTotal) : "—"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200/80 bg-neutral-50/70 px-4 py-2 text-xs sm:text-sm text-neutral-600">
            <span className="font-bold text-[#0d1117]">Return Item Summary</span>
            <div className="flex items-center gap-4">
              <span>
                Total Units: <strong className="font-black text-sm text-[#0d1117]">{formatNumber(totalQty)}</strong>
              </span>
              {isCho && (
                <span>
                  Total Cost: <strong className="font-black text-sm text-emerald-800">{formatCurrency(totalValue)}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Standard PRDS Modal Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/60 px-6 py-3.5">
          <div className="text-[11px] sm:text-xs font-semibold text-neutral-500">
            Current Status: <span className="font-black text-[#0d1117]">{statusBadge.label}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
            >
              Close
            </button>

            {isCho && !isConfirmed && (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isConfirming}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-800 active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
              >
                {isConfirming ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirm Return
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
