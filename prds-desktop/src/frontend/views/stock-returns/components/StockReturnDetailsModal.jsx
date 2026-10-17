import { useState } from "react";
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
} from "@backend/services/stockReturnsService";
import { formatCurrency, formatDate, formatNumber } from "@shared/utils/inventoryUtils";

/**
 * Returns clean brand name or empty string if generic/none.
 */
const formatBrandName = (brand) => {
  if (!brand) return "";
  const trimmed = String(brand).trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === "generic" ||
    lower === "generic (no brand)" ||
    lower === "none" ||
    lower === "n/a" ||
    lower === "—" ||
    lower === "-"
  ) {
    return "";
  }
  return trimmed;
};

export default function StockReturnDetailsModal({
  isOpen,
  onClose,
  returnRecord,
  allReturns = [],
  onRecordUpdated,
  currentUserProfile,
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  if (!isOpen || !returnRecord) return null;

  const isCho = currentUserProfile?.role === "PHARMA_I" || currentUserProfile?.role === "PHARMA_II";
  const statusBadge = getReturnStatusBadge(returnRecord.status);
  const isConfirmed = statusBadge.value === "CONFIRMED";
  const reasonTone = getReturnReasonTone(returnRecord.reason);
  const reasonLabel = getReturnReasonLabel(returnRecord.reason);

  const targetReturnId = returnRecord.return_id || returnRecord.return_slip_no;
  const matchingItems = targetReturnId && allReturns?.length
    ? allReturns.filter((r) => (r.return_id || r.return_slip_no) === targetReturnId)
    : [];

  const lineItems = Array.isArray(returnRecord.items) && returnRecord.items.length > 0
    ? returnRecord.items
    : matchingItems.length > 0
    ? matchingItems
    : [returnRecord];

  const totalQty = lineItems.reduce((acc, it) => acc + (parseInt(it.quantity, 10) || 0), 0);
  const totalValue = lineItems.reduce((acc, it) => {
    const itemQty = parseInt(it.quantity, 10) || 0;
    const itemCost = parseFloat(it.unit_cost) || 0;
    return acc + itemQty * itemCost;
  }, 0);

  const returnIdDisplay =
    returnRecord.return_id ||
    returnRecord.return_slip_no ||
    (returnRecord.id ? `RET-${String(returnRecord.id).slice(0, 8).toUpperCase()}` : "-");

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
        itemsToConfirm.map((it) => confirmStockReturn(it.id, currentUserProfile.id))
      );
      onRecordUpdated?.({
        ...returnRecord,
        status: "CONFIRMED",
        confirmed_by_id: currentUserProfile.id,
        confirmed_at: new Date().toISOString(),
      });
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
          <section className="grid grid-cols-1 gap-3 sm:gap-4 rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 text-xs sm:grid-cols-2">
            <div>
              <span className="block text-[11px] font-black uppercase tracking-wider text-neutral-400">
                Returning Station
              </span>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[#0d1117]">
                <Building2 className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>{facilityName}</span>
              </p>
            </div>

            <div>
              <span className="block text-[11px] font-black uppercase tracking-wider text-neutral-400">
                Date Submitted / Returned
              </span>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[#0d1117]">
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
              <span className="block text-[11px] font-black uppercase tracking-wider text-neutral-400">
                Reason
              </span>
              <div className="mt-1">
                <span className={`inline-flex rounded-md px-2.5 py-0.5 text-xs font-bold ${reasonTone}`}>
                  {reasonLabel}
                </span>
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-black uppercase tracking-wider text-neutral-400">
                Confirmation Details
              </span>
              {isConfirmed ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-emerald-800">
                  <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    Confirmed on {formatDate(returnRecord.confirmed_at || returnRecord.return_date)} by CHO Pharmacist
                  </span>
                </p>
              ) : (
                <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-amber-700">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  <span>Pending CHO Confirmation</span>
                </p>
              )}
            </div>

            {returnRecord.remarks && (
              <div className="sm:col-span-2 pt-2.5 border-t border-neutral-200/60">
                <span className="text-[11px] font-black uppercase tracking-wider text-neutral-400 mr-2">
                  Remarks:
                </span>
                <span className="text-xs sm:text-sm font-medium text-neutral-700">{returnRecord.remarks}</span>
              </div>
            )}
          </section>

          {/* Section 2: Returned Line Items Table */}
          <section className="overflow-hidden rounded-xl border border-neutral-200">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs sm:text-sm">
                <thead className="border-b border-neutral-200/80 bg-white text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 whitespace-nowrap">Medicine Name</th>
                    <th className="px-4 py-2.5 whitespace-nowrap">Medicine Brand</th>
                    <th className="px-4 py-2.5 whitespace-nowrap">Batch / Lot</th>
                    <th className="px-4 py-2.5 whitespace-nowrap">Expiration Date</th>
                    <th className="px-4 py-2.5 text-right whitespace-nowrap">Quantity</th>
                    {isCho && <th className="px-4 py-2.5 text-right whitespace-nowrap">Unit Cost</th>}
                    {isCho && <th className="px-4 py-2.5 text-right whitespace-nowrap">Total Value</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white">
                  {lineItems.map((item, idx) => {
                    const itemQty = parseInt(item.quantity, 10) || 0;
                    const itemCost = parseFloat(item.unit_cost) || 0;
                    const itemTotal = itemQty * itemCost;
                    const brandDisplay = formatBrandName(item.brand_name);

                    return (
                      <tr key={item.id || idx} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="px-4 py-3 align-middle font-black text-[#0d1117] text-sm">
                          {item.medicine_name || item.medicine?.generic_name || "Medicine Name"}
                        </td>
                        <td className="px-4 py-3 align-middle text-neutral-700 font-medium text-xs sm:text-sm">
                          {brandDisplay}
                        </td>
                        <td className="px-4 py-3 align-middle font-mono font-semibold text-neutral-700 text-xs sm:text-sm whitespace-nowrap">
                          {item.lot_no || item.batch_number || "—"}
                        </td>
                        <td className="px-4 py-3 align-middle text-neutral-700 font-medium text-xs sm:text-sm whitespace-nowrap">
                          {item.expiration_date ? formatDate(item.expiration_date) : "—"}
                        </td>
                        <td className="px-4 py-3 align-middle text-right font-black text-[#0d1117] text-sm tabular-nums whitespace-nowrap">
                          {formatNumber(itemQty)}
                        </td>
                        {isCho && (
                          <td className="px-4 py-3 align-middle text-right font-semibold text-neutral-700 text-xs sm:text-sm whitespace-nowrap">
                            {itemCost > 0 ? formatCurrency(itemCost) : "—"}
                          </td>
                        )}
                        {isCho && (
                          <td className="px-4 py-3 align-middle text-right font-black text-emerald-800 text-sm whitespace-nowrap">
                            {itemTotal > 0 ? formatCurrency(itemTotal) : "—"}
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50/70 px-4 py-2.5 text-xs sm:text-sm text-neutral-600">
            <span className="font-bold text-[#0d1117]">Return Item Summary</span>
            <div className="flex items-center gap-4">
              <span>
                Total Units: <strong className="font-black text-sm text-[#0d1117]">{formatNumber(totalQty)}</strong>
              </span>
              {isCho && (
                <span>
                  Total Valuation: <strong className="font-black text-sm text-emerald-800">{formatCurrency(totalValue)}</strong>
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
