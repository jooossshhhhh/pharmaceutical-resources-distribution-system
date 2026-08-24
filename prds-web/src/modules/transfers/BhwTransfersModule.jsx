import { useCallback, useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import {
  allocateStockTransferForPickup,
  getOwnFacilityInventory,
  getStockTransferAllocationBatches,
  confirmStockTransferReceived,
  getTransferSourceAvailability,
  getTransfersData,
  submitBhwStockTransferRequest,
} from "./TransfersService";
import {
  buildFefoInventoryRows,
  buildTransfersCsv,
  buildFefoTransferAllocations,
  filterIncomingTransfers,
  filterOutgoingTransfers,
  formatTransferDate,
  formatTransferNumber,
  getActiveTransferStatusFilter,
  getMedicineAvailabilityOptions,
  getTransferActionTabStatus,
  getTransferAllocationValidationError,
  getTransferAvailabilityMap,
  getTransferItemLabel,
  getTransferMedicineFullLabel,
  getTransferTotalQuantity,
  getTransferTrackingSteps,
  matchesTransferFilters,
  sortTransfers,
  transferQueueStatusOptions,
  validateTransferAvailability,
} from "./transferUtils";
import {
  getExpiryStatus,
  getMedicineName,
  getStockStatus,
} from "../inventory/inventoryUtils";
import {
  CheckIcon,
  Field,
  FilterChip,
  HistoryIcon,
  Input,
  PlusIcon,
  QueueIcon,
  SearchIcon,
  Select,
  SortToggleButton,
  StatusBadge,
  Textarea,
  TransferModal,
  XIcon,
} from "./TransferUi";

const emptyRequestForm = {
  medicineId: "",
  medicineSearch: "",
  quantity: "",
  remarks: "",
  sourceFacilityId: "",
};

const getFacilityLabel = (facility) =>
  facility ? `${facility.facility_name} (${facility.facility_code})` : "Unknown facility";

const getProfileName = (profile) =>
  `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "Unknown user";

function RequestTransferModal({
  availability,
  error,
  form,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}) {
  const availabilityMap = useMemo(() => getTransferAvailabilityMap(availability), [availability]);
  const medicineOptions = useMemo(
    () => getMedicineAvailabilityOptions(availability, form.medicineSearch),
    [availability, form.medicineSearch]
  );
  const selectedMedicine = medicineOptions.find(
    (medicine) => medicine.medicine_id === form.medicineId
  );
  const selectedSource = selectedMedicine?.sources.find(
    (source) => source.source_facility_id === form.sourceFacilityId
  );
  const validationError =
    form.sourceFacilityId && form.medicineId
      ? validateTransferAvailability(
          [{ medicine_id: form.medicineId, quantity: form.quantity }],
          availabilityMap,
          form.sourceFacilityId
        )
      : "";
  const quantityWarning = form.quantity ? validationError : "";

  return (
    <TransferModal
      title="Request Stock Transfer"
      subtitle="Search a medicine, choose an available source facility, then submit for CHO release."
      onClose={onClose}
      widthClass="max-w-5xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
            <div>
              <h3 className="text-sm font-bold text-[#0d1117]">Medicine Search</h3>
              <p className="mt-1 text-xs text-[#5f6673]">
                Results only show medicines with available source stock.
              </p>
            </div>

            <label className="relative mt-3 block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a93a3]">
                <SearchIcon />
              </span>
              <Input
                value={form.medicineSearch}
                onChange={(event) => onChange("medicineSearch", event.target.value)}
                placeholder="Search medicine, brand, unit, or dosage..."
                className="pl-9"
              />
            </label>

            <div className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1">
              {medicineOptions.map((medicine) => (
                <button
                  type="button"
                  key={medicine.medicine_id}
                  onClick={() => {
                    onChange("medicineId", medicine.medicine_id);
                    onChange("sourceFacilityId", "");
                  }}
                  className={`w-full rounded-xl border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6be9c2] ${
                    form.medicineId === medicine.medicine_id
                      ? "border-[#6be9c2] bg-[#ecfff8] shadow-sm"
                      : "border-[#e5e7eb] bg-[#f8f9ff]"
                  }`}
                >
                  <p className="text-sm font-bold text-[#0d1117]">
                    {medicine.generic_name || "No generic name"}
                    {medicine.dosage ? ` ${medicine.dosage}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-[#5f6673]">
                    {medicine.brand_name || "Generic"} - {medicine.unit_of_measure || "No unit"}
                  </p>
                </button>
              ))}
              {medicineOptions.length === 0 && (
                <div className="rounded-xl bg-[#f8f9ff] p-6 text-center text-sm font-medium text-[#5f6673]">
                  No available medicine matches the current search.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
            <div>
              <h3 className="text-sm font-bold text-[#0d1117]">Available Source Facilities</h3>
              <p className="mt-1 text-xs text-[#5f6673]">
                Available means physical stock minus pending and released reservations.
              </p>
            </div>

            {!selectedMedicine && (
              <div className="mt-3 rounded-xl border border-dashed border-[#d8dadc] bg-[#f8f9ff] p-8 text-center text-sm font-medium text-[#5f6673]">
                Select a medicine to see facilities that can provide it.
              </div>
            )}

            {selectedMedicine && (
              <div className="mt-3 space-y-2">
                {selectedMedicine.sources.map((source) => (
                  <button
                    type="button"
                    key={source.source_facility_id}
                    onClick={() => onChange("sourceFacilityId", source.source_facility_id)}
                    className={`w-full rounded-xl border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6be9c2] ${
                      form.sourceFacilityId === source.source_facility_id
                        ? "border-[#6be9c2] bg-[#ecfff8] shadow-sm"
                        : "border-[#e5e7eb] bg-[#f8f9ff]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#0d1117]">
                          {source.source_facility_name}
                        </p>
                        <p className="mt-1 text-xs text-[#5f6673]">
                          {source.source_facility_code || "No code"}
                        </p>
                      </div>
                      <span className="rounded-full bg-[#dffbf2] px-2.5 py-1 text-xs font-bold text-[#008f68]">
                        {Number(source.available_quantity || 0).toLocaleString()} available
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <span className="rounded-lg bg-white px-2 py-1 text-[#5f6673]">
                        Physical <b className="text-[#0d1117]">{Number(source.physical_quantity || 0).toLocaleString()}</b>
                      </span>
                      <span className="rounded-lg bg-white px-2 py-1 text-[#5f6673]">
                        Reserved <b className="text-[#0d1117]">{Number(source.reserved_quantity || 0).toLocaleString()}</b>
                      </span>
                      <span className="rounded-lg bg-white px-2 py-1 text-[#008f68]">
                        Balance <b>{Number(source.available_quantity || 0).toLocaleString()}</b>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {selectedSource && (
          <section className="grid gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4 md:grid-cols-[180px_1fr]">
            <Field label="Request quantity">
              <Input
                min="1"
                max={selectedSource.available_quantity}
                inputMode="numeric"
                type="text"
                value={form.quantity}
                onChange={(event) => onChange("quantity", event.target.value)}
                placeholder="Whole number only"
                required
              />
            </Field>
            <Field label="Transfer notes">
              <Textarea
                value={form.remarks}
                onChange={(event) => onChange("remarks", event.target.value)}
                placeholder="Optional urgency, handling instruction, or reason for requesting this transfer."
                className="min-h-20"
              />
            </Field>
          </section>
        )}

        {quantityWarning && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700">
            {quantityWarning}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-[#e5e7eb] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-[#f7f6f3] px-5 text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || Boolean(validationError) || !selectedSource || !form.quantity}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PlusIcon /> Submit Request
          </button>
        </div>
      </form>
    </TransferModal>
  );
}

function TrackingModal({
  canConfirmReceipt,
  isSaving,
  onClose,
  onConfirmReceipt,
  transfer,
}) {
  const steps = getTransferTrackingSteps(transfer);

  return (
    <TransferModal
      title={`${formatTransferNumber(transfer.id)} Transfer Tracking`}
      subtitle={`${getFacilityLabel(transfer.source)} to ${getFacilityLabel(transfer.destination)}`}
      onClose={onClose}
      widthClass="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#008f68]">
              Transfer Status
            </p>
            <h3 className="mt-1 text-lg font-bold text-[#0d1117]">{formatTransferNumber(transfer.id)}</h3>
          </div>
          <StatusBadge status={transfer.status} />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {steps.map((step) => (
            <div
              key={step.key}
              className={`rounded-xl border p-4 ${
                step.state === "complete"
                  ? "border-[#6be9c2] bg-[#ecfff8]"
                  : step.state === "current"
                    ? "border-blue-200 bg-blue-50"
                    : step.state === "rejected"
                      ? "border-red-200 bg-red-50"
                      : "border-[#e5e7eb] bg-white"
              }`}
            >
              <p className="text-sm font-bold text-[#0d1117]">{step.label}</p>
              <p className="mt-1 text-xs text-[#5f6673]">{step.detail}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-[#e5e7eb]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f8f9ff] text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Full Details</th>
                <th className="px-4 py-3 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0f2]">
              {(transfer.items || []).map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-bold text-[#0d1117]">{getTransferItemLabel(item)}</td>
                  <td className="px-4 py-3 text-xs text-[#5f6673]">
                    {getTransferMedicineFullLabel(item.medicine)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-[#0d1117]">
                    {Number(item.quantity || 0).toLocaleString()} units
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Admin Notes</p>
          <p className="mt-1 text-sm text-[#0d1117]">{transfer.remarks || "No admin notes yet."}</p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-[#f7f6f3] px-5 text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff]"
          >
            Close
          </button>
          {canConfirmReceipt && (
            <button
              type="button"
              onClick={onConfirmReceipt}
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#00a36c] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#008f68] disabled:opacity-60"
            >
              <CheckIcon /> Confirm Receipt
            </button>
          )}
        </div>
      </div>
    </TransferModal>
  );
}

function IncomingTransferModal({
  allocationError,
  allocations,
  batches,
  canAllocatePickup,
  inventoryRows,
  isSaving,
  onAllocationChange,
  onAllocatePickup,
  onClose,
  remarks,
  setRemarks,
  showInventory,
  toggleInventory,
  transfer,
}) {
  const steps = getTransferTrackingSteps(transfer);
  const requesterName = getProfileName(transfer.requester);
  const fefoRows = buildFefoInventoryRows(inventoryRows);

  return (
    <TransferModal
      title={`${formatTransferNumber(transfer.id)} Incoming Transfer`}
      subtitle={`${getFacilityLabel(transfer.destination)} is requesting your stock`}
      onClose={onClose}
      widthClass="max-w-5xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#008f68]">
              Transfer Status
            </p>
            <h3 className="mt-1 text-lg font-bold text-[#0d1117]">{formatTransferNumber(transfer.id)}</h3>
          </div>
          <StatusBadge status={transfer.status} />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {steps.map((step) => (
            <div
              key={step.key}
              className={`rounded-xl border p-4 ${
                step.state === "complete"
                  ? "border-[#6be9c2] bg-[#ecfff8]"
                  : step.state === "current"
                    ? "border-blue-200 bg-blue-50"
                    : step.state === "rejected"
                      ? "border-red-200 bg-red-50"
                      : "border-[#e5e7eb] bg-white"
              }`}
            >
              <p className="text-sm font-bold text-[#0d1117]">{step.label}</p>
              <p className="mt-1 text-xs text-[#5f6673]">{step.detail}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
              Requesting Barangay
            </p>
            <p className="mt-1 text-sm font-bold text-[#0d1117]">
              {getFacilityLabel(transfer.destination)}
            </p>
            <p className="mt-1 text-xs text-[#5f6673]">{transfer.destination?.address || "No address"}</p>
          </div>
          <div className="rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Requested By</p>
            <p className="mt-1 text-sm font-bold text-[#0d1117]">{requesterName}</p>
            <p className="mt-1 text-xs text-[#5f6673]">{transfer.requester?.role || "No role"}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#e5e7eb]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f8f9ff] text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Full Details</th>
                <th className="px-4 py-3 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0f2]">
              {(transfer.items || []).map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-bold text-[#0d1117]">{getTransferItemLabel(item)}</td>
                  <td className="px-4 py-3 text-xs text-[#5f6673]">
                    {getTransferMedicineFullLabel(item.medicine)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-[#0d1117]">
                    {Number(item.quantity || 0).toLocaleString()} units
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="overflow-hidden rounded-xl border border-[#e5e7eb]">
          <button
            type="button"
            onClick={toggleInventory}
            className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left transition hover:bg-[#f8f9ff]"
          >
            <span>
              <span className="block text-sm font-bold text-[#0d1117]">My Full Inventory</span>
              <span className="block text-xs text-[#5f6673]">
                Every batch at your facility, ordered first-expiry-first-out, to help you decide what to release.
              </span>
            </span>
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[#0d1117] transition ${showInventory ? "bg-[#6be9c2]" : "bg-white"}`}
            >
              {showInventory ? <XIcon /> : <PlusIcon />}
            </span>
          </button>
          {showInventory && (
            <div className="overflow-x-auto border-t border-[#e5e7eb]">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#f8f9ff] text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                  <tr>
                    <th className="px-4 py-3">Medicine</th>
                    <th className="px-4 py-3">Batch #</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Date Received</th>
                    <th className="px-4 py-3">Expiration</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0f2]">
                  {fefoRows.map((row) => {
                    const expiry = getExpiryStatus(row);
                    const stock = getStockStatus(row);

                    return (
                      <tr key={row.id}>
                        <td className="px-4 py-3">
                          <p className="font-bold text-[#0d1117]">{getMedicineName(row)}</p>
                          <p className="text-xs text-[#5f6673]">
                            {row.medicine?.brand_name || "Generic"} - {row.medicine?.unit_of_measure || "No unit"}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-medium text-[#0d1117]">
                          {row.batch_number || "No batch"}
                        </td>
                        <td className="px-4 py-3 text-[#5f6673]">{row.supplier?.supplier_name || "No supplier"}</td>
                        <td className="px-4 py-3 text-[#5f6673]">{formatTransferDate(row.date_received)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${expiry.badgeClass}`}>
                            {expiry.label}{" "}
                            {expiry.days !== null
                              ? expiry.days < 0
                                ? `(${Math.abs(expiry.days)} days ago)`
                                : `(${expiry.days} days)`
                              : ""}
                          </span>
                          <p className="mt-1 text-xs text-[#5f6673]">{formatTransferDate(row.expiration_date)}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-[#0d1117]">
                          {Number(row.quantity || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${stock.badgeClass}`}>
                            {stock.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {fefoRows.length === 0 && (
                <div className="p-6 text-center text-sm font-medium text-[#5f6673]">
                  No inventory batches found at your facility.
                </div>
              )}
            </div>
          )}
        </section>

        <div className="rounded-xl border border-[#e5e7eb] bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Admin Notes</p>
          <p className="mt-1 text-sm text-[#0d1117]">{transfer.remarks || "No admin notes yet."}</p>
        </div>

        {canAllocatePickup && (
          <section className="rounded-xl border border-[#d8dadc] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#0d1117]">Source Batch Allocation</h3>
                <p className="text-sm text-[#5f6673]">
                  Allocate source stock before marking this transfer ready for pickup.
                </p>
              </div>
              {allocationError ? (
                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
                  Allocation required
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                  Ready to mark pickup
                </span>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-[#e5e7eb]">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-[#f8f9ff] text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                  <tr>
                    <th className="px-4 py-3">Medicine</th>
                    <th className="px-4 py-3">Batch</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Date Received</th>
                    <th className="px-4 py-3">Expiry</th>
                    <th className="px-4 py-3">Available</th>
                    <th className="px-4 py-3">Allocate Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0f2]">
                  {batches.map((batch) => {
                    const item = (transfer.items || []).find(
                      (transferItem) => transferItem.id === batch.transfer_item_id
                    );
                    const allocation = allocations.find(
                      (entry) =>
                        entry.transfer_item_id === batch.transfer_item_id &&
                        entry.source_inventory_id === batch.source_inventory_id
                    );
                    const expiry = getExpiryStatus({ expiration_date: batch.expiration_date });

                    return (
                      <tr key={`${batch.transfer_item_id}-${batch.source_inventory_id}`}>
                        <td className="px-4 py-3">
                          <p className="font-bold text-[#0d1117]">{getTransferItemLabel(item)}</p>
                          <p className="text-xs text-[#5f6673]">{item?.medicine?.unit_of_measure || "No unit"}</p>
                        </td>
                        <td className="px-4 py-3 font-medium text-[#0d1117]">
                          {batch.batch_number || "No batch"}
                        </td>
                        <td className="px-4 py-3 text-[#5f6673]">{batch.supplier_name || "No supplier"}</td>
                        <td className="px-4 py-3 text-[#5f6673]">{formatTransferDate(batch.date_received)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${expiry.badgeClass}`}>
                            {expiry.label}
                          </span>
                          <p className="mt-1 text-xs text-[#5f6673]">{formatTransferDate(batch.expiration_date)}</p>
                        </td>
                        <td className="px-4 py-3 font-bold text-[#0d1117]">
                          {Number(batch.quantity || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            min="0"
                            max={batch.quantity}
                            inputMode="numeric"
                            type="text"
                            value={allocation?.quantity ?? 0}
                            onChange={(event) =>
                              onAllocationChange(
                                batch.transfer_item_id,
                                batch.source_inventory_id,
                                event.target.value
                              )
                            }
                            className="w-28"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {batches.length === 0 && (
                <div className="p-6 text-center text-sm font-medium text-[#5f6673]">
                  No source batches are currently available for this transfer.
                </div>
              )}
            </div>

            {allocationError && (
              <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700">
                {allocationError}
              </div>
            )}

            <div className="mt-4">
              <Field label="Source facility note">
                <Textarea
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Optional pickup, handling, or allocation note."
                />
              </Field>
            </div>
          </section>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-[#f7f6f3] px-5 text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff]"
          >
            Close
          </button>
          {canAllocatePickup && (
            <button
              type="button"
              onClick={onAllocatePickup}
              disabled={isSaving || Boolean(allocationError)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117] disabled:opacity-60"
            >
              <CheckIcon /> Mark Ready for Pickup
            </button>
          )}
        </div>
      </div>
    </TransferModal>
  );
}

export default function BhwTransfersModule() {
  const { profile } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [ownInventory, setOwnInventory] = useState([]);
  const [viewMode, setViewMode] = useState("outgoing");
  const [filters, setFilters] = useState({ keyword: "", status: "ACTIVE", sort: "newest" });
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [selectedIncomingTransfer, setSelectedIncomingTransfer] = useState(null);
  const [allocationBatches, setAllocationBatches] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [allocationRemarks, setAllocationRemarks] = useState("");
  const [showInventoryPanel, setShowInventoryPanel] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({ ...emptyRequestForm });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const profileFacilityId = profile?.facility_id;

  const currentDateTime = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const loadData = useCallback(async () => {
    if (!profileFacilityId) {
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const [data, availabilityRows, inventoryRows] = await Promise.all([
        getTransfersData({ facilityId: profileFacilityId }),
        getTransferSourceAvailability(),
        getOwnFacilityInventory(profileFacilityId),
      ]);
      setTransfers(data.transfers);
      setAvailability(availabilityRows);
      setOwnInventory(inventoryRows);
    } catch (loadError) {
      setError(loadError.message || "Unable to load transfers.");
    } finally {
      setIsLoading(false);
    }
  }, [profileFacilityId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadData();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadData]);

  const canAllocateSelectedTransfer =
    selectedIncomingTransfer?.status === "APPROVED" &&
    selectedIncomingTransfer?.source_facility_id === profileFacilityId;

  useEffect(() => {
    const loadAllocationBatches = async () => {
      if (!selectedIncomingTransfer || !canAllocateSelectedTransfer) {
        setAllocationBatches([]);
        setAllocations([]);
        setAllocationRemarks("");
        return;
      }

      setModalError("");
      try {
        const batches = await getStockTransferAllocationBatches(selectedIncomingTransfer.id);
        setAllocationBatches(batches);
        const fefoAllocations = buildFefoTransferAllocations(
          selectedIncomingTransfer.items || [],
          batches
        )
          .map((allocation) => {
            const recommended = batches.find(
              (batch) =>
                batch.transfer_item_id === allocation.transfer_item_id &&
                batch.source_inventory_id === allocation.source_inventory_id
            )?.recommended_quantity;

            return {
              ...allocation,
              quantity: Number(recommended || allocation.quantity || 0),
            };
          })
          .filter((allocation) => allocation.quantity > 0);
        setAllocations(fefoAllocations);
        setAllocationRemarks(selectedIncomingTransfer.remarks || "");
      } catch (batchError) {
        setModalError(batchError.message || "Unable to load source batches.");
      }
    };

    loadAllocationBatches();
  }, [canAllocateSelectedTransfer, selectedIncomingTransfer]);

  const filteredTransfers = useMemo(() => {
    const matched = transfers.filter((transfer) =>
      matchesTransferFilters(transfer, {
        destinationFacilityId: "ALL",
        keyword: filters.keyword,
        medicineId: "ALL",
        sourceFacilityId: "ALL",
        status: getActiveTransferStatusFilter(filters.status),
      })
    );

    return sortTransfers(matched, filters.sort);
  }, [filters, transfers]);

  const outgoingTransfers = useMemo(
    () => filterOutgoingTransfers(filteredTransfers, profileFacilityId),
    [filteredTransfers, profileFacilityId]
  );

  const incomingTransfers = useMemo(
    () => filterIncomingTransfers(filteredTransfers, profileFacilityId),
    [filteredTransfers, profileFacilityId]
  );

  const visibleTransfers = viewMode === "incoming" ? incomingTransfers : outgoingTransfers;

  const updateRequestForm = (key, value) => {
    setRequestForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "medicineId" ? { sourceFacilityId: "", quantity: "" } : {}),
    }));
  };

  const handleSubmitTransfer = async (event) => {
    event.preventDefault();
    setModalError("");
    setIsSaving(true);
    try {
      await submitBhwStockTransferRequest({
        items: [{ medicine_id: requestForm.medicineId, quantity: requestForm.quantity }],
        remarks: requestForm.remarks,
        sourceFacilityId: requestForm.sourceFacilityId,
      });
      setShowRequestModal(false);
      setRequestForm({ ...emptyRequestForm });
      await loadData();
    } catch (submitError) {
      setModalError(submitError.message || "Unable to submit transfer request.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!selectedTransfer) {
      return;
    }

    setModalError("");
    setIsSaving(true);
    try {
      await confirmStockTransferReceived({ transferId: selectedTransfer.id });
      setSelectedTransfer(null);
      await loadData();
    } catch (confirmError) {
      setModalError(confirmError.message || "Unable to confirm receipt.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateAllocation = (transferItemId, sourceInventoryId, value) => {
    if (value && !/^\d+$/.test(value)) {
      return;
    }

    const nextQuantity = Number(value || 0);
    setAllocations((current) => {
      const next = current.filter(
        (allocation) =>
          !(
            allocation.transfer_item_id === transferItemId &&
            allocation.source_inventory_id === sourceInventoryId
          )
      );

      if (nextQuantity > 0) {
        next.push({
          quantity: nextQuantity,
          source_inventory_id: sourceInventoryId,
          transfer_item_id: transferItemId,
        });
      }

      return next;
    });
  };

  const handleAllocateForPickup = async () => {
    if (!selectedIncomingTransfer) {
      return;
    }

    setModalError("");
    setIsSaving(true);
    try {
      const updated = await allocateStockTransferForPickup({
        allocations,
        remarks: allocationRemarks,
        transferId: selectedIncomingTransfer.id,
      });
      setSelectedIncomingTransfer(updated);
      await loadData();
    } catch (allocationError) {
      setModalError(allocationError.message || "Unable to mark transfer ready for pickup.");
    } finally {
      setIsSaving(false);
    }
  };

  const exportHistory = () => {
    const csv = buildTransfersCsv(visibleTransfers);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = viewMode === "incoming" ? "bhw-incoming-transfers.csv" : "bhw-transfer-history.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const setStatusFilter = (status) => {
    setFilters((current) => ({ ...current, status: getTransferActionTabStatus(status) }));
  };

  const toggleSort = () => {
    setFilters((current) => ({
      ...current,
      sort: current.sort === "newest" ? "oldest" : "newest",
    }));
  };

  const isHistoryView = filters.status === "HISTORY";
  const allocationError =
    selectedIncomingTransfer && canAllocateSelectedTransfer
      ? getTransferAllocationValidationError(
          selectedIncomingTransfer.items || [],
          allocationBatches,
          allocations
        )
      : "";

  const toggleHistoryView = () => {
    setStatusFilter(isHistoryView ? "ACTIVE" : "HISTORY");
  };

  return (
    <AdminShell profile={profile} currentDateTime={currentDateTime} onSignOut={logoutUser}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        <section className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d1117]">Stock Transfer</h1>
            <p className="text-sm text-[#5f6673]">
              {viewMode === "incoming"
                ? "Barangays requesting stock from your facility. Monitor approval, then allocate your batches for pickup."
                : "Request stock from available facilities and track approval, release, and receipt status."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-[#d8dadc] bg-white p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setViewMode("outgoing");
                  setFilters((current) => ({ ...current, status: "ACTIVE" }));
                }}
                className={`h-9 rounded-md px-4 text-sm font-bold transition ${
                  viewMode === "outgoing"
                    ? "bg-[#6be9c2] text-[#0d1117]"
                    : "text-[#42474e] hover:bg-[#eff4ff]"
                }`}
              >
                My Requests
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("incoming");
                  setFilters((current) => ({ ...current, status: "ACTIVE" }));
                }}
                className={`h-9 rounded-md px-4 text-sm font-bold transition ${
                  viewMode === "incoming"
                    ? "bg-[#6be9c2] text-[#0d1117]"
                    : "text-[#42474e] hover:bg-[#eff4ff]"
                }`}
              >
                Incoming Requests
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowRequestModal(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117]"
            >
              <PlusIcon /> Request Transfer
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-[#e5e7eb] px-4 py-4">
            <div>
              <h2 className="text-base font-bold text-[#0d1117]">
                {viewMode === "incoming"
                  ? isHistoryView
                    ? "Incoming History"
                    : "Incoming Requests"
                  : isHistoryView || ["COMPLETED", "REJECTED"].includes(filters.status)
                    ? "Transfer History"
                    : "Transfer Queue"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 border-b border-[#e5e7eb] px-4 py-3">
            <label className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a93a3]">
                <SearchIcon />
              </span>
              <Input
                value={filters.keyword}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, keyword: event.target.value }))
                }
                placeholder="Search transfer ID, facility, medicine..."
                className="pl-9"
              />
            </label>
            <SortToggleButton onClick={toggleSort} sort={filters.sort} />
            {!isHistoryView && (
              <Select
                value={["ACTIVE", "PENDING", "APPROVED", "READY_FOR_PICKUP"].includes(filters.status) ? filters.status : "ACTIVE"}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="!w-auto shrink-0"
              >
                {transferQueueStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
            <FilterChip
              active={false}
              icon={
                <span className="transition-all duration-200">
                  {isHistoryView ? <QueueIcon /> : <HistoryIcon />}
                </span>
              }
              onClick={toggleHistoryView}
            >
              <span className="transition-all duration-200">
                {isHistoryView ? "Queue" : "History"}
              </span>
            </FilterChip>
            <button
              type="button"
              onClick={exportHistory}
              className="h-10 shrink-0 rounded-lg border border-[#d8dadc] bg-white px-4 text-sm font-bold text-[#0d1117] shadow-sm transition hover:border-[#6be9c2] hover:bg-[#eff4ff]"
            >
              Export
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-[#f8f9ff] text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Transfer ID</th>
                  {viewMode === "incoming" ? (
                    <>
                      <th className="px-4 py-3">Requesting Barangay</th>
                      <th className="px-4 py-3">Requested By</th>
                    </>
                  ) : (
                    <th className="px-4 py-3">Source</th>
                  )}
                  <th className="px-4 py-3">Items Requested</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f2]">
                {visibleTransfers.map((transfer) => (
                  <tr
                    key={transfer.id}
                    className="cursor-pointer transition hover:bg-[#eff4ff]"
                    onClick={() =>
                      viewMode === "incoming"
                        ? setSelectedIncomingTransfer(transfer)
                        : setSelectedTransfer(transfer)
                    }
                  >
                    <td className="px-4 py-4 text-[#5f6673]">{formatTransferDate(transfer.created_at)}</td>
                    <td className="px-4 py-4 font-bold text-blue-700">{formatTransferNumber(transfer.id)}</td>
                    {viewMode === "incoming" ? (
                      <>
                        <td className="px-4 py-4 text-[#0d1117]">{transfer.destination?.facility_name}</td>
                        <td className="px-4 py-4 text-[#5f6673]">{getProfileName(transfer.requester)}</td>
                      </>
                    ) : (
                      <td className="px-4 py-4 text-[#0d1117]">{transfer.source?.facility_name}</td>
                    )}
                    <td className="px-4 py-4 font-bold text-[#0d1117]">
                      {(transfer.items || []).length > 0
                        ? (transfer.items || []).map(getTransferItemLabel).join(", ")
                        : "No items"}
                    </td>
                    <td className="px-4 py-4 text-[#0d1117]">
                      {getTransferTotalQuantity(transfer).toLocaleString()} units
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={transfer.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isLoading && visibleTransfers.length === 0 && (
            <div className="px-4 py-12 text-center text-sm font-medium text-[#5f6673]">
              {viewMode === "incoming"
                ? "No barangays are currently requesting stock from your facility."
                : "No transfers match the current filters."}
            </div>
          )}
          {isLoading && (
            <div className="px-4 py-12 text-center text-sm font-bold text-[#5f6673]">
              Loading transfers...
            </div>
          )}
        </section>
      </div>

      {showRequestModal && (
        <RequestTransferModal
          availability={availability}
          error={modalError}
          form={requestForm}
          isSaving={isSaving}
          onChange={updateRequestForm}
          onClose={() => {
            setShowRequestModal(false);
            setModalError("");
          }}
          onSubmit={handleSubmitTransfer}
        />
      )}

      {selectedTransfer && (
        <TrackingModal
          canConfirmReceipt={
            selectedTransfer.status === "READY_FOR_PICKUP" &&
            selectedTransfer.destination_facility_id === profileFacilityId
          }
          isSaving={isSaving}
          onClose={() => {
            setSelectedTransfer(null);
            setModalError("");
          }}
          onConfirmReceipt={handleConfirmReceipt}
          transfer={selectedTransfer}
        />
      )}

      {selectedIncomingTransfer && (
        <IncomingTransferModal
          allocationError={allocationError}
          allocations={allocations}
          batches={allocationBatches}
          canAllocatePickup={canAllocateSelectedTransfer}
          inventoryRows={ownInventory}
          isSaving={isSaving}
          onAllocationChange={updateAllocation}
          onAllocatePickup={handleAllocateForPickup}
          onClose={() => {
            setSelectedIncomingTransfer(null);
            setModalError("");
            setShowInventoryPanel(false);
          }}
          remarks={allocationRemarks}
          setRemarks={setAllocationRemarks}
          showInventory={showInventoryPanel}
          toggleInventory={() => setShowInventoryPanel((current) => !current)}
          transfer={selectedIncomingTransfer}
        />
      )}

      {modalError && (selectedTransfer || selectedIncomingTransfer) && (
        <div className="fixed bottom-5 right-5 z-[100] max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 shadow-xl">
          {modalError}
        </div>
      )}
    </AdminShell>
  );
}
