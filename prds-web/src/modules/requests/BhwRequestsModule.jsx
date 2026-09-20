import { useCallback, useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import ModalShell from "../../components/ModalShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { formatDateTime } from "../dashboard/dashboardUtils";
import {
  confirmRequestReceived,
  createBhwMedicineRequest,
  getBhwRequestsData,
  getChoInventoryMedicines,
} from "./RequestsService";
import {
  buildRequestsCsv,
  formatRequestDate,
  getChoAvailabilityMap,
  getDuplicateRequestMedicineIds,
  getItemStockStatus,
  getLowStockRequestItems,
  getMedicineFullLabel,
  getRelativeTime,
  getRequestItemFullLabel,
  getRequestNumber,
  getRequestTotalQuantity,
  getRequestTrackingSteps,
  getStockMap,
  matchesRequestFilters,
  normalizeRequestErrorMessage,
  requestStatusLabels,
  sortRequests,
  validateChoRequestAvailability,
} from "./requestUtils";
import { SortDirectionIcon } from "../transfers/TransferUi";
import {
  ActionButton,
  ClockIcon as UiClockIcon,
  DownloadIcon as UiDownloadIcon,
  IconButton,
  PlusIcon as UiPlusIcon,
  RefreshIcon as UiRefreshIcon,
  RequestEmptyState,
  RequestPanel,
  RequestPanelHeader,
  RequestSearchInput,
  RequestStatusBadge,
  RequestToolbar,
} from "./RequestUi";

const emptyItem = {
  medicine_id: "",
  quantity: "",
};

const ongoingRequestStatuses = ["PENDING", "APPROVED"];
const historyRequestStatuses = ["COMPLETED", "REJECTED"];

export default function BhwRequestsModule() {
  const { profile } = useAuth();
  const profileFacilityId = profile?.facility_id;
  const profileId = profile?.id;
  const [requests, setRequests] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [inventoryRows, setInventoryRows] = useState([]);
  const [sortMode, setSortMode] = useState("newest");
  const [keyword, setKeyword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMedicinesLoading, setIsMedicinesLoading] = useState(false);
  const [medicinesError, setMedicinesError] = useState("");
  const [isReceiving, setIsReceiving] = useState(false);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOngoingModalOpen, setIsOngoingModalOpen] = useState(false);
  const [trackedRequest, setTrackedRequest] = useState(null);
  const [confirmedRequestId, setConfirmedRequestId] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [requestItems, setRequestItems] = useState([{ ...emptyItem }]);

  const today = useMemo(() => formatDateTime(new Date()), []);
  const stockMap = useMemo(() => getStockMap(inventoryRows), [inventoryRows]);

  const ongoingRequests = useMemo(
    () =>
      sortRequests(
        requests.filter((request) => ongoingRequestStatuses.includes(request.status)),
        "newest"
      ),
    [requests]
  );

  const choAvailabilityMap = useMemo(() => getChoAvailabilityMap(medicines), [medicines]);

  const filteredRequests = useMemo(() => {
    const matchedRequests = requests.filter(
      (request) =>
        historyRequestStatuses.includes(request.status) &&
        matchesRequestFilters(request, { keyword })
    );

    return sortRequests(matchedRequests, sortMode);
  }, [keyword, requests, sortMode]);

  const lowStockItems = useMemo(
    () => getLowStockRequestItems(profileFacilityId, stockMap, choAvailabilityMap),
    [choAvailabilityMap, profileFacilityId, stockMap]
  );

  const pendingRequestsByMedicine = useMemo(() => {
    const pendingByMedicine = new Map();

    requests.forEach((request) => {
      if (request.status !== "PENDING") {
        return;
      }

      (request.items || []).forEach((item) => {
        if (!item.medicine_id) {
          return;
        }

        if (!pendingByMedicine.has(item.medicine_id)) {
          pendingByMedicine.set(item.medicine_id, []);
        }

        pendingByMedicine.get(item.medicine_id).push(getRequestNumber(request.id));
      });
    });

    return pendingByMedicine;
  }, [requests]);

  const applyRequestsData = useCallback((data) => {
    setRequests(data.requests);
    setMedicines(data.medicines);
    setInventoryRows(data.inventoryRows);
  }, []);

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
      applyRequestsData(data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, [applyRequestsData, profileFacilityId]);

  const loadMedicines = useCallback(async () => {
    setIsMedicinesLoading(true);
    setMedicinesError("");

    try {
      setMedicines(await getChoInventoryMedicines());
    } catch (availabilityError) {
      setMedicines([]);
      setMedicinesError(normalizeRequestErrorMessage(availabilityError.message));
    } finally {
      setIsMedicinesLoading(false);
    }
  }, []);

  const openNewRequestModal = async () => {
    setError("");
    setIsModalOpen(true);
    await loadMedicines();
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadRequests();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadRequests]);

  const toggleSort = () => {
    setSortMode((current) => (current === "newest" ? "oldest" : "newest"));
  };

  const clearFilters = () => {
    setSortMode("newest");
    setKeyword("");
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadRequests();
    } finally {
      setIsRefreshing(false);
    }
  };

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

    const availabilityError = validateChoRequestAvailability(
      validItems,
      choAvailabilityMap
    );

    if (availabilityError) {
      setError(availabilityError);
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const createdRequestId = await createBhwMedicineRequest({
        items: validItems,
        remarks,
      });
      setIsModalOpen(false);
      resetForm();
      setConfirmedRequestId(createdRequestId);
      await loadRequests();
    } catch (saveError) {
      setError(normalizeRequestErrorMessage(saveError.message));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmReceipt = async () => {
    if (!trackedRequest || !profileId) {
      return;
    }

    setIsReceiving(true);
    setError("");

    try {
      await confirmRequestReceived({ requestId: trackedRequest.id });
      const data = await getBhwRequestsData({ facilityId: profileFacilityId });
      applyRequestsData(data);

      const updatedRequest =
        data.requests.find((request) => request.id === trackedRequest.id) || null;

      setTrackedRequest(updatedRequest);
    } catch (receiptError) {
      setError(normalizeRequestErrorMessage(receiptError.message));
    } finally {
      setIsReceiving(false);
    }
  };

  const exportCsv = () => {
    const csv = buildRequestsCsv(filteredRequests);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `bhw-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const confirmedRequest = confirmedRequestId
    ? requests.find((request) => request.id === confirmedRequestId) || null
    : null;

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-black">Medicine Request</h2>
          <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-neutral-500">
            Submit and track medical supply requests for{" "}
            {profile?.facility?.facility_name || "your assigned facility"}.
          </p>
        </div>

        <ActionButton onClick={openNewRequestModal} tone="dark">
          <UiPlusIcon />
          New Request
        </ActionButton>
      </section>

      <OngoingRequestsPanel
        onOpenList={() => setIsOngoingModalOpen(true)}
        onTrackRequest={setTrackedRequest}
        requests={ongoingRequests}
      />

      <RequestPanel className="mt-4">
        <RequestPanelHeader
          title="Request History"
          subtitle={`Completed and rejected medicine requests for ${profile?.facility?.facility_name || "your assigned facility"}.`}
          actions={
            <div className="flex items-center gap-2">
              <IconButton
                onClick={toggleSort}
                title={sortMode === "newest" ? "Newest first" : "Oldest first"}
              >
                <SortDirectionIcon direction={sortMode} />
              </IconButton>
              <IconButton
                onClick={handleRefresh}
                disabled={isLoading}
                title="Refresh request history"
              >
                <span className={isRefreshing ? "inline-block animate-spin" : ""}>
                  <UiRefreshIcon />
                </span>
              </IconButton>
              <ActionButton
                onClick={exportCsv}
                disabled={filteredRequests.length === 0}
                tone="soft"
              >
                <UiDownloadIcon />
                Export CSV
              </ActionButton>
            </div>
          }
        />
        <RequestToolbar>
          <RequestSearchInput
            value={keyword}
            onChange={setKeyword}
            placeholder="Search request ID, medicine, quantity, date, or status..."
          />
        </RequestToolbar>

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
                  <td colSpan="6">
                    <RequestsEmptyState
                      hasAnyRequests={requests.length > 0}
                      onClearFilters={clearFilters}
                    />
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
      </RequestPanel>

      {isOngoingModalOpen && (
        <OngoingRequestsModal
          onClose={() => setIsOngoingModalOpen(false)}
          onOpenRequest={(request) => {
            setIsOngoingModalOpen(false);
            setTrackedRequest(request);
          }}
          requests={ongoingRequests}
        />
      )}

      {isModalOpen && (
        <NewRequestModal
          choAvailabilityMap={choAvailabilityMap}
          error={error}
          isMedicinesLoading={isMedicinesLoading}
          isSaving={isSaving}
          lowStockItems={lowStockItems}
          medicines={medicines}
          medicinesError={medicinesError}
          onClose={() => {
            setIsModalOpen(false);
            resetForm();
          }}
          onRetryMedicines={loadMedicines}
          onSubmit={submitRequest}
          pendingRequestsByMedicine={pendingRequestsByMedicine}
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
          isReceiving={isReceiving}
          onClose={() => setTrackedRequest(null)}
          onConfirmReceipt={confirmReceipt}
          request={trackedRequest}
          stockMap={stockMap}
        />
      )}

      {confirmedRequest && (
        <RequestConfirmationModal
          onClose={() => setConfirmedRequestId(null)}
          onTrack={() => {
            setTrackedRequest(confirmedRequest);
            setConfirmedRequestId(null);
          }}
          request={confirmedRequest}
        />
      )}
    </AdminShell>
  );
}

function OngoingRequestsPanel({ onOpenList, onTrackRequest, requests }) {
  const visibleRequests = requests.slice(0, 3);

  return (
    <RequestPanel className="mt-4">
      <RequestPanelHeader
        eyebrow="Active Request Tracking"
        title="Ongoing Requests"
        subtitle="Pending and approved requests that still need CHO action or receipt confirmation."
        actions={
          requests.length > 3 ? (
            <ActionButton onClick={onOpenList} tone="soft">
              View all {requests.length}
            </ActionButton>
          ) : null
        }
      />
      {requests.length === 0 ? (
        <RequestEmptyState
          title="No ongoing requests"
          description="Newly submitted requests appear here until CHO approves them and your facility confirms receipt."
          icon={<UiClockIcon />}
        />
      ) : (
        <div className="grid gap-3 p-4 lg:grid-cols-3">
          {visibleRequests.map((request) => {
            const totalQuantity = getRequestTotalQuantity(request);
            const items = request.items || [];

            return (
              <button
                key={request.id}
                type="button"
                onClick={() => onTrackRequest(request)}
                className="group rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/30 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-blue-600">{getRequestNumber(request.id)}</p>
                    <p className="mt-1 text-[11px] font-semibold text-neutral-400">
                      {getRelativeTime(request.request_date)} / {items.length} item{items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <RequestStatusBadge status={request.status} />
                </div>
                <div className="mt-3 space-y-1.5">
                  {items.slice(0, 2).map((item) => (
                    <p key={item.id} className="truncate text-xs font-bold text-neutral-700">
                      {getRequestItemFullLabel(item)}
                    </p>
                  ))}
                  {items.length > 2 && (
                    <p className="text-xs font-bold text-neutral-400">+{items.length - 2} more items</p>
                  )}
                </div>
                <p className="mt-3 text-[10px] font-black uppercase tracking-wide text-neutral-400">
                  {totalQuantity.toLocaleString()} total units
                </p>
              </button>
            );
          })}
        </div>
      )}
    </RequestPanel>
  );
}
function RequestsEmptyState({ hasAnyRequests, onClearFilters }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <InboxIcon />
      </span>
      <p className="mt-4 text-sm font-black text-neutral-700">
        {hasAnyRequests ? "No requests match the current filters." : "No requests yet"}
      </p>
      <p className="mt-1 max-w-sm text-xs font-semibold leading-5 text-neutral-500">
        {hasAnyRequests
          ? "Try adjusting your keyword search."
          : "Submit your first medicine request for CHO review and replenishment."}
      </p>
      {hasAnyRequests && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 h-9 rounded-lg border border-neutral-200 bg-white px-4 text-xs font-black text-neutral-600 transition hover:border-emerald-300 hover:text-emerald-700"
        >
          Clear filters
        </button>
      )}
    </div>
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
        <div className="flex flex-col items-start gap-1">
          <span className="rounded bg-neutral-100 px-2 py-1 text-[10px] font-black text-neutral-600">
            {getRequestNumber(request.id)}
          </span>
          <span className="text-[10px] font-semibold text-neutral-400">
            {getRelativeTime(request.request_date)}
          </span>
        </div>
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
                {getRequestItemFullLabel(item)}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-4 text-xs font-black text-neutral-600">
        {totalQuantity.toLocaleString()} units
      </td>
      <td className="px-4 py-4">
        <RequestStatusBadge status={request.status} />
      </td>
      <td className="px-4 py-4 text-sm italic leading-6 text-neutral-600">
        {request.remarks || "No admin notes yet."}
      </td>
    </tr>
  );
}

function OngoingRequestsModal({ onClose, onOpenRequest, requests }) {
  return (
    <ModalShell
      labelledBy="ongoing-requests-title"
      onClose={onClose}
      overlayClassName="bg-white/95 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <div>
            <h3 id="ongoing-requests-title" className="text-base font-black text-black">
              Ongoing Requests
            </h3>
            <p className="mt-1 text-xs font-semibold text-neutral-500">
              Requests awaiting CHO approval or release.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-800">
            <CloseIcon />
          </button>
        </header>

        <div className="prds-modal-scrollbar max-h-[60vh] overflow-y-auto p-4">
          {requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-500">
                <ClockIcon />
              </span>
              <p className="mt-4 text-sm font-black text-neutral-700">No ongoing requests</p>
              <p className="mt-1 max-w-xs text-xs font-semibold leading-5 text-neutral-500">
                Newly submitted requests will appear here until they are approved and received.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {requests.map((request) => {
                const items = request.items || [];
                const totalQuantity = getRequestTotalQuantity(request);

                return (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => onOpenRequest(request)}
                    className="group rounded-xl border border-neutral-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-neutral-900">
                        {getRequestNumber(request.id)}
                      </span>
                      <RequestStatusBadge status={request.status} />
                    </div>
                    <p className="mt-2 text-[11px] font-semibold text-neutral-500">
                      {getRelativeTime(request.request_date)} / {items.length} item
                      {items.length === 1 ? "" : "s"} / {totalQuantity.toLocaleString()} units
                    </p>
                    {items.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {items.map((item) => (
                          <span
                            key={item.id}
                            className="rounded-md bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-600 group-hover:bg-white"
                          >
                            {getRequestItemFullLabel(item)}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-neutral-100 px-5 py-4">
          <p className="text-xs font-semibold text-neutral-500">
            {requests.length} ongoing request{requests.length === 1 ? "" : "s"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-neutral-50 px-5 text-sm font-black text-neutral-700 hover:bg-neutral-100"
          >
            Close
          </button>
        </footer>
      </div>
    </ModalShell>
  );
}

function RequestTrackingModal({ isReceiving, onClose, onConfirmReceipt, request, stockMap }) {
  const [awaitingReceipt, setAwaitingReceipt] = useState(false);
  const items = request.items || [];
  const primaryItem = items[0] || null;
  const steps = getRequestTrackingSteps(request);
  const stockStatus = primaryItem
    ? getItemStockStatus(primaryItem, request.facility_id, stockMap)
    : { label: "No items", tone: "text-neutral-500" };
  const approverName = request.approver
    ? `${request.approver.first_name || ""} ${request.approver.last_name || ""}`.trim()
    : "CHO staff";
  const receiverName = request.receiver
    ? `${request.receiver.first_name || ""} ${request.receiver.last_name || ""}`.trim()
    : "facility staff";
  const totalQuantity = getRequestTotalQuantity(request);

  return (
    <ModalShell
      labelledBy="request-tracking-modal-title"
      onClose={onClose}
      overlayClassName="bg-white/95 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <div className="flex gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <BoxIcon />
            </span>
            <div>
              <h3 id="request-tracking-modal-title" className="text-base font-black text-black">
                {getRequestNumber(request.id)}
              </h3>
              <p className="mt-1 text-[11px] font-black uppercase tracking-wide text-neutral-400">
                {request.facility?.facility_code || "Facility"} / {items.length} item{items.length === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-neutral-400">
                Submitted {getRelativeTime(request.request_date)}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-800">
            <CloseIcon />
          </button>
        </header>

        <div className="prds-modal-scrollbar max-h-[72vh] overflow-y-auto px-5 py-4">
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
              Request Progress
            </h4>
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

          <section
            className={`mt-5 rounded-xl p-4 text-white ${
              request.status === "COMPLETED"
                ? "bg-emerald-900"
                : request.status === "REJECTED"
                  ? "bg-red-900"
                  : "bg-slate-950"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className={request.status === "COMPLETED" ? "text-emerald-300" : "text-blue-300"}>
                <ShieldIcon />
              </span>
              <div>
                <h4 className="text-sm font-black">
                  {request.status === "COMPLETED"
                    ? "Request Received"
                    : request.status === "REJECTED"
                      ? "Request Rejected"
                      : "Request Review"}
                </h4>
                <p className="mt-1 text-xs font-semibold leading-5 text-white/70">
                  {request.status === "COMPLETED"
                    ? request.received_at
                      ? `Received on ${formatRequestDate(request.received_at)} by ${receiverName}.`
                      : "Request completed and confirmed by CHO."
                    : request.status === "APPROVED"
                      ? "CHO approved this request. Confirm receipt when the supplies arrive."
                      : "Track this request against the database record. Final receipt is available after CHO marks the request as completed."}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-xs font-semibold text-white/80">
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
                        <p className="font-black text-neutral-900">
                          {getRequestItemFullLabel(item)}
                        </p>
                        <p className="text-xs font-semibold text-neutral-500">
                          Generic: {item.medicine?.generic_name || "No generic name"} / Brand:{" "}
                          {item.medicine?.brand_name || "Generic"} / Unit:{" "}
                          {item.medicine?.unit_of_measure || "No unit"} / Dosage:{" "}
                          {item.medicine?.dosage || "No dosage"}
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
            {request.status === "COMPLETED" && request.received_at && (
              <TrackingDetail
                label="Received On"
                value={`${formatRequestDate(request.received_at)} / ${receiverName}`}
              />
            )}
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-5 py-4">
          <p className="text-xs font-semibold text-neutral-500">
            {request.status === "COMPLETED"
              ? "Request completed and received."
              : request.status === "APPROVED"
                ? awaitingReceipt
                  ? "Confirm receipt of this request?"
                  : "This request is approved and awaiting confirmation."
                : request.status === "REJECTED"
                  ? "This request was rejected by CHO."
                  : "This request is pending CHO review."}
          </p>
          <div className="flex items-center gap-2">
            {request.status === "APPROVED" &&
              (awaitingReceipt ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAwaitingReceipt(false)}
                    disabled={isReceiving}
                    className="h-10 rounded-lg bg-neutral-50 px-5 text-sm font-black text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onConfirmReceipt}
                    disabled={isReceiving}
                    className="h-10 rounded-lg bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isReceiving ? "Confirming..." : "Confirm Receipt"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setAwaitingReceipt(true)}
                  className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-black text-white hover:bg-emerald-700"
                >
                  Mark as Received
                </button>
              ))}
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg bg-neutral-50 px-5 text-sm font-black text-neutral-700 hover:bg-neutral-100"
            >
              Close
            </button>
          </div>
        </footer>
      </div>
    </ModalShell>
  );
}

