import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Package,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import AdminShell from "../../components/layout/AdminShell";
import ModalShell from "../../components/ModalShell";
import NotificationModal from "../../components/NotificationModal";
import PaginationControls from "../../components/PaginationControls";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import { formatDateTime } from "@shared/utils/dashboardUtils";
import { downloadExportFile } from "../../services/downloadManager";
import {
  confirmRequestReceived,
  createBhwMedicineRequest,
  getBhwRequestsData,
  getChoInventoryMedicines,
} from "@backend/services/requestsService";
import {
  buildRequestsCsv,
  formatRequestDate,
  getChoAvailabilityMap,
  getDuplicateRequestMedicineIds,
  getItemStockStatus,
  getLowStockRequestItems,
  getMedicineFullLabel,
  getRelativeTime,
  getRequestNumber,
  getRequestTotalQuantity,
  getRequestTrackingSteps,
  getStockMap,
  matchesRequestFilters,
  normalizeRequestErrorMessage,
  requestStatusLabels,
  sortRequests,
  validateChoRequestAvailability,
} from "@shared/utils/requestUtils";
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
  const [notice, setNotice] = useState("");
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
  const medicinesMap = useMemo(
    () => new Map((medicines || []).map((med) => [med.id, med])),
    [medicines]
  );

  const filteredRequests = useMemo(() => {
    const matchedRequests = requests.filter(
      (request) =>
        historyRequestStatuses.includes(request.status) &&
        matchesRequestFilters(request, { keyword })
    );

    return sortRequests(matchedRequests, sortMode);
  }, [keyword, requests, sortMode]);
  const {
    currentPage,
    paginatedRows: paginatedRequests,
    pageSize,
    setCurrentPage,
    totalCount,
    totalPages,
  } = usePaginatedRows(filteredRequests);

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

  const location = useLocation();

  useEffect(() => {
    if (location.state?.openNewRequest) {
      setIsModalOpen(true);
      loadMedicines();
      if (location.state.prefillMedicineId) {
        setRequestItems([
          {
            ...emptyItem,
            medicine_id: location.state.prefillMedicineId,
            quantity_requested: String(location.state.prefillQuantity || ""),
          },
        ]);
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state, loadMedicines]);

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
      const result = await createBhwMedicineRequest({
        items: validItems,
        remarks,
      });
      setIsModalOpen(false);
      resetForm();
      if (result?.queued) {
        setNotice("Request queued offline. It will be submitted when connection returns; stock is not reserved yet.");
        setConfirmedRequestId(null);
      } else {
        setConfirmedRequestId(result);
        await loadRequests();
      }
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
      setNotice(`Requisition ${getRequestNumber(trackedRequest.id)} has been marked as completed successfully.`);
    } catch (receiptError) {
      setError(normalizeRequestErrorMessage(receiptError.message));
    } finally {
      setIsReceiving(false);
    }
  };

  const exportExcel = () => {
    const csv = buildRequestsCsv(filteredRequests);
    downloadExportFile({
      filename: `bhw-requests-${new Date().toISOString().slice(0, 10)}`,
      csv,
      recordCount: filteredRequests.length,
    });
  };

  const confirmedRequest = confirmedRequestId
    ? requests.find((request) => request.id === confirmedRequestId) || null
    : null;

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <div className="space-y-4 pb-12">
        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        <NotificationModal
          notice={notice}
          onClose={() => setNotice("")}
          autoCloseMs={8000}
        />

        <section className="rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black leading-tight text-[#0d1117]">Medicine Request</h2>
              <p className="mt-0.5 text-xs font-semibold text-neutral-500">
                Submit and track medical supply requests for{" "}
                {profile?.facility?.facility_name || "your assigned facility"}.
              </p>
            </div>

            <ActionButton onClick={openNewRequestModal} tone="dark">
              <UiPlusIcon />
              New Request
            </ActionButton>
          </div>
        </section>

        <OngoingRequestsPanel
          onOpenList={() => setIsOngoingModalOpen(true)}
          onTrackRequest={setTrackedRequest}
          requests={ongoingRequests}
        />

        <RequestPanel>
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
                onClick={exportExcel}
                disabled={filteredRequests.length === 0}
                tone="soft"
              >
                <UiDownloadIcon />
                Export Excel
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
            <thead className="border-b border-slate-200/80 bg-white">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Date & Time</th>
                <th className="px-4 py-3">Request ID</th>
                <th className="px-4 py-3">Items Requested</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr>
                  <td colSpan="5" className="px-4 py-14 text-center text-sm font-bold text-neutral-500">
                    Loading request history...
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan="5">
                    <RequestsEmptyState
                      hasAnyRequests={requests.length > 0}
                      onClearFilters={clearFilters}
                    />
                  </td>
                </tr>
              ) : (
                paginatedRequests.map((request) => (
                  <BhwRequestRow
                    key={request.id}
                    medicinesMap={medicinesMap}
                    onTrackRequest={() => setTrackedRequest(request)}
                    request={request}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && totalCount > 0 && (
          <PaginationControls
            currentPage={currentPage}
            itemLabel="requests"
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
          />
        )}
      </RequestPanel>
    </div>

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
          medicinesMap={medicinesMap}
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
    <RequestPanel>
      <RequestPanelHeader
        eyebrow="Active Request Tracking"
        title="Ongoing Requests"
        subtitle="Pending and approved requests awaiting CHO action or facility pickup."
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
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRequests.map((request) => (
            <button
              key={request.id}
              type="button"
              onClick={() => onTrackRequest(request)}
              className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/20 hover:shadow-xs"
            >
              <div>
                <p className="text-xs font-black text-blue-600 group-hover:text-emerald-700 transition-colors">
                  {getRequestNumber(request.id)}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-neutral-400">
                  Submitted {getRelativeTime(request.request_date)}
                </p>
              </div>
              <RequestStatusBadge status={request.status} />
            </button>
          ))}
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

function BhwRequestRow({ medicinesMap, onTrackRequest, request }) {
  const totalQuantity = getRequestTotalQuantity(request);
  const items = request.items || [];
  const firstItem = items[0];
  const moreCount = items.length - 1;

  const resolvedFirstMed = medicinesMap?.get(firstItem?.medicine_id);
  const firstGenericName =
    firstItem?.medicine?.generic_name ||
    resolvedFirstMed?.generic_name ||
    "Unknown medicine";
  const firstBrandName =
    firstItem?.medicine?.brand_name ||
    resolvedFirstMed?.brand_name ||
    null;

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
          <p className="text-sm font-black text-neutral-400">No items</p>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-black text-neutral-900 group-hover:text-emerald-700 transition-colors">
                {firstGenericName}
              </span>
              <span className="text-xs font-bold text-neutral-500">
                ({firstBrandName || "Generic"})
              </span>
              {moreCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-black text-neutral-600 group-hover:bg-emerald-100 group-hover:text-emerald-800 transition-colors">
                  +{moreCount} more
                </span>
              )}
            </div>
            <p className="mt-1 text-xs font-medium text-neutral-400">
              {items.length} {items.length === 1 ? "medicine" : "medicines"} requested
            </p>
          </div>
        )}
      </td>
      <td className="px-4 py-4 text-xs font-black text-neutral-600">
        {totalQuantity.toLocaleString()} units
      </td>
      <td className="px-4 py-4">
        <RequestStatusBadge status={request.status} />
      </td>
    </tr>
  );
}

