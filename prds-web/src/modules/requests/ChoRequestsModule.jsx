import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import ModalShell from "../../components/ModalShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { formatDateTime } from "../dashboard/dashboardUtils";
import {
  getRequestReleaseBatches,
  getRequestsData,
  reviewMedicineRequest,
} from "./RequestsService";
import {
  buildFefoBatchAllocations,
  formatRequestDate,
  getAllocationValidationError,
  getItemLabel,
  getItemStockStatus,
  getPriorityTone,
  getRequestNumber,
  getRequestPriority,
  getRequestSummary,
  getRequesterName,
  getRequestTotalQuantity,
  getStockMap,
  matchesRequestFilters,
  requestSortOptions,
  requestStatusLabels,
  requestStatusTones,
  sortRequests,
} from "./requestUtils";

const statusDotTones = {
  APPROVED: "bg-blue-500",
  COMPLETED: "bg-emerald-500",
  PENDING: "bg-orange-500",
  REJECTED: "bg-red-500",
};

const summaryFilters = [
  {
    icon: "request",
    label: "Total Requests",
    note: "All facilities",
    status: "ALL",
    valueKey: "total",
  },
  {
    icon: "clock",
    label: "Pending Approval",
    note: "Requires CHO action",
    status: "PENDING",
    valueKey: "pending",
  },
  {
    icon: "transit",
    label: "Approved",
    note: "Ready for fulfillment",
    status: "APPROVED",
    valueKey: "inTransit",
  },
  {
    icon: "check",
    label: "Completed",
    note: "Fulfilled requests",
    status: "COMPLETED",
    valueKey: "completed",
  },
];

