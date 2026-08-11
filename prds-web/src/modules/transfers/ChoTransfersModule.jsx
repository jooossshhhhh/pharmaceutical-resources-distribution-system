import { useCallback, useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import {
  approveStockTransfer,
  createChoStockTransfer,
  getTransferSourceAvailability,
  getTransfersData,
  rejectStockTransfer,
} from "./TransfersService";
import {
  formatTransferDate,
  formatTransferNumber,
  getActiveTransferStatusFilter,
  getDuplicateTransferMedicineIds,
  getTransferActionTabStatus,
  getTransferItemLabel,
  getTransferMedicineFullLabel,
  getTransferSummary,
  getTransferTotalQuantity,
  matchesTransferFilters,
  sortTransfers,
  transferQueueStatusOptions,
  validateTransferAvailability,
  getTransferAvailabilityMap,
} from "./transferUtils";
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

const emptyItem = { medicine_id: "", quantity: "" };

const getFacilityLabel = (facility) =>
  facility ? `${facility.facility_name} (${facility.facility_code})` : "Unknown facility";

const getProfileName = (profile) =>
  `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "Unknown user";

function TransferDetailsModal({
  isSaving,
  onApprove,
  onClose,
  onReject,
  remarks,
  setRemarks,
  transfer,
}) {
  return (
    <TransferModal
      title={`${formatTransferNumber(transfer.id)} Transfer Details`}
      subtitle={`${getFacilityLabel(transfer.source)} to ${getFacilityLabel(transfer.destination)}`}
      onClose={onClose}
      widthClass="max-w-5xl"
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-[#e5e7eb] bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#008f68]">
                Transfer Request
              </p>
              <h3 className="mt-1 text-lg font-bold text-[#0d1117]">
                {formatTransferNumber(transfer.id)}
              </h3>
            </div>
            <StatusBadge status={transfer.status} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-[#f8f9ff] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                Source Facility
              </p>
              <p className="mt-1 text-sm font-bold text-[#0d1117]">{getFacilityLabel(transfer.source)}</p>
              <p className="mt-1 text-xs text-[#5f6673]">{transfer.source?.address || "No address"}</p>
            </div>
            <div className="rounded-lg bg-[#f8f9ff] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                Destination Facility
              </p>
              <p className="mt-1 text-sm font-bold text-[#0d1117]">
                {getFacilityLabel(transfer.destination)}
              </p>
              <p className="mt-1 text-xs text-[#5f6673]">{transfer.destination?.address || "No address"}</p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-[#e5e7eb]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f8f9ff] text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                <tr>
                  <th className="px-4 py-3">Medicine</th>
                  <th className="px-4 py-3">Details</th>
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
        </section>

        <section className="rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#008f68]">
            Activity Timeline
          </p>
          <div className="mt-4 space-y-3">
            <TimelineItem label="Requested" value={formatTransferDate(transfer.created_at)} />
            <TimelineItem
              label="CHO Approved"
              value={transfer.approved_at ? formatTransferDate(transfer.approved_at) : "Awaiting CHO action"}
            />
            <TimelineItem
              label="Ready for Pickup"
              value={transfer.transfer_date ? formatTransferDate(transfer.transfer_date) : "Awaiting source allocation"}
            />
            <TimelineItem
              label="Received"
              value={transfer.received_at ? formatTransferDate(transfer.received_at) : "Awaiting facility receipt"}
            />
          </div>
          <div className="mt-4 rounded-lg bg-white p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Requester</p>
            <p className="mt-1 text-sm font-bold text-[#0d1117]">{getProfileName(transfer.requester)}</p>
            <p className="mt-1 text-xs text-[#5f6673]">{transfer.requester?.role || "No role"}</p>
          </div>
          <div className="mt-3 rounded-lg bg-white p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">Remarks</p>
            <p className="mt-1 text-sm text-[#0d1117]">{transfer.remarks || "No remarks yet."}</p>
          </div>
        </section>
      </div>

      {transfer.status === "PENDING" && (
        <section className="mt-4 rounded-xl border border-[#d8dadc] bg-white p-4">
          <Field label="CHO remarks">
            <Textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Optional approval or rejection note."
            />
          </Field>
          <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
            Approval notifies the source facility to allocate stock. Inventory will not move until the source marks this transfer ready for pickup.
          </p>
        </section>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-lg bg-[#f7f6f3] px-5 text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff]"
        >
          Close
        </button>
        {transfer.status === "PENDING" && (
          <>
            <button
              type="button"
              onClick={onReject}
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 px-5 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
            >
              <XIcon /> Reject
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#00a36c] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#008f68] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckIcon /> Approve
            </button>
          </>
        )}
      </div>
    </TransferModal>
  );
}

function TimelineItem({ label, value }) {
  return (
    <div className="flex gap-3">
      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#00a36c]" />
      <div>
        <p className="text-sm font-bold text-[#0d1117]">{label}</p>
        <p className="text-xs text-[#5f6673]">{value}</p>
      </div>
    </div>
  );
}

function NewTransferModal({
  availability,
  error,
  facilities,
  form,
  isSaving,
  onAddItem,
  onChange,
  onClose,
  onItemChange,
  onRemoveItem,
  onSubmit,
}) {
  const availabilityMap = useMemo(() => getTransferAvailabilityMap(availability), [availability]);
  const sourceMedicineOptions = useMemo(
    () =>
      availability
        .filter((row) => row.source_facility_id === form.sourceFacilityId)
        .sort((first, second) => first.generic_name.localeCompare(second.generic_name)),
    [availability, form.sourceFacilityId]
  );
  const validationError =
    form.sourceFacilityId && form.items.some((item) => item.medicine_id)
      ? validateTransferAvailability(form.items, availabilityMap, form.sourceFacilityId)
      : "";

  return (
    <TransferModal
      title="New Stock Transfer"
      subtitle="Create a pending direct facility-to-facility transfer for CHO release."
      onClose={onClose}
      widthClass="max-w-4xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {error}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Source facility">
            <Select
              value={form.sourceFacilityId}
              onChange={(event) => onChange("sourceFacilityId", event.target.value)}
              required
            >
              <option value="">Select source</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {getFacilityLabel(facility)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Destination facility">
            <Select
              value={form.destinationFacilityId}
              onChange={(event) => onChange("destinationFacilityId", event.target.value)}
              required
            >
              <option value="">Select destination</option>
              {facilities
                .filter((facility) => facility.id !== form.sourceFacilityId)
                .map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {getFacilityLabel(facility)}
                  </option>
                ))}
            </Select>
          </Field>
        </div>

        <section className="rounded-xl border border-[#e5e7eb]">
          <div className="flex items-center justify-between border-b border-[#e5e7eb] px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-[#0d1117]">Transfer Items</h3>
              <p className="text-xs text-[#5f6673]">Only medicines available at the source facility can be selected.</p>
            </div>
            <button
              type="button"
              onClick={onAddItem}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-black px-3 text-xs font-bold text-white transition hover:bg-[#0d1117]"
            >
              <PlusIcon /> Add item
            </button>
          </div>
          <div className="space-y-3 p-4">
            {form.items.map((item, index) => {
              const row = sourceMedicineOptions.find((option) => option.medicine_id === item.medicine_id);
              return (
                <div key={index} className="grid gap-3 rounded-lg bg-[#f8f9ff] p-3 sm:grid-cols-[1fr_140px_40px]">
                  <Field label="Medicine">
                    <Select
                      value={item.medicine_id}
                      onChange={(event) => onItemChange(index, "medicine_id", event.target.value)}
                      required
                    >
                      <option value="">Select medicine</option>
                      {sourceMedicineOptions.map((medicine) => (
                        <option key={`${medicine.source_facility_id}-${medicine.medicine_id}`} value={medicine.medicine_id}>
                          {getTransferMedicineFullLabel(medicine)} - {Number(medicine.available_quantity || 0).toLocaleString()} available
                        </option>
                      ))}
                    </Select>
                    {row && (
                      <p className="mt-1 text-xs text-[#5f6673]">
                        Physical {Number(row.physical_quantity || 0).toLocaleString()} | Reserved{" "}
                        {Number(row.reserved_quantity || 0).toLocaleString()} | Available{" "}
                        <span className="font-bold text-[#008f68]">
                          {Number(row.available_quantity || 0).toLocaleString()}
                        </span>
                      </p>
                    )}
                  </Field>
                  <Field label="Quantity">
                    <Input
                      min="1"
                      type="number"
                      value={item.quantity}
                      onChange={(event) => onItemChange(index, "quantity", event.target.value)}
                      required
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    className="mt-5 flex h-10 w-10 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50"
                    aria-label="Remove item"
                  >
                    <XIcon />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {(validationError || getDuplicateTransferMedicineIds(form.items).length > 0) && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700">
            {validationError || "Each medicine can appear only once per transfer."}
          </div>
        )}

        <Field label="Remarks">
          <Textarea
            value={form.remarks}
            onChange={(event) => onChange("remarks", event.target.value)}
            placeholder="Optional handling notes or transfer reason."
          />
        </Field>

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
            disabled={isSaving || Boolean(validationError) || getDuplicateTransferMedicineIds(form.items).length > 0}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#00a36c] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#008f68] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PlusIcon /> Create Transfer
          </button>
        </div>
      </form>
    </TransferModal>
  );
}

export default function ChoTransfersModule() {
  const { profile } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [filters, setFilters] = useState({
    destinationFacilityId: "ALL",
    keyword: "",
    medicineId: "ALL",
    sourceFacilityId: "ALL",
    status: "ACTIVE",
    sort: "newest",
  });
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [reviewRemarks, setReviewRemarks] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    destinationFacilityId: "",
    items: [{ ...emptyItem }],
    remarks: "",
    sourceFacilityId: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");

  const currentDateTime = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [data, availabilityRows] = await Promise.all([
        getTransfersData(),
        getTransferSourceAvailability(),
      ]);
      setTransfers(data.transfers);
      setFacilities(data.facilities);
      setMedicines(data.medicines);
      setAvailability(availabilityRows);
    } catch (loadError) {
      setError(loadError.message || "Unable to load transfers.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadData();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadData]);

  const summary = useMemo(() => getTransferSummary(transfers), [transfers]);
  const filteredTransfers = useMemo(() => {
    const matched = transfers.filter((transfer) =>
      matchesTransferFilters(transfer, {
        ...filters,
        status: getActiveTransferStatusFilter(filters.status),
      })
    );

    return sortTransfers(matched, filters.sort);
  }, [filters, transfers]);

  const medicineOptions = useMemo(() => {
    const medicineMap = new Map();
    transfers.forEach((transfer) => {
      (transfer.items || []).forEach((item) => {
        if (item.medicine) {
          medicineMap.set(item.medicine_id, item.medicine);
        }
      });
    });
    medicines.forEach((medicine) => medicineMap.set(medicine.id, medicine));
    return [...medicineMap.entries()].map(([id, medicine]) => ({ id, ...medicine }));
  }, [medicines, transfers]);

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

  const toggleHistoryView = () => {
    setStatusFilter(isHistoryView ? "ACTIVE" : "HISTORY");
  };

  const updateCreateForm = (key, value) => {
    setCreateForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "sourceFacilityId" ? { items: [{ ...emptyItem }] } : {}),
    }));
  };

  const updateCreateItem = (index, key, value) => {
    setCreateForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      ),
    }));
  };

  const handleCreateTransfer = async (event) => {
    event.preventDefault();
    setModalError("");
    setIsSaving(true);
    try {
      await createChoStockTransfer({
        destinationFacilityId: createForm.destinationFacilityId,
        items: createForm.items,
        remarks: createForm.remarks,
        sourceFacilityId: createForm.sourceFacilityId,
      });
      setShowCreateModal(false);
      setCreateForm({
        destinationFacilityId: "",
        items: [{ ...emptyItem }],
        remarks: "",
        sourceFacilityId: "",
      });
      await loadData();
    } catch (createError) {
      setModalError(createError.message || "Unable to create transfer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveTransfer = async () => {
    if (!selectedTransfer) {
      return;
    }

    setModalError("");
    setIsSaving(true);
    try {
      const updated = await approveStockTransfer({
        remarks: reviewRemarks,
        transferId: selectedTransfer.id,
      });
      setTransfers((current) =>
        current.map((transfer) => (transfer.id === updated.id ? updated : transfer))
      );
      setSelectedTransfer(updated);
      await loadData();
    } catch (approveError) {
      setModalError(approveError.message || "Unable to approve transfer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectTransfer = async () => {
    if (!selectedTransfer) {
      return;
    }

    setModalError("");
    setIsSaving(true);
    try {
      const updated = await rejectStockTransfer({
        remarks: reviewRemarks,
        transferId: selectedTransfer.id,
      });
      setTransfers((current) =>
        current.map((transfer) => (transfer.id === updated.id ? updated : transfer))
      );
      setSelectedTransfer(updated);
      await loadData();
    } catch (rejectError) {
      setModalError(rejectError.message || "Unable to reject transfer.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminShell profile={profile} currentDateTime={currentDateTime} onSignOut={logoutUser}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] px-4 py-4">
            <div>
              <h2 className="text-base font-bold text-[#0d1117]">
                {isHistoryView || ["COMPLETED", "REJECTED"].includes(filters.status)
                  ? "Transfer History"
                  : "Active Transfer Queue"}
              </h2>
              <p className="text-sm text-[#5f6673]">
                {summary.pending} pending, {summary.approved} approved, {summary.readyForPickup} ready, {summary.completed + summary.rejected} archived.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!isHistoryView && (
                <Select
                  value={["ACTIVE", "PENDING", "APPROVED", "READY_FOR_PICKUP"].includes(filters.status) ? filters.status : "ACTIVE"}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="w-40"
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
                onClick={() => setShowCreateModal(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#00a36c] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#008f68]"
              >
                <PlusIcon /> New Transfer
              </button>
            </div>
          </div>
          <div className="grid gap-3 border-b border-[#e5e7eb] px-4 py-3 lg:grid-cols-[1fr_180px_180px_160px_auto]">
            <label className="relative">
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
            <Select
              value={filters.sourceFacilityId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, sourceFacilityId: event.target.value }))
              }
            >
              <option value="ALL">All sources</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.facility_name}
                </option>
              ))}
            </Select>
            <Select
              value={filters.destinationFacilityId}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  destinationFacilityId: event.target.value,
                }))
              }
            >
              <option value="ALL">All destinations</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.facility_name}
                </option>
              ))}
            </Select>
            <Select
              value={filters.medicineId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, medicineId: event.target.value }))
              }
            >
              <option value="ALL">All medicines</option>
              {medicineOptions.map((medicine) => (
                <option key={medicine.id} value={medicine.id}>
                  {medicine.brand_name || medicine.generic_name} {medicine.dosage}
                </option>
              ))}
            </Select>
            <SortToggleButton onClick={toggleSort} sort={filters.sort} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-[#f8f9ff] text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
                <tr>
                  <th className="px-4 py-3">Transfer ID</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f2]">
                {filteredTransfers.map((transfer) => (
                  <tr
                    key={transfer.id}
                    className="cursor-pointer transition hover:bg-[#eff4ff]"
                    onClick={() => {
                      setSelectedTransfer(transfer);
                      setReviewRemarks(transfer.remarks || "");
                    }}
                  >
                    <td className="px-4 py-4 font-bold text-blue-700">
                      {formatTransferNumber(transfer.id)}
                    </td>
                    <td className="px-4 py-4 text-[#0d1117]">{transfer.source?.facility_name}</td>
                    <td className="px-4 py-4 text-[#0d1117]">
                      {transfer.destination?.facility_name}
                    </td>
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
                    <td className="px-4 py-4 text-[#5f6673]">
                      {formatTransferDate(transfer.created_at)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        className="rounded-lg px-3 py-1.5 text-xs font-bold text-[#008f68] transition hover:bg-[#dffbf2]"
                      >
                        {transfer.status === "PENDING" ? "Review" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isLoading && filteredTransfers.length === 0 && (
            <div className="px-4 py-12 text-center text-sm font-medium text-[#5f6673]">
              No transfers match the current filters.
            </div>
          )}
          {isLoading && (
            <div className="px-4 py-12 text-center text-sm font-bold text-[#5f6673]">
              Loading transfers...
            </div>
          )}
        </section>
      </div>

      {showCreateModal && (
        <NewTransferModal
          availability={availability}
          error={modalError}
          facilities={facilities}
          form={createForm}
          isSaving={isSaving}
          onAddItem={() =>
            setCreateForm((current) => ({ ...current, items: [...current.items, { ...emptyItem }] }))
          }
          onChange={updateCreateForm}
          onClose={() => {
            setShowCreateModal(false);
            setModalError("");
          }}
          onItemChange={updateCreateItem}
          onRemoveItem={(index) =>
            setCreateForm((current) => ({
              ...current,
              items:
                current.items.length === 1
                  ? [{ ...emptyItem }]
                  : current.items.filter((_, itemIndex) => itemIndex !== index),
            }))
          }
          onSubmit={handleCreateTransfer}
        />
      )}

      {selectedTransfer && (
        <TransferDetailsModal
          isSaving={isSaving}
          onApprove={handleApproveTransfer}
          onClose={() => {
            setSelectedTransfer(null);
            setModalError("");
          }}
          onReject={handleRejectTransfer}
          remarks={reviewRemarks}
          setRemarks={setReviewRemarks}
          transfer={selectedTransfer}
        />
      )}

      {modalError && selectedTransfer && (
        <div className="fixed bottom-5 right-5 z-[100] max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 shadow-xl">
          {modalError}
        </div>
      )}
    </AdminShell>
  );
}