function OngoingRequestsModal({ onClose, onOpenRequest, requests }) {
  return (
    <ModalShell
      labelledBy="ongoing-requests-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <div>
            <h3 id="ongoing-requests-title" className="text-base font-black text-black">
              Ongoing Requests
            </h3>
            <p className="mt-1 text-xs font-semibold text-neutral-500">
              Requests awaiting CHO review, release, or facility pickup.
            </p>
          </div>
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
              {requests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => onOpenRequest(request)}
                  className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3.5 text-left transition hover:border-blue-300 hover:bg-blue-50/50"
                >
                  <div>
                    <span className="text-sm font-black text-neutral-900 group-hover:text-blue-700 transition-colors">
                      {getRequestNumber(request.id)}
                    </span>
                    <p className="mt-0.5 text-[11px] font-semibold text-neutral-400">
                      Submitted {getRelativeTime(request.request_date)}
                    </p>
                  </div>
                  <RequestStatusBadge status={request.status} />
                </button>
              ))}
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

function RequestTrackingModal({
  isReceiving,
  medicinesMap = new Map(),
  onClose,
  onConfirmReceipt,
  request,
  stockMap,
}) {
  const [awaitingReceipt, setAwaitingReceipt] = useState(false);
  const items = request.items || [];
  const steps = getRequestTrackingSteps(request);
  const approverName = request.approver
    ? `${request.approver.first_name || ""} ${request.approver.last_name || ""}`.trim()
    : "CHO staff";
  const receiverName = request.receiver
    ? `${request.receiver.first_name || ""} ${request.receiver.last_name || ""}`.trim()
    : "facility staff";
  const totalQuantity = getRequestTotalQuantity(request);
  const isApprovedOrCompleted = request.status === "APPROVED" || request.status === "COMPLETED";
  const hasFulfillmentData = (request.fulfillments || []).length > 0;

  const totalReleasedQuantity = useMemo(() => {
    if (!isApprovedOrCompleted) return 0;
    if (hasFulfillmentData) {
      return (request.fulfillments || []).reduce((sum, f) => sum + Number(f.quantity || 0), 0);
    }
    return totalQuantity;
  }, [isApprovedOrCompleted, hasFulfillmentData, request.fulfillments, totalQuantity]);

  return (
    <ModalShell
      labelledBy="request-tracking-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-neutral-100">
        <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 bg-neutral-50/40">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Package className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="request-tracking-modal-title" className="text-base font-black text-neutral-900 tracking-tight">
                  {getRequestNumber(request.id)}
                </h3>
                <RequestStatusBadge status={request.status} />
              </div>
              <p className="mt-0.5 text-xs font-semibold text-neutral-500">
                {request.facility?.facility_name || "Facility"} · Submitted {getRelativeTime(request.request_date)}
              </p>
            </div>
          </div>
        </header>

        <div className="prds-modal-scrollbar max-h-[75vh] overflow-y-auto p-5 space-y-4">
          {/* Fulfillment Stepper */}
          <section className="rounded-xl border border-neutral-200/70 bg-neutral-50/50 p-3.5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                Fulfillment Progress
              </span>
              <span className="text-[11px] font-bold text-neutral-400">
                Step {Math.min(steps.filter((s) => s.state === "complete").length + 1, 4)} of 4
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
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

          {/* KPI Summary Cards */}
          <section className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-neutral-200/80 bg-white p-3 shadow-2xs">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                Total Requested
              </p>
              <p className="mt-1 text-lg font-black text-neutral-900">
                {totalQuantity.toLocaleString()}{" "}
                <span className="text-xs font-bold text-neutral-500">units</span>
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-neutral-500">
                {isApprovedOrCompleted
                  ? `${totalReleasedQuantity.toLocaleString()} units released (${items.length} items)`
                  : `${items.length} medicine item${items.length === 1 ? "" : "s"}`}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200/80 bg-blue-50/40 p-3 shadow-2xs">
              <p className="text-[10px] font-black uppercase tracking-wider text-blue-600">
                Review Stage
              </p>
              <p className="mt-1 text-base font-black text-blue-950 truncate">
                {request.status === "APPROVED"
                  ? "Ready to Pickup"
                  : requestStatusLabels[request.status] || request.status}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-blue-700/80 truncate">
                {request.status === "COMPLETED"
                  ? `Completed (${receiverName})`
                  : request.approved_at
                    ? `Approved & Released by ${approverName}`
                    : "Awaiting CHO Review"}
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200/80 bg-white p-3 shadow-2xs">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                Destination
              </p>
              <p className="mt-1 text-base font-black text-neutral-900 truncate">
                {request.facility?.facility_code || "BHC"}
              </p>
              <p
                className="mt-0.5 text-[11px] font-medium text-neutral-500 truncate"
                title={request.facility?.facility_name}
              >
                {request.facility?.facility_name || "Health Center"}
              </p>
            </div>
          </section>

          {/* Contextual Status Banner */}
          {request.status === "APPROVED" && (
            <div className="flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
              <Building2 className="h-4 w-4 text-blue-700 shrink-0" />
              <span>
                <strong>Ready to Pickup.</strong> The City Health Office has approved &amp; released this request. Supplies are ready for collection. Click <strong>Completed</strong> once you have received the medicines.
              </span>
            </div>
          )}

          {request.status === "COMPLETED" && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
              <Check className="h-4 w-4 text-emerald-700 shrink-0" />
              <span>
                <strong>Completed &amp; Received into Facility Inventory.</strong> Confirmed {request.received_at ? `on ${formatRequestDate(request.received_at)}` : ""} by {receiverName}.
              </span>
            </div>
          )}

          {request.status === "REJECTED" && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs text-red-900">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <span>
                <strong>Request Rejected by CHO.</strong> Contact CHO pharmacy administrator for guidance.
              </span>
            </div>
          )}

          {request.status === "PENDING" && (
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200/80 bg-neutral-50/60 px-3 py-2 text-xs text-neutral-600">
              <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span>Awaiting CHO review. Central office will review, allocate available quantities, and release for pickup.</span>
            </div>
          )}

          {/* CHO Remarks Banner (shown whenever remarks are present) */}
          {request.remarks && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
              <FileText className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
              <div>
                <span className="font-black text-amber-800 uppercase tracking-wider text-[10px]">
                  CHO Remarks &amp; Handling Notes
                </span>
                <p className="mt-0.5 font-medium leading-relaxed">{request.remarks}</p>
              </div>
            </div>
          )}

          {/* Requested Items Section */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <SectionTitle icon={<ClipboardIcon />} title="Requested Medicines" />
              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-neutral-600">
                {items.length} item{items.length === 1 ? "" : "s"} · {totalQuantity.toLocaleString()} units total
              </span>
            </div>

            {items.length === 0 ? (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center text-xs font-semibold text-neutral-500">
                No medicine items recorded for this request.
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, idx) => {
                  const resolvedMed = medicinesMap?.get(item.medicine_id);
                  const genericName =
                    item.medicine?.generic_name ||
                    resolvedMed?.generic_name ||
                    "Unknown Generic Name";
                  const brandName =
                    item.medicine?.brand_name ||
                    resolvedMed?.brand_name ||
                    null;
                  const dosage = item.medicine?.dosage || resolvedMed?.dosage;
                  const unit =
                    item.medicine?.unit_of_measure ||
                    resolvedMed?.unit_of_measure ||
                    "unit";
                  const quantity = Number(item.quantity || 0);

                  const stock = stockMap?.get(`${request.facility_id}:${item.medicine_id}`);
                  const onHand = Number(stock?.quantity || 0);
                  const threshold = Number(stock?.threshold || 0);
                  const hasStockData = Boolean(stockMap && stockMap.size > 0);

                  const itemFulfillments = (request.fulfillments || []).filter(
                    (f) => f.request_item_id === item.id
                  );
                  const releasedQuantity = isApprovedOrCompleted
                    ? hasFulfillmentData
                      ? itemFulfillments.reduce((sum, f) => sum + Number(f.quantity || 0), 0)
                      : quantity
                    : 0;

                  return (
                    <article
                      key={item.id || idx}
                      className="rounded-xl border border-neutral-200/90 bg-white p-3.5 shadow-2xs hover:border-emerald-200 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[11px] font-black text-neutral-500">
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-1.5">
                              <h5 className="text-sm font-black text-neutral-900 leading-snug">
                                {genericName}
                              </h5>
                              <span className="text-xs font-bold text-neutral-500">
                                ({brandName || "Generic"})
                              </span>
                            </div>

                            {/* Standardized Badges: Dosage, Unit */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {dosage && (
                                <span className="inline-flex items-center rounded-md bg-blue-50 border border-blue-200/70 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                                  Dosage: {dosage}
                                </span>
                              )}

                              <span className="inline-flex items-center rounded-md bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                Unit: {unit}
                              </span>
                            </div>

                            {/* Station Stock Status */}
                            {hasStockData && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className="text-neutral-400 font-medium">Station on-hand:</span>
                                <span className="font-bold text-neutral-800">
                                  {onHand.toLocaleString()} {unit}
                                </span>
                                {threshold > 0 && (
                                  <span className="text-neutral-400">
                                    (safety min: {threshold.toLocaleString()})
                                  </span>
                                )}
                                {onHand === 0 ? (
                                  <span className="rounded bg-red-100 px-1.5 py-0.2 text-[10px] font-black text-red-700">
                                    Out of Stock
                                  </span>
                                ) : onHand <= threshold ? (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-black text-amber-800">
                                    Low Stock
                                  </span>
                                ) : (
                                  <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-black text-emerald-800">
                                    In Stock
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Quantity Pill(s): Requested & Released */}
                        <div className="flex flex-col items-end justify-center shrink-0 pl-3.5 border-l border-neutral-100 text-right">
                          <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                            Requested
                          </span>
                          <div className="mt-0.5 flex items-baseline gap-1">
                            <span className="text-sm font-bold text-neutral-700">
                              {quantity.toLocaleString()}
                            </span>
                            <span className="text-xs font-semibold text-neutral-500">
                              {unit}
                            </span>
                          </div>

                          {isApprovedOrCompleted && (
                            <div className="mt-2 flex flex-col items-end border-t border-neutral-100 pt-1.5">
                              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                Released
                              </span>
                              <div className="mt-0.5 flex items-baseline gap-1">
                                <span
                                  className={`text-base font-black ${
                                    releasedQuantity === 0 ? "text-red-600" : "text-emerald-700"
                                  }`}
                                >
                                  {releasedQuantity.toLocaleString()}
                                </span>
                                <span className="text-xs font-bold text-neutral-500">
                                  {unit}
                                </span>
                              </div>
                              {releasedQuantity === 0 ? (
                                <span className="mt-1 inline-flex items-center rounded bg-red-100 border border-red-200 px-1.5 py-0.5 text-[9px] font-black text-red-700">
                                  0 Allocated (Out of Stock)
                                </span>
                              ) : releasedQuantity < quantity ? (
                                <span className="mt-1 inline-flex items-center rounded bg-amber-100 border border-amber-200 px-1.5 py-0.5 text-[9px] font-black text-amber-800">
                                  Partial ({releasedQuantity}/{quantity})
                                </span>
                              ) : (
                                <span className="mt-1 inline-flex items-center rounded bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-black text-emerald-800">
                                  Full Release
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Request Information Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-xl border border-neutral-200/70 bg-neutral-50/50 p-2.5 text-xs">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 block">
                Requesting Facility
              </span>
              <span className="font-bold text-neutral-800 block truncate" title={request.facility?.facility_name}>
                {request.facility?.facility_name || "No facility"}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 block">
                Date Submitted
              </span>
              <span className="font-bold text-neutral-800 block">
                {formatRequestDate(request.request_date)}
              </span>
            </div>
            {request.status === "COMPLETED" && request.received_at ? (
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 block">
                  Completed On
                </span>
                <span className="font-bold text-emerald-800 block truncate">
                  {formatRequestDate(request.received_at)} by {receiverName}
                </span>
              </div>
            ) : (
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 block">
                  Requisition ID
                </span>
                <span className="font-bold text-neutral-800 block">
                  {getRequestNumber(request.id)}
                </span>
              </div>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3.5 bg-neutral-50/40">
          <p className="text-xs font-semibold text-neutral-500">
            {request.status === "COMPLETED"
              ? "Request completed and received into facility inventory."
              : request.status === "APPROVED"
                ? awaitingReceipt
                  ? "Mark this request as completed and receive supplies into facility inventory?"
                  : "Supplies are ready for pickup. Click Completed once received."
                : request.status === "REJECTED"
                  ? "This request was rejected by CHO."
                  : "This request is pending CHO review and allocation."}
          </p>
          <div className="flex items-center gap-2">
            {request.status === "APPROVED" &&
              (awaitingReceipt ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAwaitingReceipt(false)}
                    disabled={isReceiving}
                    className="h-8.5 rounded-lg bg-neutral-100 px-3.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200 transition disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onConfirmReceipt}
                    disabled={isReceiving}
                    className="h-8.5 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 transition disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    {isReceiving ? "Completing..." : "Confirm Completed"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setAwaitingReceipt(true)}
                  className="h-8.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700 transition cursor-pointer"
                >
                  Completed
                </button>
              ))}
            <button
              type="button"
              onClick={onClose}
              className="h-8.5 rounded-lg bg-neutral-100 px-4 text-xs font-bold text-neutral-700 hover:bg-neutral-200 transition cursor-pointer"
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
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
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
      <span className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full ${dotClass} ${isCurrent ? "ring-4 ring-blue-100" : ""}`}>
        <CheckIcon />
      </span>
      <p className={`mt-2 text-[11px] font-black ${isComplete || isCurrent ? "text-neutral-800" : "text-neutral-400"}`}>{label}</p>
      <p className={`text-[10px] font-semibold ${isComplete || isCurrent ? "text-neutral-500" : "text-neutral-400"}`}>{detail}</p>
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

function MedicineSearchDropdown({
  choAvailabilityMap,
  disabled = false,
  facilityId,
  medicines = [],
  onChange,
  otherSelectedMap = new Map(),
  pendingRequestsByMedicine,
  placeholder = "Search or select a medicine from CHO stock...",
  stockMap,
  value,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const selectedMedicine = useMemo(
    () => medicines.find((m) => m.id === value) || null,
    [medicines, value]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const filteredMedicines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return medicines;

    return medicines.filter((m) => {
      const generic = (m.generic_name || "").toLowerCase();
      const brand = (m.brand_name || "").toLowerCase();
      const dosage = (m.dosage || "").toLowerCase();
      const unit = (m.unit_of_measure || "").toLowerCase();
      return (
        generic.includes(q) ||
        brand.includes(q) ||
        dosage.includes(q) ||
        unit.includes(q)
      );
    });
  }, [medicines, searchQuery]);

  const selectedChoAvail = selectedMedicine
    ? choAvailabilityMap?.get(selectedMedicine.id)
    : null;
  const selectedAvailQty = selectedChoAvail?.availableQuantity ?? 0;

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setSearchQuery("");
      e.preventDefault();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const firstValid = filteredMedicines.find((m) => !otherSelectedMap?.has(m.id));
      if (firstValid) {
        onChange(firstValid.id);
        setIsOpen(false);
        setSearchQuery("");
      }
    } else if (e.key === "ArrowDown" && !isOpen) {
      setIsOpen(true);
      e.preventDefault();
    }
  };

  return (
    <div ref={dropdownRef} className="relative w-full">
      {!selectedMedicine || isOpen ? (
        <div
          className={`relative flex h-10 w-full items-center rounded-lg border bg-white px-3 shadow-2xs transition ${
            isOpen
              ? "border-emerald-500 ring-2 ring-emerald-100"
              : "border-neutral-300 hover:border-neutral-400"
          } ${disabled ? "cursor-not-allowed bg-neutral-100 opacity-70" : ""}`}
        >
          <Search
            className={`mr-2 h-3.5 w-3.5 shrink-0 transition-colors ${
              isOpen ? "text-emerald-600" : "text-neutral-400"
            }`}
          />
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            value={searchQuery}
            onFocus={() => {
              if (!disabled) setIsOpen(true);
            }}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedMedicine
                ? `Change: ${selectedMedicine.generic_name}...`
                : disabled
                ? "Loading CHO stock..."
                : placeholder
            }
            className="h-full w-full bg-transparent text-xs font-bold text-neutral-900 outline-none placeholder:text-neutral-400 placeholder:font-normal"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                inputRef.current?.focus();
              }}
              className="mr-1 rounded p-0.5 text-neutral-400 hover:text-neutral-600"
              title="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (isOpen) {
                setIsOpen(false);
                setSearchQuery("");
              } else {
                setIsOpen(true);
                inputRef.current?.focus();
              }
            }}
            className="rounded p-0.5 text-neutral-400 hover:text-neutral-600"
            title={isOpen ? "Close dropdown" : "Open medicines list"}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (disabled) return;
            setIsOpen(true);
            setSearchQuery("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
              e.preventDefault();
              if (!disabled) {
                setIsOpen(true);
                setSearchQuery("");
              }
            }
          }}
          className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-neutral-300 bg-white px-3 text-left transition shadow-2xs hover:border-neutral-400 cursor-pointer ${
            disabled ? "cursor-not-allowed bg-neutral-100 opacity-70" : ""
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 leading-tight">
                <span className="truncate text-xs font-bold text-neutral-900">
                  {selectedMedicine.generic_name}
                </span>
                {selectedMedicine.brand_name && (
                  <span className="truncate rounded bg-neutral-100 px-1.5 py-0.2 text-[10px] font-bold text-neutral-600">
                    {selectedMedicine.brand_name}
                  </span>
                )}
              </div>
              <p className="truncate text-[10px] font-semibold text-neutral-500 leading-tight">
                {selectedMedicine.dosage || "No dosage"}
                {selectedMedicine.unit_of_measure ? ` · ${selectedMedicine.unit_of_measure}` : ""}
              </p>
            </div>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                selectedAvailQty > 0
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {selectedAvailQty.toLocaleString()} in CHO
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
                setSearchQuery("");
                setIsOpen(true);
              }}
              className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition"
              title="Clear selection"
            >
              <X className="h-3 w-3" />
            </button>
            <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
          </div>
        </div>
      )}

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            <span>Available Medicines ({filteredMedicines.length})</span>
            <span>CHO Available Stock</span>
          </div>

          <div className="prds-modal-scrollbar max-h-52 overflow-y-auto divide-y divide-neutral-100">
            {filteredMedicines.length === 0 ? (
              <div className="p-3 text-center text-xs font-semibold text-neutral-500">
                No medicines match &ldquo;{searchQuery}&rdquo; in CHO inventory.
              </div>
            ) : (
              filteredMedicines.map((medicine) => {
                const choAvail = choAvailabilityMap?.get(medicine.id);
                const availQty = choAvail?.availableQuantity ?? 0;
                const stationStock = stockMap?.get(`${facilityId}:${medicine.id}`);
                const stationQty = Number(stationStock?.quantity || 0);
                const stationThreshold = Number(stationStock?.threshold || 0);
                const isStationLow =
                  stationThreshold > 0 && stationQty <= stationThreshold;
                const pendingRequests = pendingRequestsByMedicine?.get(medicine.id) || [];
                const isSelected = medicine.id === value;
                const alreadyInItemNumber = otherSelectedMap?.get(medicine.id);
                const isAlreadyAdded = Boolean(alreadyInItemNumber);

                return (
                  <div
                    key={medicine.id}
                    onClick={() => {
                      if (isAlreadyAdded) return;
                      onChange(medicine.id);
                      setIsOpen(false);
                      setSearchQuery("");
                    }}
                    className={`flex items-center justify-between gap-3 px-3 py-2 transition-colors ${
                      isAlreadyAdded
                        ? "opacity-55 cursor-not-allowed bg-neutral-50/90 text-neutral-500"
                        : isSelected
                        ? "bg-emerald-50/90 text-emerald-950 font-bold cursor-pointer"
                        : "hover:bg-emerald-50/50 text-neutral-800 cursor-pointer"
                    }`}
                    title={isAlreadyAdded ? `Already added in Item #${alreadyInItemNumber}` : undefined}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`truncate text-xs font-bold ${isAlreadyAdded ? "text-neutral-600 line-through decoration-neutral-400" : "text-neutral-900"}`}>
                          {medicine.generic_name}
                        </span>
                        {medicine.brand_name && (
                          <span className="truncate rounded bg-neutral-100 px-1.5 py-0.2 text-[10px] font-bold text-neutral-600">
                            {medicine.brand_name}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-neutral-500">
                        {medicine.dosage || "No dosage"}{" "}
                        {medicine.unit_of_measure ? `· ${medicine.unit_of_measure}` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {isAlreadyAdded ? (
                        <span className="rounded bg-neutral-200/80 px-2 py-0.5 text-[10px] font-bold text-neutral-700">
                          Already in Item #{alreadyInItemNumber}
                        </span>
                      ) : (
                        <>
                          {pendingRequests.length > 0 && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                              Pending
                            </span>
                          )}
                          {isStationLow && (
                            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-800">
                              Station Low ({stationQty})
                            </span>
                          )}
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                              availQty > 0
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {availQty.toLocaleString()} in CHO
                          </span>
                          {isSelected && (
                            <Check className="ml-1 h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
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
    if (
      event.key === "Enter" &&
      !["TEXTAREA", "SELECT", "BUTTON", "INPUT"].includes(event.target.tagName)
    ) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  };

  const validItems = useMemo(
    () => requestItems.filter((item) => item.medicine_id && Number(item.quantity) > 0),
    [requestItems]
  );
  const validItemsCount = validItems.length;
  const totalUnitsRequested = useMemo(
    () => validItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [validItems]
  );

  const selectedMedicineCount = useMemo(
    () => requestItems.filter((item) => Boolean(item.medicine_id)).length,
    [requestItems]
  );
  const hasUnselectedItem = useMemo(
    () => requestItems.some((item) => !item.medicine_id),
    [requestItems]
  );
  const isAllMedicinesAdded =
    medicines.length > 0 && selectedMedicineCount >= medicines.length;
  const hasDuplicates = useMemo(
    () =>
      requestItems.some((item, index) => {
        if (!item.medicine_id) return false;
        return requestItems.some(
          (other, otherIdx) =>
            otherIdx !== index && other.medicine_id === item.medicine_id
        );
      }),
    [requestItems]
  );

  const availabilityError = validateChoRequestAvailability(
    validItems,
    choAvailabilityMap
  );

  return (
    <ModalShell
      labelledBy="new-request-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
    >
      <form
        onSubmit={onSubmit}
        onKeyDown={handleFormKeyDown}
        className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <header className="border-b border-neutral-100 px-4 py-3">
          <h3 id="new-request-modal-title" className="text-sm font-black text-neutral-900">
            New Supply Request
          </h3>
          <p className="text-[11px] font-medium text-neutral-500">
            Choose medicines from CHO stock, enter quantities needed, and submit for review.
          </p>
        </header>

        <div className="prds-modal-scrollbar max-h-[75vh] overflow-y-auto p-4 space-y-3">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">
              {error}
            </p>
          )}

          <ChoAvailabilitySummary
            error={medicinesError}
            isLoading={isMedicinesLoading}
            medicines={medicines}
            onRetry={onRetryMedicines}
          />

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <SectionTitle icon={<ClipboardIcon />} title="Medicines to Request" />
              {lowStockItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const uniqueLowStock = [];
                    const seenIds = new Set();
                    lowStockItems.forEach((item) => {
                      if (!seenIds.has(item.medicine_id)) {
                        seenIds.add(item.medicine_id);
                        uniqueLowStock.push({ ...item });
                      }
                    });
                    setRequestItems(uniqueLowStock);
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2.5 text-[11px] font-bold text-orange-700 transition hover:bg-orange-100"
                  title="Add the medicines currently at or below their threshold"
                >
                  <AlertIcon />
                  Add low-stock items ({lowStockItems.length})
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {requestItems.map((item, index) => {
                const otherSelectedMap = new Map();
                requestItems.forEach((reqItem, idx) => {
                  if (idx !== index && reqItem.medicine_id) {
                    otherSelectedMap.set(reqItem.medicine_id, idx + 1);
                  }
                });

                return (
                  <RequestItemFields
                    key={`request-item-${index}`}
                    canRemove={requestItems.length > 1}
                    choAvailabilityMap={choAvailabilityMap}
                    facilityId={facilityId}
                    isMedicinesLoading={isMedicinesLoading}
                    item={item}
                    itemIndex={index}
                    medicines={medicines}
                    onRemove={() =>
                      setRequestItems((currentItems) =>
                        currentItems.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }
                    otherSelectedMap={otherSelectedMap}
                    pendingRequestsByMedicine={pendingRequestsByMedicine}
                    stockMap={stockMap}
                    updateItem={(field, value) => updateItem(index, field, value)}
                  />
                );
              })}
            </div>

            <button
              type="button"
              disabled={hasUnselectedItem || isAllMedicinesAdded}
              onClick={() => setRequestItems((currentItems) => [...currentItems, { ...emptyItem }])}
              className={`inline-flex items-center gap-1.5 h-8 rounded-lg border border-dashed px-3 text-xs font-bold transition ${
                hasUnselectedItem || isAllMedicinesAdded
                  ? "border-neutral-200 text-neutral-400 bg-neutral-50 cursor-not-allowed"
                  : "border-emerald-300 text-emerald-700 hover:bg-emerald-50 cursor-pointer"
              }`}
              title={
                isAllMedicinesAdded
                  ? "All available CHO medicines have been added to this request"
                  : hasUnselectedItem
                  ? "Please choose a medicine for the existing item before adding another"
                  : "Add another medicine to request"
              }
            >
              <Plus className="h-3.5 w-3.5" />
              {isAllMedicinesAdded ? "All CHO medicines added" : "Add another medicine"}
            </button>
          </section>

          <section className="pt-2 border-t border-neutral-100">
            <label className="block text-xs font-bold text-neutral-500">
              <span className="block mb-1 text-[10px] uppercase tracking-wider font-black text-neutral-400">
                Reason or handling notes (optional)
              </span>
              <textarea
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                rows="2"
                placeholder="Example: Requisition for upcoming community immunization or monthly distribution..."
                className="w-full resize-none rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
            </label>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3 bg-neutral-50/50">
          <div>
            {validItemsCount > 0 ? (
              <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-700">
                <Package className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  Total:{" "}
                  <strong className="text-emerald-700">
                    {validItemsCount} item{validItemsCount === 1 ? "" : "s"}
                  </strong>{" "}
                  ·{" "}
                  <strong className="text-neutral-900">
                    {totalUnitsRequested.toLocaleString()} units
                  </strong>
                </span>
              </div>
            ) : (
              <span className="text-[11px] font-medium text-neutral-400">
                Choose a medicine and enter quantity needed
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8.5 rounded-lg bg-neutral-100 px-3.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isSaving ||
                isMedicinesLoading ||
                medicines.length === 0 ||
                validItemsCount === 0 ||
                hasDuplicates ||
                Boolean(availabilityError)
              }
              className="h-8.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {isSaving ? "Submitting..." : "Submit Supply Request"}
            </button>
          </div>
        </footer>
      </form>
    </ModalShell>
  );
}

function ChoAvailabilitySummary({ error, isLoading, medicines, onRetry }) {
  const totals = useMemo(() => {
    return medicines.reduce(
      (summary, medicine) => ({
        available: summary.available + Number(medicine.available_quantity || 0),
        onHand: summary.onHand + Number(medicine.physical_quantity || 0),
        requested: summary.requested + Number(medicine.reserved_quantity || 0),
      }),
      { available: 0, onHand: 0, requested: 0 }
    );
  }, [medicines]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2 animate-pulse">
        <div className="h-3.5 w-36 rounded bg-emerald-200/60" />
        <div className="flex gap-2">
          <div className="h-5 w-16 rounded bg-emerald-200/60" />
          <div className="h-5 w-20 rounded bg-emerald-200/60" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
        <div className="flex items-center gap-1.5 font-bold">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] font-bold text-red-700 hover:bg-red-50"
        >
          <UiRefreshIcon /> Retry
        </button>
      </div>
    );
  }

  if (medicines.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
        <div className="flex items-center gap-1.5 font-medium">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>No unexpired CHO stock is currently requestable.</span>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-bold text-amber-800 hover:bg-amber-50"
        >
          <UiRefreshIcon /> Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <Building2 className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
        <span className="text-xs font-black text-emerald-950">
          CHO Stock
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="rounded bg-white/90 border border-emerald-100 px-2 py-0.5 font-bold text-neutral-700">
          {medicines.length} Medicines
        </span>
        <span className="rounded bg-emerald-100 border border-emerald-200 px-2 py-0.5 font-black text-emerald-800">
          {totals.available.toLocaleString()} Units Available
        </span>
        {totals.requested > 0 && (
          <span className="rounded bg-white/90 border border-neutral-100 px-2 py-0.5 font-medium text-neutral-500">
            {totals.requested.toLocaleString()} In-Transit
          </span>
        )}
      </div>
    </div>
  );
}

function RequestItemFields({
  canRemove,
  choAvailabilityMap,
  facilityId,
  isMedicinesLoading,
  item,
  itemIndex,
  medicines,
  onRemove,
  otherSelectedMap = new Map(),
  pendingRequestsByMedicine,
  stockMap,
  updateItem,
}) {
  const stock = stockMap.get(`${facilityId}:${item.medicine_id}`);
  const threshold = Number(stock?.threshold || 0);
  const currentQuantity = Number(stock?.quantity || 0);
  const deficit = Math.max(threshold - currentQuantity, 0);

  const duplicateInItemNumber = otherSelectedMap?.get(item.medicine_id);
  const isDuplicate = Boolean(duplicateInItemNumber);

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

  const choPhysical = Number(choAvailability?.physicalQuantity || 0);
  const choReserved = Number(choAvailability?.reservedQuantity || 0);

  return (
    <div className={`rounded-xl border p-3 shadow-2xs transition-colors ${isDuplicate ? "border-amber-300 bg-amber-50/20" : "border-neutral-200 bg-white"}`}>
      {canRemove && (
        <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2 mb-2.5">
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-neutral-600">
            Item #{itemIndex + 1}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 transition hover:text-red-700"
          >
            <X className="h-3 w-3" />
            Remove
          </button>
        </div>
      )}

      {/* Side-by-side Medicine and Quantity Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2.5 items-start">
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
            Medicine <span className="text-red-500">*</span>
          </label>
          <MedicineSearchDropdown
            choAvailabilityMap={choAvailabilityMap}
            disabled={isMedicinesLoading}
            facilityId={facilityId}
            medicines={medicines}
            onChange={(newId) => updateItem("medicine_id", newId)}
            otherSelectedMap={otherSelectedMap}
            pendingRequestsByMedicine={pendingRequestsByMedicine}
            stockMap={stockMap}
            value={item.medicine_id}
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
            Quantity <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              required
              min="1"
              max={availableQuantity ?? undefined}
              type="number"
              value={item.quantity}
              onChange={(event) => updateItem("quantity", event.target.value)}
              placeholder="0"
              className={`h-10 w-full rounded-lg border px-3 pr-10 text-xs font-bold text-neutral-900 outline-none transition focus:ring-2 ${
                choExceedsRequest
                  ? "border-red-400 bg-red-50/30 focus:border-red-500 focus:ring-red-100"
                  : "border-neutral-300 bg-white focus:border-emerald-500 focus:ring-emerald-100"
              }`}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-neutral-400">
              units
            </span>
          </div>
        </div>
      </div>

      {isDuplicate && (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 shadow-2xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Duplicate Entry: This medicine is already selected in <strong>Item #{duplicateInItemNumber}</strong>. Please update the quantity in Item #{duplicateInItemNumber} instead or remove this duplicate row.
          </span>
        </div>
      )}

      {pendingEntries.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
          <span>
            Already requested on: <strong>{pendingEntries.join(", ")}</strong>. Submitting again may delay review.
          </span>
        </div>
      )}

      {/* Dynamic Stock Context & Quick Actions (only when a medicine is chosen) */}
      {item.medicine_id && (
        <div className="mt-2.5 rounded-lg border border-emerald-100 bg-emerald-50/40 p-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                  currentQuantity === 0
                    ? "bg-red-100 text-red-700"
                    : currentQuantity <= threshold
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {currentQuantity === 0
                  ? "Out of Stock"
                  : currentQuantity <= threshold
                  ? "Station Low"
                  : "In Stock"}
              </span>
              <span className="text-[11px] text-neutral-600">
                Station on-hand: <strong className="text-neutral-900">{currentQuantity.toLocaleString()}</strong>
                {threshold > 0 && (
                  <span className="text-neutral-400 font-medium"> / min {threshold.toLocaleString()}</span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {deficit > 0 && availableQuantity !== null && (
                <button
                  type="button"
                  onClick={() => updateItem("quantity", String(Math.min(deficit, availableQuantity)))}
                  title={`Fill Station Deficit (+${deficit.toLocaleString()})`}
                  className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 shadow-2xs transition hover:bg-amber-100"
                >
                  <Sparkles className="h-3 w-3 text-amber-600" />
                  Fill Deficit (+{deficit.toLocaleString()})
                </button>
              )}

              {availableQuantity > 0 && (
                <button
                  type="button"
                  onClick={() => updateItem("quantity", String(availableQuantity))}
                  title={`Request Maximum Available (${availableQuantity.toLocaleString()})`}
                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 shadow-2xs transition hover:bg-emerald-100"
                >
                  Max ({availableQuantity.toLocaleString()})
                </button>
              )}
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-100/70 pt-1.5 text-[11px] text-neutral-500">
            <span>
              CHO Central Pool: <strong className="text-emerald-800">{availableQuantity?.toLocaleString() ?? 0} requestable</strong>
              {choReserved > 0 && (
                <span className="text-neutral-400 font-medium"> ({choReserved.toLocaleString()} reserved)</span>
              )}
            </span>
            {choExceedsRequest ? (
              <span className="flex items-center gap-1 font-bold text-red-600">
                <AlertTriangle className="h-3 w-3" /> Exceeds CHO available ({availableQuantity?.toLocaleString()})
              </span>
            ) : requestedQuantity > 0 ? (
              <span className="text-neutral-600 font-medium">
                Est. stock after arrival: ~{(currentQuantity + requestedQuantity).toLocaleString()} units
              </span>
            ) : null}
          </div>
        </div>
      )}
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





