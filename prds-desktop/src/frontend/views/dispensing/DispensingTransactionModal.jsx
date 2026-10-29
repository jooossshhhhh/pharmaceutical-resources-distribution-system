import { useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Info,
  MapPin,
  Pill,
  User,
  X,
  AlertTriangle,
  Building2,
  Phone,
  RefreshCw,
} from "lucide-react";

import ModalShell from "../../components/ModalShell";
import { useAuth } from "../../context/useAuth";
import { voidDispensingTransaction } from "@backend/services/dispensingService";
import {
  formatDispensingDateTime,
  formatTransactionNumber,
  getFollowUpDisplay,
  getMedicineLabel,
} from "@shared/utils/dispensingUtils";
import {
  formatPatientAddress,
  formatPatientAge,
  formatPatientCode,
  formatPatientContact,
  formatPatientDateOfBirth,
  formatPatientName,
} from "@shared/utils/patientUtils";

export default function DispensingTransactionModal({
  isOpen,
  onClose,
  transaction,
  onVoidSuccess,
}) {
  if (!isOpen || !transaction) {
    return null;
  }

  const { profile } = useAuth();
  const isPharmaII = profile?.role === "PHARMA_II";

  const isVoided = Boolean(transaction.voidedAt);
  const canVoid = !isVoided && isPharmaII;

  const [isVoidConfirmOpen, setIsVoidConfirmOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [voidError, setVoidError] = useState("");

  const patient = transaction.patient;
  const patientName = patient ? formatPatientName(patient) : "Unassigned Patient";
  const patientCode = patient?.patient_code ? formatPatientCode(patient.patient_code) : "—";
  const rows = transaction.rows || [];

  const totalUnits = useMemo(() => {
    return rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
  }, [rows]);

  const handleConfirmVoid = async () => {
    if (!voidReason.trim()) {
      setVoidError("A void reason is required.");
      return;
    }

    setIsVoiding(true);
    setVoidError("");
    try {
      const txId = transaction.transactionId || transaction.key;
      await voidDispensingTransaction({
        reason: voidReason.trim(),
        transactionId: txId,
      });

      setIsVoidConfirmOpen(false);
      onVoidSuccess?.();
    } catch (err) {
      console.error("Failed to void transaction:", err);
      setVoidError(err?.message || "Failed to void transaction. Check your permissions.");
    } finally {
      setIsVoiding(false);
    }
  };

  return (
    <ModalShell onClose={onClose} panelClassName="max-w-3xl">
      <div className="w-full overflow-hidden rounded-2xl bg-white shadow-2xl border border-[#CFDDE0]">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-[#CFDDE0] bg-[#F9FBFB] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E3EEF5] text-[#1F4A66] ring-1 ring-[#34769B]/20">
              <Pill className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-[#1B2B30] tracking-tight">
                  Dispensing ID: {formatTransactionNumber(transaction.transactionId || transaction.key)}
                </h3>
                {isVoided ? (
                  <span className="rounded-full bg-[#FBE9E3] border border-[#D9826B]/30 px-2.5 py-0.5 text-[11px] font-black text-[#8F3F2B]">
                    Voided
                  </span>
                ) : transaction.status === "COMPLETED" ? (
                  <span className="rounded-full bg-[#E2F3EC] border border-[#4C9F80]/30 px-2.5 py-0.5 text-[11px] font-black text-[#226048] flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Completed
                  </span>
                ) : transaction.status === "PARTIAL" || transaction.status === "SCHEDULED" ? (
                  <span className="rounded-full bg-[#FEF3C7] border border-[#F59E0B]/30 px-2.5 py-0.5 text-[11px] font-black text-[#92400E] flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Partial
                  </span>
                ) : transaction.status === "REFERRED" ? (
                  <span className="rounded-full bg-[#E3EEF5] border border-[#34769B]/30 px-2.5 py-0.5 text-[11px] font-black text-[#1F4A66]">
                    Referred
                  </span>
                ) : (
                  <span className="rounded-full bg-[#FEF3C7] border border-[#F59E0B]/30 px-2.5 py-0.5 text-[11px] font-black text-[#92400E]">
                    {transaction.status || "Partial"}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-[#5B7077] flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#5B7077]" />
                {formatDispensingDateTime(transaction.dispenseDate)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5B7077] hover:bg-[#E5EFF1] hover:text-[#1B2B30] transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto prds-modal-scrollbar">
          {/* Voided Notice */}
          {isVoided && (
            <div className="rounded-xl border border-[#D9826B]/40 bg-[#FBE9E3] p-4 text-xs">
              <p className="font-bold text-[#8F3F2B] flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> This dispensing transaction was voided on{" "}
                {formatDispensingDateTime(transaction.voidedAt)}
              </p>
              {transaction.voidReason && (
                <p className="mt-1 text-[#8F3F2B]/90 font-medium pl-5">
                  Reason: {transaction.voidReason}
                </p>
              )}
            </div>
          )}

          {/* Patient Card */}
          <section className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-4.5 shadow-2xs">
            {/* Header: Label + Registered Facility Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#CFDDE0]/70 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#E3EEF5] text-[#1F4A66]">
                  <User className="h-3 w-3" />
                </span>
                <p className="text-[11px] font-black uppercase tracking-wider text-[#34769B]">
                  Patient Information
                </p>
              </div>

              {patient?.facility?.facility_name && (
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#CFDDE0] bg-white px-2.5 py-1 text-xs font-bold text-[#1B2B30] shadow-2xs">
                  <Building2 className="h-3.5 w-3.5 text-[#34769B]" />
                  <span>{patient.facility.facility_name}</span>
                  {patient.facility.facility_code && (
                    <span className="font-mono text-[10.5px] font-bold text-[#1F4A66] bg-[#E3EEF5] px-1.5 py-0.5 rounded border border-[#34769B]/20">
                      {patient.facility.facility_code}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Patient Primary Details */}
            <div className="mt-3.5 flex flex-wrap items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1F4E5A] text-base font-black text-white shadow-xs">
                {patient?.first_name?.[0] || "P"}
                {patient?.last_name?.[0] || "T"}
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-black text-[#1B2B30] tracking-tight">{patientName}</h4>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-bold text-[#34769B] bg-[#E3EEF5] border border-[#34769B]/20 px-2 py-0.5 rounded-md">
                    {patientCode}
                  </span>
                  {patient?.gender && (
                    <span className="text-[11px] font-bold text-[#1F4E5A] bg-white border border-[#CFDDE0] px-2 py-0.5 rounded-md">
                      {patient.gender}
                    </span>
                  )}
                  {patient?.date_of_birth && (
                    <span className="text-[11px] font-bold text-[#5B7077] bg-white border border-[#CFDDE0] px-2 py-0.5 rounded-md">
                      {formatPatientAge(patient.date_of_birth)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Structured Info Grid */}
            <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 border-t border-[#CFDDE0]/60 text-xs">
              <div className="rounded-lg bg-white border border-[#CFDDE0]/70 p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#5B7077] flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 text-[#34769B]" /> Date of Birth
                </p>
                <p className="mt-1 font-bold text-[#1B2B30] text-xs">
                  {formatPatientDateOfBirth(patient?.date_of_birth)}
                </p>
                {patient?.date_of_birth && (
                  <p className="text-[10.5px] text-[#5B7077] font-medium mt-0.5">
                    {formatPatientAge(patient.date_of_birth)} old
                  </p>
                )}
              </div>

              <div className="rounded-lg bg-white border border-[#CFDDE0]/70 p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#5B7077] flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-[#34769B]" /> Contact Number
                </p>
                <p className="mt-1 font-bold text-[#1B2B30] text-xs font-mono">
                  {formatPatientContact(patient?.contact_number)}
                </p>
              </div>

              <div className="rounded-lg bg-white border border-[#CFDDE0]/70 p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#5B7077] flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-[#34769B]" /> Residential Address
                </p>
                <p className="mt-1 font-bold text-[#1B2B30] text-xs truncate" title={patient?.address || "—"}>
                  {formatPatientAddress(patient?.address)}
                </p>
              </div>
            </div>
          </section>

          {/* Dispensing Context Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#5B7077]">
                Prescribed By
              </p>
              <p className="mt-1 text-xs font-black text-[#1B2B30] truncate">
                {transaction.rows?.[0]?.prescribed_by || "—"}
              </p>
            </div>
            <div className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#5B7077]">
                Dispensed By
              </p>
              <p className="mt-1 text-xs font-black text-[#1B2B30] truncate">
                {transaction.rows?.[0]?.manual_dispensed_by ||
                  (transaction.dispenser
                    ? `${transaction.dispenser.first_name} ${transaction.dispenser.last_name}`
                    : "Dispensing Staff")}
              </p>
            </div>
            <div className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#5B7077]">
                Dispensing Facility
              </p>
              <p className="mt-1 text-xs font-black text-[#1B2B30] truncate">
                {transaction.dispensingFacility?.facility_name ||
                  transaction.rows?.[0]?.dispensing_facility?.facility_name ||
                  "City Health Office"}
              </p>
            </div>
          </div>

          {/* Medicines Itemized Table */}
          <div>
            {/* Follow-up journey banner if this transaction is claiming a remaining balance */}
            {transaction.isFollowUp && (
              <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-[#34769B]/25 bg-[#E3EEF5]/60 p-3 text-xs text-[#1F4A66]">
                <Info className="h-4 w-4 shrink-0 text-[#34769B] mt-0.5" />
                <div className="leading-relaxed">
                  <p className="font-bold text-[#1B2B30]">
                    Follow-up Balance Claim
                  </p>
                  <p className="text-[11.5px] text-[#486574] mt-0.5">
                    This transaction claims the remaining prescription balance from an earlier visit
                    {transaction.followUpOfDate && (
                      <>
                        {" "}on{" "}
                        <span className="font-semibold text-[#1B2B30]">
                          {formatDispensingDateTime(transaction.followUpOfDate)}
                        </span>
                      </>
                    )}
                    .
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-[#1B2B30]">
                Dispensed Medicines ({rows.length} {rows.length === 1 ? "item" : "items"})
              </h4>
              <span className="text-xs font-bold text-[#5B7077]">
                Total Units: <strong className="text-[#1B2B30]">{totalUnits.toLocaleString()}</strong>
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#CFDDE0] bg-white shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#CFDDE0] bg-[#F9FBFB] text-[11px] font-bold text-[#5B7077] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Medicine Description</th>
                    <th className="px-4 py-3">Batch / Lot</th>
                    <th className="px-4 py-3">Expiry Date</th>
                    <th className="px-4 py-3 text-right">Needed</th>
                    <th className="px-4 py-3 text-right">Released</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CFDDE0]/50">
                  {rows.map((row, index) => {
                    const isFollowUp = Boolean(row.is_follow_up);
                    const prescribed = Number(row.prescribed_needed ?? row.needed_quantity ?? row.quantity ?? 0);
                    const prevClaimed = Number(row.previously_claimed || 0);
                    const neededThisVisit = Number(
                      row.needed_this_visit ??
                      (isFollowUp && prevClaimed > 0 ? Math.max(0, prescribed - prevClaimed) : (row.needed_quantity ?? prescribed))
                    );
                    const released = Number(row.quantity || 0);
                    const isLineFulfilled =
                      row.balance_remaining === 0 ||
                      transaction.status === "COMPLETED" ||
                      (neededThisVisit <= released && (row.balance_remaining === undefined || row.balance_remaining <= 0));
                    const followUp = isLineFulfilled ? "" : getFollowUpDisplay(row);

                    const brandName = (
                      row.batch?.brand_name ||
                      row.medicine?.brand_name ||
                      row.brand_name ||
                      ""
                    ).trim();

                    return (
                      <tr key={row.id || index} className="hover:bg-[#F9FBFB]/70 transition">
                        <td className="px-4 py-3 font-black text-[#1B2B30]">
                          <div>
                            <p>
                              {getMedicineLabel(row.medicine) || "Medicine Item"}
                              {brandName && brandName !== "—" && (
                                <span className="ml-1.5 text-xs font-semibold text-[#006571]">
                                  ({brandName})
                                </span>
                              )}
                            </p>
                            {(row.medicine?.dosage || brandName) && (
                              <p className="text-[11px] font-medium text-[#5B7077]">
                                {[
                                  brandName && brandName !== "—" ? brandName : null,
                                  row.medicine?.dosage,
                                  row.medicine?.unit_of_measure,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            )}
                            {followUp && (
                              <span className="mt-1 inline-block rounded-md bg-[#FEF3C7] border border-[#F59E0B]/30 px-2 py-0.5 text-[10px] font-bold text-[#92400E]">
                                {followUp}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] font-bold text-[#5B7077]">
                          {row.batch?.batch_number || "—"}
                        </td>
                        <td className="px-4 py-3 text-[#5B7077] font-medium">
                          {row.batch?.expiration_date || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-[#5B7077] tabular-nums">
                          {isFollowUp && prevClaimed > 0 ? (
                            <div>
                              <span className="text-[#1B2B30] font-black">{neededThisVisit.toLocaleString()}</span>
                              <span className="block text-[10px] font-bold text-[#34769B]">Remaining Balance</span>
                              <p className="text-[10px] font-medium text-[#5B7077] mt-0.5">
                                Prescribed: {prescribed.toLocaleString()} · Prev Claimed: {prevClaimed.toLocaleString()}
                              </p>
                            </div>
                          ) : (
                            <span className="text-[#1B2B30] font-black">{neededThisVisit.toLocaleString()}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-[#1B2B30] tabular-nums">
                          <span className="text-[#1B2B30] font-black">{released.toLocaleString()}</span>
                          {isFollowUp && prevClaimed > 0 && neededThisVisit <= released && (
                            <span className="block text-[10px] font-bold text-[#226048]">Fulfilled</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#CFDDE0] bg-[#F9FBFB] px-6 py-4">
          <div>
            {canVoid && (
              <button
                type="button"
                onClick={() => {
                  setVoidError("");
                  setVoidReason("");
                  setIsVoidConfirmOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/80 px-3.5 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 hover:border-red-300 cursor-pointer shadow-2xs"
                title="Void and cancel this transaction (Restores stock to inventory)"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                <span>Void Transaction</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Void Confirmation Dialog */}
        {isVoidConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-[#1B2B30]">
                    Void Dispensing Transaction
                  </h4>
                  <p className="text-xs text-[#5B7077]">
                    Dispensing ID: {formatTransactionNumber(transaction.transactionId || transaction.key)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-red-100 bg-red-50/70 p-3 text-xs text-red-800 space-y-1">
                <p className="font-bold">This action will:</p>
                <ul className="list-disc list-inside text-[11px] space-y-0.5 text-red-700">
                  <li>Cancel this transaction permanently with an audit log.</li>
                  <li>Return all <strong>{totalUnits.toLocaleString()} unit(s)</strong> back to the medicine inventory.</li>
                  <li>Restore the patient's monthly claim allocation.</li>
                </ul>
              </div>

              {voidError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-bold text-red-700">
                  {voidError}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-[#5B7077] mb-1">
                  Reason for Voiding <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g., Wrong dosage released, duplicate entry, prescription changed..."
                  rows={3}
                  className="w-full rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-2.5 text-xs font-medium text-[#1B2B30] outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 transition resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#CFDDE0]">
                <button
                  type="button"
                  onClick={() => setIsVoidConfirmOpen(false)}
                  disabled={isVoiding}
                  className="btn-secondary rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmVoid}
                  disabled={isVoiding || !voidReason.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isVoiding ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Voiding...</span>
                    </>
                  ) : (
                    <span>Confirm Void</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