export default function ChoRequestsModule() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [inventoryRows, setInventoryRows] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [facilityId, setFacilityId] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [sortMode, setSortMode] = useState("newest");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [releaseBatches, setReleaseBatches] = useState([]);
  const [releaseAllocations, setReleaseAllocations] = useState([]);
  const [isReleaseLoading, setIsReleaseLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const today = useMemo(() => formatDateTime(new Date()), []);
  const stockMap = useMemo(() => getStockMap(inventoryRows), [inventoryRows]);
  const summary = useMemo(() => getRequestSummary(requests), [requests]);

  const filteredRequests = useMemo(() => {
    const matchedRequests = requests.filter((request) =>
      matchesRequestFilters(request, {
        facilityId,
        keyword,
        status: statusFilter,
      })
    );

    return sortRequests(matchedRequests, sortMode);
  }, [facilityId, keyword, requests, sortMode, statusFilter]);

  const selectedRequestDetails = useMemo(() => {
    if (!selectedRequest) {
      return null;
    }

    return requests.find((request) => request.id === selectedRequest.id) || selectedRequest;
  }, [requests, selectedRequest]);

  const loadRequests = async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await getRequestsData();
      setFacilities(data.facilities);
      setInventoryRows(data.inventoryRows);
      setRequests(data.requests);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadRequests();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  useEffect(() => {
    if (!selectedRequestDetails || selectedRequestDetails.status !== "PENDING") {
      return;
    }

    let isCurrent = true;

    const loadReleaseBatches = async () => {
      setIsReleaseLoading(true);
      setError("");

      try {
        const batches = await getRequestReleaseBatches(selectedRequestDetails.id);

        if (!isCurrent) {
          return;
        }

        setReleaseBatches(batches);
        setReleaseAllocations(
          buildFefoBatchAllocations(selectedRequestDetails.items || [], batches)
        );
      } catch (loadError) {
        if (isCurrent) {
          setReleaseBatches([]);
          setReleaseAllocations([]);
          setError(loadError.message);
        }
      } finally {
        if (isCurrent) {
          setIsReleaseLoading(false);
        }
      }
    };

    loadReleaseBatches();

    return () => {
      isCurrent = false;
    };
  }, [selectedRequestDetails]);

  const handleReleaseAllocationChange = ({
    requestItemId,
    sourceInventoryId,
    quantity,
  }) => {
    const numericQuantity = Number(quantity || 0);

    setReleaseAllocations((currentAllocations) => {
      const withoutCurrent = currentAllocations.filter(
        (allocation) =>
          !(
            allocation.request_item_id === requestItemId &&
            allocation.source_inventory_id === sourceInventoryId
          )
      );

      if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
        return withoutCurrent;
      }

      return [
        ...withoutCurrent,
        {
          request_item_id: requestItemId,
          source_inventory_id: sourceInventoryId,
          quantity: numericQuantity,
        },
      ];
    });
  };

  const handleReview = async (request, status) => {
    if (!profile?.id || isSaving) {
      return;
    }

    const activeAllocations = releaseAllocations.filter(
      (allocation) => Number(allocation.quantity || 0) > 0
    );

    if (status === "APPROVED") {
      const allocationError = getAllocationValidationError(
        request.items || [],
        releaseBatches,
        activeAllocations
      );

      if (allocationError) {
        setError(allocationError);
        return;
      }
    }

    setIsSaving(true);
    setError("");

    try {
      const updatedRequest = await reviewMedicineRequest({
        allocations: activeAllocations,
        profileId: profile.id,
        remarks,
        requestId: request.id,
        status,
      });

      setRequests((currentRequests) =>
        currentRequests.map((currentRequest) =>
          currentRequest.id === updatedRequest.id ? updatedRequest : currentRequest
        )
      );
      setSelectedRequest(updatedRequest);
      setRemarks("");
      setReleaseBatches([]);
      setReleaseAllocations([]);
      await loadRequests();
    } catch (saveError) {
      setError(saveError.message);
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

      <section className="grid gap-4 lg:grid-cols-4">
        {summaryFilters.map((filter) => (
          <SummaryCard
            key={filter.status}
            active={statusFilter === filter.status}
            iconKey={filter.icon}
            label={filter.label}
            note={filter.note}
            onClick={() => setStatusFilter(filter.status)}
            value={summary[filter.valueKey]}
          />
        ))}
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-4">
          <div>
            <h2 className="text-base font-black text-black">Distribution Request</h2>
            <p className="mt-1 text-xs font-semibold text-neutral-500">
              Review, approve, reject, and track requests from all facilities.
            </p>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
            <div className="relative min-w-60 flex-1 lg:max-w-96">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Search request ID, facility, medicine..."
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <SelectFilter
              value={facilityId}
              onChange={setFacilityId}
              options={[
                { value: "ALL", label: "All Facilities" },
                ...facilities.map((facility) => ({
                  value: facility.id,
                  label: facility.facility_name,
                })),
              ]}
            />
            <SortFilter
              isOpen={isSortOpen}
              onChange={(nextSortMode) => {
                setSortMode(nextSortMode);
                setIsSortOpen(false);
              }}
              onToggle={() => setIsSortOpen((isOpen) => !isOpen)}
              options={requestSortOptions}
              value={sortMode}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-262.5 w-full border-collapse text-left">
            <thead className="bg-neutral-50">
              <tr className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">
                <th className="px-4 py-3">Request ID</th>
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-14 text-center text-sm font-bold text-neutral-500">
                    Loading medicine requests...
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-14 text-center text-sm font-bold text-neutral-500">
                    No requests match the current filters.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((request) => (
                  <RequestRow
                    key={request.id}
                    request={request}
                    onReview={handleReview}
                    onSelect={() => {
                      setReleaseBatches([]);
                      setReleaseAllocations([]);
                      setSelectedRequest(request);
                      setRemarks(request.remarks || "");
                    }}
                    isSaving={isSaving}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3 text-xs font-semibold text-neutral-500">
          <span>
            Showing {filteredRequests.length} of {requests.length} requests
          </span>
          <span>
            {requestStatusLabels[statusFilter] || "All requests"} are shown from the selected facility scope.
          </span>
        </div>
      </section>

      {selectedRequestDetails && (
        <RequestDetailsModal
          isSaving={isSaving}
          onClose={() => {
            setSelectedRequest(null);
            setRemarks("");
            setReleaseBatches([]);
            setReleaseAllocations([]);
          }}
          onReview={handleReview}
          isReleaseLoading={isReleaseLoading}
          onReleaseAllocationChange={handleReleaseAllocationChange}
          releaseAllocations={releaseAllocations}
          releaseBatches={releaseBatches}
          remarks={remarks}
          request={selectedRequestDetails}
          setRemarks={setRemarks}
          stockMap={stockMap}
        />
      )}
    </AdminShell>
  );
}

function SummaryCard({ active = false, iconKey, label, note, onClick, value }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        active
          ? "border-[#00a36c] bg-[#00a36c] text-white shadow-md shadow-emerald-100"
          : "border-neutral-200 bg-white text-black"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-black uppercase tracking-[0.14em] ${active ? "text-emerald-50" : "text-neutral-500"}`}>
            {label}
          </p>
          <p className="mt-5 text-3xl font-black">{value}</p>
          <p className={`mt-1 text-xs font-semibold ${active ? "text-white/70" : "text-neutral-500"}`}>
            {note}
          </p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${active ? "bg-white/20 text-white" : "bg-neutral-50 text-neutral-500"}`}>
          <SummaryIcon iconKey={iconKey} />
        </span>
      </div>
    </button>
  );
}

