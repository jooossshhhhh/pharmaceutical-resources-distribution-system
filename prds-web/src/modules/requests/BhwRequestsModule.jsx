import { useCallback, useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { formatDateTime } from "../dashboard/dashboardUtils";
import { createBhwMedicineRequest, getBhwRequestsData } from "./RequestsService";
import {
  formatRequestDate,
  getCompletedRequestQuantity,
  getDuplicateRequestMedicineIds,
  getFacilityRequestRating,
  getItemStockStatus,
  getItemLabel,
  getRequestNumber,
  getRequestSummary,
  getRequestTotalQuantity,
  getRequestTrackingSteps,
  getStockMap,
  matchesRequestFilters,
  normalizeRequestErrorMessage,
  requestStatusLabels,
  requestStatusTones,
  sortRequests,
} from "./requestUtils";

const emptyItem = {
  medicine_id: "",
  quantity: "",
};

const bhwCards = [
  {
    filter: "ALL",
    key: "total",
    label: "Total Requests",
    note: "Facility request history",
  },
  {
    filter: "PENDING",
    key: "pending",
    label: "Pending Approval",
    note: "Awaiting CHO review",
  },
  {
    filter: "COMPLETED",
    key: "received",
    label: "Total Items Rec.",
    note: "Completed request quantity",
  },
  {
    filter: "COMPLETED",
    key: "rating",
    label: "Facility Rating",
    note: "Fulfillment score",
  },
];

export default function BhwRequestsModule() {
  const { profile } = useAuth();
  const profileFacilityId = profile?.facility_id;
  const profileId = profile?.id;
  const [requests, setRequests] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [inventoryRows, setInventoryRows] = useState([]);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [keyword, setKeyword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [trackedRequest, setTrackedRequest] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [requestItems, setRequestItems] = useState([{ ...emptyItem }]);

  const today = useMemo(() => formatDateTime(new Date()), []);
  const summary = useMemo(() => getRequestSummary(requests), [requests]);
  const receivedQuantity = useMemo(() => getCompletedRequestQuantity(requests), [requests]);
  const facilityRating = useMemo(() => getFacilityRequestRating(requests), [requests]);
  const stockMap = useMemo(() => getStockMap(inventoryRows), [inventoryRows]);

  const cardValues = useMemo(
    () => ({
      pending: String(summary.pending).padStart(2, "0"),
      rating: `${facilityRating.toFixed(1)}%`,
      received: receivedQuantity.toLocaleString(),
      total: summary.total,
    }),
    [facilityRating, receivedQuantity, summary.pending, summary.total]
  );

  const filteredRequests = useMemo(() => {
    const matchedRequests = requests.filter((request) =>
      matchesRequestFilters(request, {
        facilityId: profileFacilityId || "ALL",
        keyword,
        status: activeFilter,
      })
    );

    return sortRequests(matchedRequests, "newest");
  }, [activeFilter, keyword, profileFacilityId, requests]);

  const loadRequests = useCallback(async () => {
    if (!profileFacilityId) {
      setRequests([]);
      setMedicines([]);
      setInventoryRows([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const data = await getBhwRequestsData({ facilityId: profileFacilityId });
      setRequests(data.requests);
      setMedicines(data.medicines);
      setInventoryRows(data.inventoryRows);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, [profileFacilityId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadRequests();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadRequests]);

  const resetForm = () => {
    setRemarks("");
    setRequestItems([{ ...emptyItem }]);
  };

  const submitRequest = async (event) => {
    event.preventDefault();

    const validItems = requestItems.filter((item) => {
      return item.medicine_id && Number(item.quantity) > 0;
    });

    if (!profileId || !profileFacilityId) {
      setError("Your account is not assigned to a facility.");
      return;
    }

    if (validItems.length === 0) {
      setError("Please add at least one medicine and quantity.");
      return;
    }

    const duplicateMedicineIds = getDuplicateRequestMedicineIds(validItems);

    if (duplicateMedicineIds.length > 0) {
      const duplicateNames = duplicateMedicineIds.map((medicineId) => {
        const duplicateMedicine = medicines.find((medicine) => medicine.id === medicineId);
        return duplicateMedicine
          ? `${duplicateMedicine.brand_name || duplicateMedicine.generic_name} ${duplicateMedicine.dosage || ""}`.trim()
          : "selected medicine";
      });

      setError(
        `Each medicine can appear only once per request. Update the quantity for ${duplicateNames.join(", ")} instead.`
      );
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await createBhwMedicineRequest({
        facilityId: profileFacilityId,
        items: validItems,
        profileId,
        remarks,
      });
      setIsModalOpen(false);
      resetForm();
      await loadRequests();
    } catch (saveError) {
      setError(normalizeRequestErrorMessage(saveError.message));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-500">
            History Log Ref {profile?.facility?.facility_code || "Facility"}
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-black">
            BHW Request History
          </h2>
          <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-neutral-500">
            Comprehensive log of medical supply requests for{" "}
            {profile?.facility?.facility_name || "your assigned facility"}.
          </p>
        </div>

        <div className="flex gap-3">
          <label className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Filter logs..."
              className="h-11 w-44 rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-semibold text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-black px-4 text-sm font-black text-white shadow-sm hover:bg-neutral-800"
          >
            <PlusIcon />
            New Request
          </button>
        </div>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-4">
        {bhwCards.map((card) => (
          <MetricCard
            key={`${card.key}-${card.filter}`}
            active={activeFilter === card.filter}
            label={card.label}
            note={card.note}
            onClick={() => setActiveFilter(card.filter)}
            value={cardValues[card.key]}
          />
        ))}
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full border-collapse text-left">
            <thead className="bg-neutral-50">
              <tr className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">
                <th className="px-4 py-3">Date & Time</th>
                <th className="px-4 py-3">Request ID</th>
                <th className="px-4 py-3">Items Requested</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Admin Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="px-4 py-14 text-center text-sm font-bold text-neutral-500">
                    Loading request history...
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-14 text-center text-sm font-bold text-neutral-500">
                    No requests match the current view.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((request) => (
                  <BhwRequestRow
                    key={request.id}
                    onTrackRequest={() => setTrackedRequest(request)}
                    request={request}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && (
        <NewRequestModal
          isSaving={isSaving}
          medicines={medicines}
          onClose={() => {
            setIsModalOpen(false);
            resetForm();
          }}
          onSubmit={submitRequest}
          remarks={remarks}
          requestItems={requestItems}
          setRemarks={setRemarks}
          setRequestItems={setRequestItems}
          stockMap={stockMap}
          facilityId={profileFacilityId}
        />
      )}

      {trackedRequest && (
        <RequestTrackingModal
          onClose={() => setTrackedRequest(null)}
          request={trackedRequest}
          stockMap={stockMap}
        />
      )}
    </AdminShell>
  );
}

function MetricCard({ active, label, note, onClick, value }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        active ? "border-neutral-900 bg-neutral-950 text-white" : "border-neutral-200 bg-white text-black"
      }`}
    >
      <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${active ? "text-blue-300" : "text-neutral-500"}`}>
        {label}
      </p>
      <p className="mt-4 text-2xl font-black">{value}</p>
      <p className={`mt-2 text-xs font-semibold ${active ? "text-neutral-400" : "text-neutral-500"}`}>
        {note}
      </p>
    </button>
  );
}

function BhwRequestRow({ onTrackRequest, request }) {
  const totalQuantity = getRequestTotalQuantity(request);
  const items = request.items || [];

  return (
    <tr
      className="group cursor-pointer align-top text-sm transition hover:bg-emerald-50/50"
      onClick={onTrackRequest}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onTrackRequest();
        }
      }}
      tabIndex={0}
    >
      <td className="px-4 py-4 text-xs font-semibold leading-5 text-neutral-600">
        {formatRequestDate(request.request_date)}
      </td>
      <td className="px-4 py-4">
        <span className="rounded bg-neutral-100 px-2 py-1 text-[10px] font-black text-neutral-600">
          {getRequestNumber(request.id)}
        </span>
      </td>
      <td className="px-4 py-4">
        {items.length === 0 ? (
          <p className="text-sm font-black text-black">No items</p>
        ) : (
          <div className="grid gap-1.5">
            {items.map((item) => (
              <span
                key={item.id}
                className="w-fit text-left text-sm font-black text-black underline-offset-4 group-hover:text-emerald-700"
              >
                {getItemLabel(item)}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-4 text-xs font-black text-neutral-600">
        {totalQuantity.toLocaleString()} units
      </td>
      <td className="px-4 py-4">
        <span className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-wide ${requestStatusTones[request.status] || "bg-neutral-100 text-neutral-700"}`}>
          {requestStatusLabels[request.status] || request.status}
        </span>
      </td>
      <td className="px-4 py-4 text-sm italic leading-6 text-neutral-600">
        {request.remarks || "No admin notes yet."}
      </td>
    </tr>
  );
}

function RequestTrackingModal({ onClose, request, stockMap }) {
  const items = request.items || [];
  const primaryItem = items[0] || null;
  const steps = getRequestTrackingSteps(request);
  const stockStatus = primaryItem
    ? getItemStockStatus(primaryItem, request.facility_id, stockMap)
    : { label: "No items", tone: "text-neutral-500" };
  const approverName = request.approver
    ? `${request.approver.first_name || ""} ${request.approver.last_name || ""}`.trim()
    : "CHO staff";
  const totalQuantity = getRequestTotalQuantity(request);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
      <article className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <div className="flex gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <BoxIcon />
            </span>
            <div>
              <h2 className="text-base font-black text-black">{getRequestNumber(request.id)}</h2>
              <p className="mt-1 text-[11px] font-black uppercase tracking-wide text-neutral-400">
                {request.facility?.facility_code || "Facility"} / {items.length} item{items.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-800">
            <CloseIcon />
          </button>
        </header>

        <div className="prds-modal-scrollbar max-h-[72vh] overflow-y-auto px-5 py-4">
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
              Medicine Request Tracking
            </h3>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {steps.map((step, index) => (
                <TrackingStep
                  key={step.key}
                  detail={step.detail}
                  isLast={index === steps.length - 1}
                  label={step.label}
                  state={step.state}
                />
              ))}
            </div>
          </section>

          <section className="mt-5 grid gap-3 md:grid-cols-3">
            <TrackingStat
              label="Requested"
              value={totalQuantity.toLocaleString()}
              detail="Total requested units"
            />
            <TrackingStat
              active
              label={requestStatusLabels[request.status] || request.status}
              value={request.status === "APPROVED" || request.status === "COMPLETED" ? totalQuantity.toLocaleString() : "-"}
              detail={request.approved_at ? `Reviewed by ${approverName}` : "Awaiting CHO"}
            />
            <TrackingStat
              label={primaryItem ? "First Item Stock" : "Item Status"}
              value={stockStatus.label}
              detail={primaryItem?.medicine?.unit_of_measure || "Request items"}
            />
          </section>

          <section className="mt-5 rounded-xl bg-slate-950 p-4 text-white">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-blue-300">
                <ShieldIcon />
              </span>
              <div>
                <h3 className="text-sm font-black">Request Confirmation</h3>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-300">
                  Track this request against the database record. Final receipt is
                  available after CHO marks the request as completed.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-xs font-semibold text-slate-300">
              {request.remarks || "No CHO remarks recorded yet."}
            </div>
          </section>

          <section className="mt-5 grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
                Requested Items
              </p>
              <div className="mt-3 grid gap-2">
                {items.length === 0 ? (
                  <p className="rounded-lg bg-white px-3 py-3 text-sm font-bold text-neutral-500">
                    No medicine items recorded for this request.
                  </p>
                ) : (
                  items.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-1 rounded-lg bg-white px-3 py-3 md:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-black text-neutral-900">{getItemLabel(item)}</p>
                        <p className="text-xs font-semibold text-neutral-500">
                          {item.medicine?.generic_name || "No generic name"} /{" "}
                          {item.medicine?.unit_of_measure || "No unit"}
                        </p>
                      </div>
                      <p className="text-sm font-black text-neutral-800">
                        {Number(item.quantity || 0).toLocaleString()} units
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
            <TrackingDetail label="Facility" value={request.facility?.facility_name || "No facility"} />
            <TrackingDetail label="Request Date" value={formatRequestDate(request.request_date)} />
          </section>
        </div>

        <footer className="flex items-center justify-between border-t border-neutral-100 px-5 py-4">
          <p className="text-xs font-semibold text-emerald-700">Live tracking active</p>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-neutral-50 px-5 text-sm font-black text-neutral-700 hover:bg-neutral-100"
          >
            Close
          </button>
        </footer>
      </article>
    </div>
  );
}

function TrackingStep({ detail, isLast, label, state }) {
  const isComplete = state === "complete";
  const isCurrent = state === "current";
  const isRejected = state === "rejected";
  const dotClass = isRejected
    ? "bg-red-500 text-white"
    : isComplete || isCurrent
      ? "bg-blue-600 text-white"
      : "bg-neutral-200 text-neutral-400";
  const lineClass = isComplete ? "bg-blue-500" : "bg-neutral-200";

  return (
    <div className="relative text-center">
      {!isLast && (
        <span className={`absolute left-1/2 top-4 h-0.5 w-full ${lineClass}`} aria-hidden="true" />
      )}
      <span className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full ${dotClass}`}>
        <CheckIcon />
      </span>
      <p className="mt-2 text-[11px] font-black text-neutral-700">{label}</p>
      <p className="text-[10px] font-semibold text-neutral-400">{detail}</p>
    </div>
  );
}

function TrackingStat({ active = false, detail, label, value }) {
  return (
    <div className={`rounded-lg border p-4 ${active ? "border-blue-200 bg-blue-50" : "border-neutral-200 bg-neutral-50"}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">{label}</p>
      <p className="mt-2 text-xl font-black text-black">{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-neutral-500">{detail}</p>
    </div>
  );
}

function TrackingDetail({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-black uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="text-right font-bold text-neutral-800">{value}</span>
    </div>
  );
}

function NewRequestModal({
  facilityId,
  isSaving,
  medicines,
  onClose,
  onSubmit,
  remarks,
  requestItems,
  setRemarks,
  setRequestItems,
  stockMap,
}) {
  const updateItem = (index, field, value) => {
    setRequestItems((currentItems) =>
      currentItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-black">New Supply Request</h2>
            <p className="mt-1 text-xs font-semibold text-neutral-500">
              Submit a medicine request for CHO review and replenishment.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-800">
            <CloseIcon />
          </button>
        </header>

        <div className="prds-modal-scrollbar max-h-[72vh] overflow-y-auto p-5">
          <section>
            <SectionTitle icon={<ClipboardIcon />} title="Item Specification" />
            <div className="mt-3 grid gap-4">
            {requestItems.map((item, index) => (
              <RequestItemFields
                key={`request-item-${index}`}
                canRemove={requestItems.length > 1}
                facilityId={facilityId}
                item={item}
                medicines={medicines}
                onRemove={() =>
                  setRequestItems((currentItems) =>
                    currentItems.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
                stockMap={stockMap}
                updateItem={(field, value) => updateItem(index, field, value)}
              />
            ))}
            </div>

            <button
              type="button"
              onClick={() => setRequestItems((currentItems) => [...currentItems, { ...emptyItem }])}
              className="mt-3 h-9 rounded-lg border border-dashed border-emerald-300 px-4 text-xs font-black text-emerald-700 hover:bg-emerald-50"
            >
              Add another medicine
            </button>
          </section>

          <section className="mt-5">
            <SectionTitle icon={<TruckIcon />} title="Request Details" />
            <label className="mt-3 grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-500">
              Notes and handling instructions
              <textarea
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                rows="4"
                placeholder="e.g. Current stock is below threshold, urgent monthly replenishment needed..."
                className="resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium normal-case tracking-normal text-neutral-700 outline-none placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </section>

          <div className="mt-5 flex gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
            <span className="mt-0.5 shrink-0 text-blue-600">
              <InfoIcon />
            </span>
            <p>
              <span className="font-black">Procurement Notice:</span> Requests store only
              medicines, quantities, and optional remarks from the database schema. CHO will
              verify availability and approval status before fulfillment.
            </p>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-neutral-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-neutral-50 px-5 text-sm font-black text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {isSaving ? "Submitting..." : "Submit Request"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function RequestItemFields({
  canRemove,
  facilityId,
  item,
  medicines,
  onRemove,
  stockMap,
  updateItem,
}) {
  const selectedMedicine = medicines.find((medicine) => medicine.id === item.medicine_id);
  const stock = stockMap.get(`${facilityId}:${item.medicine_id}`);
  const stockStatus = item.medicine_id
    ? getItemStockStatus(item, facilityId, stockMap)
    : { label: "Select a medicine", tone: "text-neutral-500" };
  const threshold = Number(stock?.threshold || 0);
  const quantity = Number(stock?.quantity || 0);
  const progressValue = threshold > 0 ? Math.min((quantity / Math.max(threshold * 2, 1)) * 100, 100) : 0;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-500">
          Select Medicine
          <select
            required
            value={item.medicine_id}
            onChange={(event) => updateItem("medicine_id", event.target.value)}
            className="h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">Search item (e.g. Amoxicillin)</option>
            {medicines.map((medicine) => (
              <option key={medicine.id} value={medicine.id}>
                {medicine.brand_name || medicine.generic_name} {medicine.dosage}
              </option>
            ))}
          </select>
          {selectedMedicine && (
            <span className="text-xs font-semibold normal-case tracking-normal text-neutral-500">
              {[selectedMedicine.generic_name, selectedMedicine.unit_of_measure]
                .filter(Boolean)
                .join(" / ")}
            </span>
          )}
        </label>

        <div className="rounded-lg border border-neutral-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">
              In-Stock Availability
            </span>
            <span className={`text-xs font-black ${stockStatus.tone}`}>
              {item.medicine_id && stock ? `${quantity.toLocaleString()} Units` : stockStatus.label}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200">
            <div
              className={`h-full rounded-full ${
                quantity <= threshold ? "bg-orange-500" : "bg-blue-500"
              }`}
              style={{ width: `${progressValue}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] font-semibold text-neutral-500">
            Low stock alert threshold: {threshold.toLocaleString()} units
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
        <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-500">
          Requested Quantity
          <input
            required
            min="1"
            type="number"
            value={item.quantity}
            onChange={(event) => updateItem("quantity", event.target.value)}
            placeholder="0"
            className="h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </label>

        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="self-end rounded-lg px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-neutral-600">
      <span className="text-neutral-500">{icon}</span>
      {title}
    </div>
  );
}

const ClipboardIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M9 5h6" />
    <path d="M9 12h6" />
    <path d="M9 16h4" />
    <path d="M8 3h8l1 2h3v16H4V5h3z" />
  </svg>
);

const TruckIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M10 17h4V5H2v12h3" />
    <path d="M14 8h4l4 4v5h-3" />
    <circle cx="7.5" cy="17.5" r="2.5" />
    <circle cx="16.5" cy="17.5" r="2.5" />
  </svg>
);

const InfoIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

const BoxIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="m21 8-9-5-9 5 9 5 9-5Z" />
    <path d="M3 8v8l9 5 9-5V8" />
    <path d="M12 13v8" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="m5 12 4 4L19 6" />
  </svg>
);

const SearchIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const PlusIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

const CloseIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);
