import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Pill,
  Receipt,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";

import ModalShell from "../../../components/ModalShell";
import {
  getReturnReasonLabel,
  getReturnReasonTone,
  getReturnStatusBadge,
  verifyStockReturn,
} from "@backend/services/stockReturnsService";
import { formatCurrency, formatDate, formatNumber } from "@shared/utils/inventoryUtils";

export default function StockReturnDetailsModal({
  isOpen,
  onClose,
  returnRecord,
  onRecordUpdated,
  currentUserProfile,
}) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  if (!isOpen || !returnRecord) return null;

  const isCho = currentUserProfile?.role === "PHARMA_I" || currentUserProfile?.role === "PHARMA_II";
  const statusBadge = getReturnStatusBadge(returnRecord.status);
  const reasonTone = getReturnReasonTone(returnRecord.reason);
  const reasonLabel = getReturnReasonLabel(returnRecord.reason);
  const qty = parseInt(returnRecord.quantity, 10) || 0;
  const unitCost = parseFloat(returnRecord.unit_cost) || 0;
  const totalValue = qty * unitCost;
  const returnSlipDisplay =
    returnRecord.return_slip_no ||
    (returnRecord.id ? `RET-${String(returnRecord.id).slice(0, 8).toUpperCase()}` : "-");

  const handleVerify = async () => {
    if (!currentUserProfile?.id) {
      setVerifyError("User profile is missing. Please re-login.");
      return;
    }
    setIsVerifying(true);
    setVerifyError("");
    try {
      await verifyStockReturn(returnRecord.id, currentUserProfile.id);
      onRecordUpdated?.({
        ...returnRecord,
        status: "VERIFIED",
        verified_by_id: currentUserProfile.id,
        verified_at: new Date().toISOString(),
      });
      onClose();
    } catch (err) {
      console.error("[StockReturnDetailsModal] Verification error:", err);
      setVerifyError(err.message || "Failed to verify stock return.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="max-w-2xl w-full p-0 overflow-hidden rounded-xl bg-white shadow-2xl"
    >
      <div className="flex max-h-[90vh] flex-col overflow-hidden">
        {/* Standard PRDS Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 shrink-0">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-lg font-black leading-tight text-[#0d1117]">
                  {returnSlipDisplay}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${statusBadge.tone}`}
                >
                  {returnRecord.status === "VERIFIED" && <ShieldCheck className="h-3 w-3 shrink-0" />}
                  {statusBadge.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-neutral-500">
                Stock return voucher • Barangay to Central Warehouse
              </p>
            </div>
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
          {verifyError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="flex-1">{verifyError}</p>
            </div>
          )}

          {/* Section 1: Overview Grid */}
          <section className="grid grid-cols-1 gap-3 rounded-xl border border-[#d8dadc] bg-[#fbfaf8] p-4 text-xs sm:grid-cols-2">
            <div>
              <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                Returning Station
              </span>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-black text-[#0d1117]">
                <Building2 className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>{returnRecord.facility?.facility_name || "Barangay Health Center"}</span>
              </p>
            </div>

            <div>
              <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                Date Submitted / Returned
              </span>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-[#0d1117]">
                <Calendar className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
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
              <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                Return Reason
              </span>
              <div className="mt-1">
                <span className={`inline-flex rounded-md px-2.5 py-0.5 text-xs font-bold ${reasonTone}`}>
                  {reasonLabel}
                </span>
              </div>
            </div>

            <div>
              <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                Lot / Batch Number
              </span>
              <p className="mt-1 font-mono text-xs font-black text-[#0d1117]">
                {returnRecord.lot_no || returnRecord.batch_number || "—"}
              </p>
            </div>
          </section>

          {/* Section 2: Returned Line Items Table */}
          <section className="overflow-hidden rounded-xl border border-[#d8dadc]">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="border-b border-neutral-100 bg-[#f7f6f3] text-[11px] font-black uppercase tracking-[0.14em] text-[#42474e]">
                <tr>
                  <th className="px-3.5 py-2.5">Medicine Item</th>
                  <th className="px-3.5 py-2.5">Batch / Lot</th>
                  <th className="px-3.5 py-2.5 text-right">Quantity</th>
                  <th className="px-3.5 py-2.5 text-right">Unit Cost</th>
                  <th className="px-3.5 py-2.5 text-right">Total Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                <tr>
                  <td className="px-3.5 py-3">
                    <div className="flex items-center gap-1.5 font-black text-[#0d1117]">
                      <Pill className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>{returnRecord.medicine_name || "Medicine Item"}</span>
                    </div>
                    {returnRecord.brand_name && (
                      <p className="mt-0.5 text-[11px] font-semibold text-neutral-500">
                        Brand: {returnRecord.brand_name}
                      </p>
                    )}
                  </td>
                  <td className="px-3.5 py-3 font-mono font-bold text-neutral-700">
                    {returnRecord.lot_no || returnRecord.batch_number || "—"}
                  </td>
                  <td className="px-3.5 py-3 text-right font-black text-[#0d1117]">
                    {formatNumber(qty)}
                  </td>
                  <td className="px-3.5 py-3 text-right font-semibold text-neutral-700">
                    {unitCost > 0 ? formatCurrency(unitCost) : "—"}
                  </td>
                  <td className="px-3.5 py-3 text-right font-black text-emerald-800">
                    {totalValue > 0 ? formatCurrency(totalValue) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Section 3: Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-700">
            <span className="font-bold text-[#0d1117]">Return Item Summary</span>
            <div className="flex items-center gap-5">
              <span>
                Total Units: <strong className="text-[#0d1117]">{formatNumber(qty)}</strong>
              </span>
              <span>
                Total Valuation: <strong className="text-emerald-800">{formatCurrency(totalValue)}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Standard PRDS Modal Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 px-6 py-3.5">
          <div className="text-[11px] font-semibold text-neutral-500">
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

            {isCho && returnRecord.status !== "VERIFIED" && (
              <button
                type="button"
                onClick={handleVerify}
                disabled={isVerifying}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#00a36c] px-4 py-2 text-xs font-black text-white shadow-2xs hover:bg-[#008f5d] active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
              >
                {isVerifying ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Verify &amp; Accept Return
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