function SummaryIcon({ iconKey }) {
  if (iconKey === "clock") {
    return <ClockIcon />;
  }

  if (iconKey === "transit") {
    return <TransitIcon />;
  }

  if (iconKey === "check") {
    return <CheckIcon />;
  }

  return <RequestIcon />;
}

function RequestRow({ isSaving, onReview, onSelect, request }) {
  const priority = getRequestPriority(request);
  const canReview = request.status === "PENDING";

  return (
    <tr className="align-top text-sm hover:bg-neutral-50">
      <td className="px-4 py-4">
        <button
          type="button"
          onClick={onSelect}
          className="text-left text-xs font-black text-blue-600 hover:text-blue-800"
        >
          {getRequestNumber(request.id)}
        </button>
      </td>
      <td className="px-4 py-4">
        <p className="font-black text-black">{request.facility?.facility_name || "No facility"}</p>
        <p className="mt-1 text-xs font-semibold text-neutral-500">
          {request.facility?.facility_code || "No code"}
        </p>
      </td>
      <td className="px-4 py-4">
        <div className="space-y-1">
          {(request.items || []).slice(0, 2).map((item) => (
            <p key={item.id} className="text-xs font-semibold text-neutral-700">
              {getItemLabel(item)} ({item.quantity})
            </p>
          ))}
          {(request.items || []).length > 2 && (
            <p className="text-xs font-bold text-neutral-400">
              +{request.items.length - 2} more
            </p>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <span className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-wide ${getPriorityTone(priority)}`}>
          {priority}
        </span>
      </td>
      <td className="px-4 py-4">
        <span className="inline-flex items-center gap-2 text-xs font-black text-neutral-700">
          <span className={`h-2 w-2 rounded-full ${statusDotTones[request.status] || "bg-neutral-300"}`} />
          {requestStatusLabels[request.status] || request.status}
        </span>
      </td>
      <td className="px-4 py-4 text-xs font-semibold text-neutral-600">
        {formatRequestDate(request.request_date)}
      </td>
      <td className="px-4 py-4">
        <div className="flex justify-end gap-2">
          {canReview ? (
            <>
              <button
                type="button"
                disabled={isSaving}
                onClick={onSelect}
                className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                Review
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onReview(request, "REJECTED")}
                className="h-8 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-300"
              >
                Reject
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onSelect}
              className="h-8 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-black text-blue-600 hover:bg-blue-50"
            >
              Track
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function RequestDetailsModal({
  isSaving,
  isReleaseLoading,
  onClose,
  onReview,
  onReleaseAllocationChange,
  releaseAllocations,
  releaseBatches,
  remarks,
  request,
  setRemarks,
  stockMap,
}) {
  const priority = getRequestPriority(request);
  const canReview = request.status === "PENDING";
  const allocationsByKey = new Map(
    (releaseAllocations || []).map((allocation) => [
      `${allocation.request_item_id}:${allocation.source_inventory_id}`,
      Number(allocation.quantity || 0),
    ])
  );
  const getAllocatedQuantity = (requestItemId, sourceInventoryId) =>
    allocationsByKey.get(`${requestItemId}:${sourceInventoryId}`) || 0;
  const getTotalAllocatedForItem = (requestItemId) =>
    (releaseAllocations || [])
      .filter((allocation) => allocation.request_item_id === requestItemId)
      .reduce((total, allocation) => total + Number(allocation.quantity || 0), 0);

  return (
    <ModalShell
      labelledBy="request-review-modal-title"
      onClose={onClose}
      overlayClassName="bg-white/95 backdrop-blur-sm"
    >
      <article className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="request-review-modal-title" className="text-base font-black text-black">{getRequestNumber(request.id)}</h2>
            <span className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-wide ${requestStatusTones[request.status] || "bg-neutral-100 text-neutral-700"}`}>
              {requestStatusLabels[request.status] || request.status}
            </span>
            <span className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-wide ${getPriorityTone(priority)}`}>
              {priority} priority
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-800">
            <CloseIcon />
          </button>
        </header>

        <div className="prds-modal-scrollbar max-h-[72vh] overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <DetailPanel title="Facility Details">
              <p className="font-black text-black">{request.facility?.facility_name || "No facility"}</p>
              <p className="mt-1 text-sm font-semibold text-neutral-600">
                {request.facility?.address || "No address recorded"}
              </p>
              <p className="mt-1 text-xs font-black uppercase tracking-wide text-neutral-400">
                {request.facility?.facility_code || "No code"}
              </p>
            </DetailPanel>

            <DetailPanel title="Requester Info">
              <p className="font-black text-black">{getRequesterName(request)}</p>
              <p className="mt-1 text-sm font-semibold text-neutral-600">
                {request.requester?.email || request.requester?.phone_number || "No contact recorded"}
              </p>
              <p className="mt-1 text-xs font-black uppercase tracking-wide text-neutral-400">
                {request.requester?.role || "No role"}
              </p>
            </DetailPanel>
          </div>

          <section className="mt-5">
            <h3 className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
              Requested Items
            </h3>
            <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-neutral-50 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                  <tr>
                    <th className="px-3 py-3">Item Name</th>
                    <th className="px-3 py-3">Quantity</th>
                    <th className="px-3 py-3">Stock Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {(request.items || []).length === 0 ? (
                    <tr>
                      <td colSpan="3" className="px-3 py-6 text-center text-sm font-bold text-neutral-500">
                        No requested items recorded.
                      </td>
                    </tr>
                  ) : (
                    request.items.map((item) => {
                      const stockStatus = getItemStockStatus(item, request.facility_id, stockMap);

                      return (
                        <tr key={item.id}>
                          <td className="px-3 py-3 font-semibold text-neutral-700">
                            {getItemLabel(item)}
                          </td>
                          <td className="px-3 py-3 text-neutral-600">
                            {item.quantity} {item.medicine?.unit_of_measure || "units"}
                          </td>
                          <td className={`px-3 py-3 text-xs font-black ${stockStatus.tone}`}>
                            {stockStatus.label}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {canReview && (
            <section className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                    Batch Release
                  </h3>
                  <p className="mt-1 text-xs font-semibold leading-5 text-neutral-500">
                    FEFO is preselected. Adjust batches if CHO needs to release a specific stock lot.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                  CHO stock
                </span>
              </div>

              {isReleaseLoading ? (
                <p className="mt-4 rounded-lg bg-white px-3 py-4 text-center text-sm font-bold text-neutral-500">
                  Loading CHO batches...
                </p>
              ) : releaseBatches.length === 0 ? (
                <p className="mt-4 rounded-lg border border-orange-100 bg-white px-3 py-4 text-center text-sm font-bold text-orange-700">
                  No available CHO batches can fulfill this request.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {(request.items || []).map((item) => {
                    const itemBatches = releaseBatches.filter(
                      (batch) => batch.request_item_id === item.id
                    );
                    const requestedQuantity = Number(item.quantity || 0);
                    const allocatedQuantity = getTotalAllocatedForItem(item.id);
                    const isFullyAllocated = allocatedQuantity === requestedQuantity;

                    return (
                      <div key={item.id} className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-3 py-3">
                          <div>
                            <p className="text-sm font-black text-black">{getItemLabel(item)}</p>
                            <p className="text-xs font-semibold text-neutral-500">
                              Requested: {requestedQuantity.toLocaleString()}{" "}
                              {item.medicine?.unit_of_measure || "units"}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                              isFullyAllocated
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-orange-100 text-orange-700"
                            }`}
                          >
                            {allocatedQuantity.toLocaleString()} / {requestedQuantity.toLocaleString()} allocated
                          </span>
                        </div>

                        {itemBatches.length === 0 ? (
                          <p className="px-3 py-4 text-sm font-bold text-neutral-500">
                            No CHO batch is available for this medicine.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-[680px] w-full border-collapse text-left text-xs">
                              <thead className="bg-neutral-50 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                                <tr>
                                  <th className="px-3 py-2">Batch</th>
                                  <th className="px-3 py-2">Supplier</th>
                                  <th className="px-3 py-2">Available</th>
                                  <th className="px-3 py-2">Expiry</th>
                                  <th className="px-3 py-2 text-right">Release Qty</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-100">
                                {itemBatches.map((batch) => {
                                  const value = getAllocatedQuantity(
                                    item.id,
                                    batch.source_inventory_id
                                  );

                                  return (
                                    <tr key={batch.source_inventory_id}>
                                      <td className="px-3 py-2 font-black text-neutral-800">
                                        {batch.batch_number}
                                        {batch.recommended_quantity > 0 && (
                                          <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                                            FEFO
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 font-semibold text-neutral-600">
                                        {batch.supplier_name || "No supplier"}
                                      </td>
                                      <td className="px-3 py-2 font-semibold text-neutral-600">
                                        {Number(batch.quantity || 0).toLocaleString()}
                                      </td>
                                      <td className="px-3 py-2 font-semibold text-neutral-600">
                                        {formatRequestDate(batch.expiration_date)}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <input
                                          type="number"
                                          min="0"
                                          max={batch.quantity}
                                          disabled={isSaving}
                                          value={value || ""}
                                          onChange={(event) =>
                                            onReleaseAllocationChange({
                                              quantity: event.target.value,
                                              requestItemId: item.id,
                                              sourceInventoryId: batch.source_inventory_id,
                                            })
                                          }
                                          className="h-9 w-24 rounded-lg border border-neutral-200 px-2 text-right text-xs font-black text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-neutral-50"
                                        />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <section className="mt-5 grid gap-4 md:grid-cols-[1fr_220px]">
            <DetailPanel title="Activity Log">
              <TimelineItem
                active
                title="Request submitted"
                detail={`${formatRequestDate(request.request_date)} by ${getRequesterName(request)}`}
              />
              {request.approved_at ? (
                <TimelineItem
                  active
                  title={`${requestStatusLabels[request.status] || request.status} by CHO`}
                  detail={`${formatRequestDate(request.approved_at)} by ${
                    request.approver
                      ? `${request.approver.first_name || ""} ${request.approver.last_name || ""}`.trim()
                      : "CHO staff"
                  }`}
                />
              ) : (
                <TimelineItem title="Awaiting CHO approval" detail="Current status" />
              )}
            </DetailPanel>

            <DetailPanel title="Request Summary">
              <p className="text-2xl font-black text-black">{getRequestTotalQuantity(request)}</p>
              <p className="text-xs font-bold text-neutral-500">Total requested units</p>
              <p className="mt-4 text-2xl font-black text-black">{request.items?.length || 0}</p>
              <p className="text-xs font-bold text-neutral-500">Medicine line items</p>
            </DetailPanel>
          </section>

          <label className="mt-5 grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-500">
            CHO Remarks
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows="3"
              placeholder="Optional reason or fulfillment note..."
              className="resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium normal-case tracking-normal text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-neutral-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-neutral-50 px-5 text-sm font-black text-neutral-700 hover:bg-neutral-100"
          >
            Close
          </button>
          {canReview && (
            <>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onReview(request, "REJECTED")}
                className="h-10 rounded-lg border border-red-300 bg-white px-5 text-sm font-black text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-neutral-300"
              >
                Reject Request
              </button>
              <button
                type="button"
                disabled={isSaving || isReleaseLoading}
                onClick={() => onReview(request, "APPROVED")}
                className="h-10 rounded-lg bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                Approve and Release
              </button>
            </>
          )}
        </footer>
      </article>
    </ModalShell>
  );
}

function DetailPanel({ children, title }) {
  return (
    <section className="rounded-lg bg-neutral-50 p-4">
      <h3 className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function TimelineItem({ active = false, detail, title }) {
  return (
    <div className="relative pb-4 pl-5 last:pb-0">
      <span className={`absolute left-0 top-1 h-2.5 w-2.5 rounded-full ${active ? "bg-blue-500" : "bg-neutral-300"}`} />
      <span className="absolute bottom-0 left-1 top-4 w-px bg-neutral-200 last:hidden" />
      <p className="text-sm font-black text-neutral-800">{title}</p>
      <p className="mt-1 text-xs font-semibold text-neutral-500">{detail}</p>
    </div>
  );
}

function SelectFilter({ onChange, options, value }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function SortFilter({ isOpen, onChange, onToggle, options, value }) {
  const selectedOption = options.find((option) => option.value === value) || options[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-10 min-w-38 items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 outline-none transition hover:bg-neutral-50 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      >
        <span className="inline-flex items-center gap-2">
          <SortIcon />
          {selectedOption.label}
        </span>
        <ChevronIcon />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl shadow-neutral-200/70">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold ${
                option.value === value
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {option.label}
              {option.value === value && <SmallCheckIcon />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SearchIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const SortIcon = () => (
  <svg className="h-4 w-4 text-neutral-500" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M4 7h12" />
    <path d="M4 12h8" />
    <path d="M4 17h4" />
  </svg>
);

const ChevronIcon = () => (
  <svg className="h-4 w-4 text-neutral-400" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const SmallCheckIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const RequestIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
    <path d="M7 3h8l4 4v14H7V3Z" />
    <path d="M14 3v5h5M10 13h6M10 17h4" />
  </svg>
);

const ClockIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v5l3 2" />
  </svg>
);

const TransitIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
    <path d="M3 12h12" />
    <path d="m12 7 5 5-5 5" />
    <path d="M18 7h3v10h-3" />
  </svg>
);

const CheckIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const CloseIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);
