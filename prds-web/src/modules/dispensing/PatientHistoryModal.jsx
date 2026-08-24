import { useCallback, useEffect, useMemo, useState } from "react";

import { getExpiryStatus } from "../inventory/inventoryUtils";
import { formatPatientCode, formatPatientName } from "../patients/patientUtils";
import { getDispensingHistory, voidDispensingTransaction } from "./DispensingService";
import {
  buildDispensingCsv,
  downloadCsv,
  formatDispensingDateTime,
  formatDispensingDayParts,
  formatTransactionNumber,
  getMedicineFullLabel,
  getMedicineLabel,
  groupHistoryByTransaction,
  sortTransactions,
} from "./dispensingUtils";
import {
  ActiveBadge,
  ChevronDownIcon,
  DispensingModal,
  Field,
  FOCUS_RING,
  HistoryIcon,
  SortToggleButton,
  Textarea,
  VoidedBadge,
  XIcon,
} from "./DispensingUi";

function ClaimItem({ canVoid, defaultExpanded, onCancelled, transaction }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const dayParts = formatDispensingDayParts(transaction.dispenseDate);
  const panelId = `claim-panel-${transaction.key}`;

  const handleConfirmCancellation = async () => {
    if (!reason.trim()) {
      setError("A cancellation reason is required.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await voidDispensingTransaction({
        reason: reason.trim(),
        transactionId: transaction.transactionId || transaction.key,
      });
      await onCancelled();
    } catch (cancelError) {
      setError(cancelError.message || "Unable to cancel this claim.");
      setIsSaving(false);
    }
  };

  return (
    <article
      className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-200 ${
        expanded ? "border-[#6be9c2]" : "border-[#d8dadc]"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={`flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-left transition hover:bg-[#eff4ff] ${FOCUS_RING} ${
          expanded ? "bg-[#f8f9ff]" : ""
        }`}
      >
        <span className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-[#e5e7eb] bg-white py-1">
          <span className="text-sm leading-none font-bold text-[#0d1117] tabular-nums">{dayParts.day}</span>
          <span className="mt-0.5 text-[10px] font-bold tracking-wide text-[#6b7280]">{dayParts.month}</span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-blue-700 tabular-nums">
              {formatTransactionNumber(transaction.transactionId || transaction.key)}
            </span>
            {transaction.voidedAt ? <VoidedBadge /> : <ActiveBadge />}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-[#5f6673]">
            {dayParts.time} · {transaction.rows.length} record(s)
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-xs font-bold text-[#0d1117] tabular-nums">
            {transaction.totalQuantity.toLocaleString()}
          </span>
          <span className="block text-[10px] font-bold uppercase tracking-wide text-[#6b7280]">units</span>
        </span>

        <span
          aria-hidden="true"
          className={`shrink-0 text-[#6b7280] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        >
          <ChevronDownIcon />
        </span>
      </button>

      {expanded && (
        <div id={panelId} className="space-y-3 border-t border-[#e5e7eb] bg-[#f8f9ff] px-3 py-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-[#e5e7eb] bg-white p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#6b7280]">Dispensed By</p>
              <p className="mt-0.5 text-xs font-bold text-[#0d1117]">
                {transaction.dispenser
                  ? `${transaction.dispenser.first_name} ${transaction.dispenser.last_name}`
                  : "Unknown user"}
              </p>
            </div>
            <div className="rounded-lg border border-[#e5e7eb] bg-white p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#6b7280]">Total Units</p>
              <p className="mt-0.5 text-xs font-bold text-[#0d1117] tabular-nums">
                {transaction.totalQuantity.toLocaleString()} units
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#e5e7eb] bg-white">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead className="bg-[#f8f9ff] text-[10px] font-bold uppercase tracking-wide text-[#6b7280]">
                <tr>
                  <th className="px-3 py-2">Medicine</th>
                  <th className="px-3 py-2">Batch</th>
                  <th className="px-3 py-2">Expiry</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f2]">
                {transaction.rows.map((row) => {
                  const expiry = getExpiryStatus({ expiration_date: row.batch?.expiration_date });

                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        <p className="font-bold text-[#0d1117]">{getMedicineLabel(row.medicine)}</p>
                        <p className="text-[11px] text-[#5f6673]">{getMedicineFullLabel(row.medicine)}</p>
                      </td>
                      <td className="px-3 py-2 text-[#0d1117]">{row.batch?.batch_number || "No batch"}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${expiry.badgeClass}`}>
                          {expiry.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-[#0d1117] tabular-nums">
                        {Number(row.quantity || 0).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {transaction.voidedAt && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-red-700">Cancellation Reason</p>
              <p className="mt-1 text-xs text-[#0d1117]">{transaction.voidReason || "No reason recorded."}</p>
              <p className="mt-1 text-[11px] text-[#5f6673]">
                Cancelled {formatDispensingDateTime(transaction.voidedAt)}
              </p>
            </div>
          )}

          {canVoid && !transaction.voidedAt && (
            <section className="rounded-lg border border-[#d8dadc] bg-white p-3">
              {isFormOpen ? (
                <>
                  <Field label="Cancellation reason *">
                    <Textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Explain why this claim is being cancelled. Stock will be returned to inventory."
                    />
                  </Field>
                  {error && (
                    <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700">
                      {error}
                    </div>
                  )}
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsFormOpen(false);
                        setReason("");
                        setError("");
                      }}
                      disabled={isSaving}
                      className={`h-9 rounded-lg bg-[#f7f6f3] px-4 text-xs font-bold text-[#0d1117] transition hover:bg-[#eff4ff] disabled:opacity-60 ${FOCUS_RING}`}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmCancellation}
                      disabled={isSaving}
                      className={`inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60 ${FOCUS_RING}`}
                    >
                      <XIcon /> Confirm Cancellation
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-[#5f6673]">
                    Cancelling restores stock and re-enables this month&apos;s eligibility.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(true)}
                    className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-xs font-bold text-red-600 shadow-sm transition hover:bg-red-50 ${FOCUS_RING}`}
                  >
                    <XIcon /> Cancel Claim
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </article>
  );
}

export default function PatientHistoryModal({ canVoid, onClose, onClaimsChanged, patient }) {
  const [claims, setClaims] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortMode, setSortMode] = useState("newest");

  const patientName = formatPatientName(patient);

  const loadClaims = useCallback(async () => {
    setIsLoading(true);

    try {
      const rows = await getDispensingHistory({ patientId: patient.id });
      setClaims(rows);
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Unable to load this patient's claims.");
    } finally {
      setIsLoading(false);
    }
  }, [patient.id]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadClaims();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadClaims]);

  const transactions = useMemo(
    () => sortTransactions(groupHistoryByTransaction(claims), sortMode),
    [claims, sortMode]
  );

  const totalUnits = transactions.reduce((total, transaction) => total + transaction.totalQuantity, 0);

  const handleCancelled = async () => {
    await loadClaims();

    if (onClaimsChanged) {
      onClaimsChanged();
    }
  };

  const exportClaims = () => {
    downloadCsv(buildDispensingCsv(transactions), `${patient.patient_code || "patient"}-dispensing-claims.csv`);
  };

  return (
    <DispensingModal
      closeLabel="Close"
      onClose={onClose}
      subtitle={formatPatientCode(patient.patient_code)}
      title={`${patientName} — Claim History`}
    >
      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[#5f6673] tabular-nums">
          {isLoading
            ? "Loading claim history..."
            : transactions.length > 0
              ? `${transactions.length.toLocaleString()} claim${transactions.length === 1 ? "" : "s"} · ${totalUnits.toLocaleString()} units all-time`
              : "No claims recorded yet."}
        </p>
        <div className="flex items-center gap-2">
          <SortToggleButton
            onClick={() => setSortMode((current) => (current === "newest" ? "oldest" : "newest"))}
            sort={sortMode}
          />
          <button
            type="button"
            onClick={exportClaims}
            disabled={isLoading || transactions.length === 0}
            className={`h-9 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-[#0d1117] shadow-sm transition hover:border-[#6be9c2] hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            Export CSV
          </button>
        </div>
      </div>

      <section aria-busy={isLoading} className="space-y-2">
        {isLoading &&
          [0, 1, 2].map((key) => <div key={key} className="h-16 animate-pulse rounded-xl bg-[#f8f9ff]" />)}

        {!isLoading && (
          <div role="status" className="sr-only">
            {transactions.length > 0
              ? `${transactions.length} claims loaded`
              : "No claims recorded for this patient."}
          </div>
        )}

        {!isLoading && transactions.length === 0 && !error && (
          <div className="rounded-xl border border-dashed border-[#d8dadc] bg-[#f8f9ff] px-4 py-12 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#9aa1ad]">
              <HistoryIcon />
            </span>
            <p className="mt-2 text-sm font-bold text-[#0d1117]">No claims recorded yet</p>
            <p className="mt-1 text-sm text-[#5f6673]">This patient has not received walk-in medicine.</p>
          </div>
        )}

        {!isLoading &&
          transactions.map((transaction, index) => (
            <ClaimItem
              key={transaction.key}
              canVoid={canVoid}
              defaultExpanded={index === 0}
              onCancelled={handleCancelled}
              transaction={transaction}
            />
          ))}
      </section>
    </DispensingModal>
  );
}