function RequestConfirmationModal({ onClose, onTrack, request }) {
  const totalQuantity = getRequestTotalQuantity(request);

  return (
    <ModalShell
      labelledBy="request-confirmation-modal-title"
      onClose={onClose}
      overlayClassName="bg-white/95 backdrop-blur-sm"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white text-center shadow-2xl">
        <div className="px-6 pb-6 pt-8">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircleIcon />
          </span>
          <h3 id="request-confirmation-modal-title" className="mt-4 text-lg font-black text-black">
            Request Submitted
          </h3>
          <p className="mt-1 text-sm font-black text-emerald-700">
            {getRequestNumber(request.id)}
          </p>
          <p className="mt-1 text-xs font-semibold text-neutral-500">
            {request.items?.length || 0} item{request.items?.length === 1 ? "" : "s"} Â·{" "}
            {totalQuantity.toLocaleString()} units requested
          </p>
          <p className="mx-auto mt-3 max-w-sm text-xs font-medium leading-5 text-neutral-500">
            Your request is now under CHO review. You can track its status anytime from the
            request history.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-neutral-50 px-5 text-sm font-black text-neutral-700 hover:bg-neutral-100"
          >
            Done
          </button>
          <button
            type="button"
            onClick={onTrack}
            className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-black text-white hover:bg-emerald-700"
          >
            Track Request
          </button>
        </div>
      </div>
    </ModalShell>
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
  choAvailabilityMap,
  error,
  facilityId,
  isMedicinesLoading,
  isSaving,
  lowStockItems,
  medicines,
  medicinesError,
  onClose,
  onRetryMedicines,
  onSubmit,
  pendingRequestsByMedicine,
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

  const handleFormKeyDown = (event) => {
    if (event.key === "Enter" && !["TEXTAREA", "SELECT", "BUTTON"].includes(event.target.tagName)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  };

  const availabilityError = validateChoRequestAvailability(
    requestItems.filter((item) => item.medicine_id && Number(item.quantity) > 0),
    choAvailabilityMap
  );

  return (
    <ModalShell
      labelledBy="new-request-modal-title"
      onClose={onClose}
      overlayClassName="bg-white/95 backdrop-blur-sm"
    >
      <form
        onSubmit={onSubmit}
        onKeyDown={handleFormKeyDown}
        className="w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <div>
            <h3 id="new-request-modal-title" className="text-lg font-black text-black">
              New Supply Request
            </h3>
            <p className="mt-1 text-xs font-semibold text-neutral-500">
              Choose medicines from CHO stock, enter the quantity needed, then submit for review.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"
            aria-label="Close request form"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="prds-modal-scrollbar max-h-[72vh] overflow-y-auto p-5">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              {error}
            </p>
          )}
          <ChoAvailabilitySummary
            error={medicinesError}
            isLoading={isMedicinesLoading}
            medicines={medicines}
            onRetry={onRetryMedicines}
          />
          <section>
            <div className="flex items-center justify-between gap-3">
              <SectionTitle icon={<ClipboardIcon />} title="Medicines to Request" />
              {lowStockItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRequestItems(lowStockItems.map((item) => ({ ...item })))}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 text-[11px] font-black text-orange-700 transition hover:bg-orange-100"
                  title="Add the medicines currently at or below their threshold"
                >
                  <AlertIcon />
                  Add low-stock items ({lowStockItems.length})
                </button>
              )}
            </div>
            <div className="mt-3 grid gap-4">
              {requestItems.map((item, index) => (
                <RequestItemFields
                  key={`request-item-${index}`}
                  canRemove={requestItems.length > 1}
                  choAvailabilityMap={choAvailabilityMap}
                  facilityId={facilityId}
                  isMedicinesLoading={isMedicinesLoading}
                  item={item}
                  medicines={medicines}
                  onRemove={() =>
                    setRequestItems((currentItems) =>
                      currentItems.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                  pendingRequestsByMedicine={pendingRequestsByMedicine}
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
            <SectionTitle icon={<TruckIcon />} title="Notes" />
            <label className="mt-3 grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-500">
              Reason or handling notes
              <textarea
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                rows="4"
                placeholder="Example: Current stock is low and needed for monthly medicine release."
                className="resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium normal-case tracking-normal text-neutral-700 outline-none placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </section>
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
            disabled={
              isSaving ||
              isMedicinesLoading ||
              medicines.length === 0 ||
              Boolean(availabilityError)
            }
            className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {isSaving ? "Submitting..." : "Submit Supply Request"}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}

function ChoAvailabilitySummary({ error, isLoading, medicines, onRetry }) {
  const totals = medicines.reduce(
    (summary, medicine) => ({
      available: summary.available + Number(medicine.available_quantity || 0),
      onHand: summary.onHand + Number(medicine.physical_quantity || 0),
      requested: summary.requested + Number(medicine.reserved_quantity || 0),
    }),
    { available: 0, onHand: 0, requested: 0 }
  );

  return (
    <section className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitle icon={<BoxIcon />} title="CHO Stock Availability" />
          <p className="mt-1 text-xs font-semibold leading-5 text-neutral-500">
            Live requestable stock from the Central Health Office.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <StockMetric
            label="Medicines"
            value={isLoading || error ? "–" : medicines.length.toLocaleString()}
          />
          <StockMetric
            label="Can request"
            value={isLoading || error ? "–" : totals.available.toLocaleString()}
          />
          <StockMetric
            label="Already requested"
            value={isLoading || error ? "–" : totals.requested.toLocaleString()}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="min-w-0 animate-pulse rounded-lg border border-white bg-white px-3 py-2 shadow-sm"
              aria-hidden="true"
            >
              <div className="h-3 w-3/4 rounded bg-neutral-200" />
              <div className="mt-2 h-3 w-1/2 rounded bg-neutral-200" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3">
          <p className="min-w-0 text-xs font-bold leading-5 text-red-700">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 text-[11px] font-black text-red-700 transition hover:bg-red-50"
          >
            <UiRefreshIcon />
            Retry
          </button>
        </div>
      ) : medicines.length > 0 ? null : (
        <div className="mt-3 rounded-lg border border-dashed border-neutral-200 bg-white px-3 py-3">
          <p className="text-xs font-bold text-neutral-700">
            No unexpired CHO stock is currently requestable.
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-neutral-500">
            CHO stock may be expired or depleted, so the requestable list is empty. Ask the CHO to
            replenish stock, then refresh to load the updated availability.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-[11px] font-black text-neutral-700 transition hover:bg-neutral-50"
          >
            <UiRefreshIcon />
            Refresh stock
          </button>
        </div>
      )}
    </section>
  );
}

function StockMetric({ label, value }) {
  return (
    <div className="min-w-24 rounded-lg bg-white px-3 py-2 shadow-sm">
      <p className="text-sm font-black text-neutral-950">{value}</p>
      <p className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-neutral-500">
        {label}
      </p>
    </div>
  );
}

function RequestItemFields({
  canRemove,
  choAvailabilityMap,
  facilityId,
  isMedicinesLoading,
  item,
  medicines,
  onRemove,
  pendingRequestsByMedicine,
  stockMap,
  updateItem,
}) {
  const stock = stockMap.get(`${facilityId}:${item.medicine_id}`);
  const stockStatus = item.medicine_id
    ? getItemStockStatus(item, facilityId, stockMap)
    : { label: "Select a medicine", tone: "text-neutral-500" };
  const threshold = Number(stock?.threshold || 0);
  const quantity = Number(stock?.quantity || 0);
  const pendingEntries = item.medicine_id
    ? pendingRequestsByMedicine.get(item.medicine_id) || []
    : [];
  const requestedQuantity = Number(item.quantity || 0);
  const choAvailability = item.medicine_id
    ? choAvailabilityMap.get(item.medicine_id)
    : null;
  const availableQuantity = choAvailability?.availableQuantity ?? null;
  const choExceedsRequest =
    availableQuantity !== null && requestedQuantity > availableQuantity;
  const choProgressValue = choAvailability?.physicalQuantity
    ? Math.min((availableQuantity / choAvailability.physicalQuantity) * 100, 100)
    : 0;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="grid gap-2">
          <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-500">
            Medicine
            <select
              required
              disabled={isMedicinesLoading}
              value={item.medicine_id}
              onChange={(event) => updateItem("medicine_id", event.target.value)}
              className="h-11 min-w-0 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-neutral-100"
            >
              <option value="">
                {isMedicinesLoading
                  ? "Loading CHO stock..."
                  : "Choose a medicine from CHO stock"}
              </option>
              {medicines.map((medicine) => (
                <option key={medicine.id} value={medicine.id}>
                  {getMedicineFullLabel(medicine)}
                </option>
              ))}
            </select>
          </label>
          {pendingEntries.length > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold normal-case tracking-normal text-amber-700">
              Already on a pending request: {pendingEntries.join(", ")}. Submitting again may
              delay approval.
            </p>
          )}
          {item.medicine_id && stock && (
            <p className="text-[11px] font-semibold normal-case tracking-normal text-neutral-500">
              Your facility has {quantity.toLocaleString()} units on hand. Status: {stockStatus.label}. Threshold: {threshold.toLocaleString()}.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">
            CHO Stock Available
          </span>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200"
            role="progressbar"
            aria-label={
              availableQuantity !== null && choAvailability
                ? `Can request ${availableQuantity.toLocaleString()} of ${choAvailability.physicalQuantity.toLocaleString()} units`
                : "CHO stock availability"
            }
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={choProgressValue}
          >
            <div
              className={`h-full rounded-full ${
                choExceedsRequest ? "bg-red-500" : "bg-emerald-500"
              }`}
              aria-hidden="true"
              style={{ width: `${choProgressValue}%` }}
            />
          </div>
          {choAvailability ? (
            <div className="mt-3 grid gap-2 text-[10px] font-bold text-neutral-500 sm:grid-cols-3">
              <span className="rounded-lg bg-white px-2 py-1">On hand {choAvailability.physicalQuantity.toLocaleString()}</span>
              <span className="rounded-lg bg-white px-2 py-1">Already requested {choAvailability.reservedQuantity.toLocaleString()}</span>
              <span className="rounded-lg bg-white px-2 py-1 text-emerald-700">Can request {availableQuantity.toLocaleString()}</span>
            </div>
          ) : (
            <p className="mt-2 text-[11px] font-semibold text-neutral-500">
              Choose a medicine to see how much CHO can still release.
            </p>
          )}
          {choExceedsRequest && (
            <p className="mt-2 text-[11px] font-bold text-red-600">
              Reduce the quantity before submitting this request.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
        <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-500">
          Quantity needed
          <input
            required
            min="1"
            max={availableQuantity ?? undefined}
            type="number"
            value={item.quantity}
            onChange={(event) => updateItem("quantity", event.target.value)}
            placeholder="0"
            className="h-11 w-28 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <span className="text-[11px] font-semibold normal-case tracking-normal text-neutral-500">
            Enter a whole number. It cannot be more than the CHO stock available.
          </span>
        </label>

        <div className="flex flex-col items-end justify-between gap-2">
          {threshold > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-wide text-neutral-400">
                Quick fill
              </span>
              {[1, 2, 3].map((multiplier) => {
                const suggested = Math.max(Math.ceil(threshold * multiplier), 1);

                return (
                  <button
                    key={multiplier}
                    type="button"
                    onClick={() => updateItem("quantity", String(suggested))}
                    title={`Suggest ${suggested.toLocaleString()} units`}
                    className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-700 transition hover:bg-blue-100"
                  >
                    {suggested.toLocaleString()}
                  </button>
                );
              })}
            </div>
          )}

          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50"
            >
              Remove
            </button>
          )}
        </div>
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

const AlertIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 4.3 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z" />
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

const CheckCircleIcon = () => (
  <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <path d="m8.5 12 2.5 2.5 5-5" />
  </svg>
);

const InboxIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1Z" />
  </svg>
);


const CloseIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);
const ClockIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);





