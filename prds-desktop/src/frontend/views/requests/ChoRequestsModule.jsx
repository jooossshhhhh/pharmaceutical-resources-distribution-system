import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileSpreadsheet,
  FileText,
  Package,
  Pill,
  Plus,
  Search,
  Trash2,
  X,
  Zap,
} from "lucide-react";

import AdminShell from "../../components/layout/AdminShell";
import ModalShell from "../../components/ModalShell";
import NotificationModal from "../../components/NotificationModal";
import PaginationControls from "../../components/PaginationControls";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import { formatDateTime } from "@shared/utils/dashboardUtils";
import { FacilityPicker } from "../inventory/inventoryComponents";
import {
  confirmRequestReceived,
  createManualMedicineRequest,
  getRequestReleaseBatches,
  getRequestsData,
  reviewMedicineRequest,
} from "@backend/services/requestsService";
import {
  buildFefoBatchAllocations,
  formatRequestDate,
  getAllocatedQuantityForItem,
  getAllocationValidationError,
  getForecastDemandMap,
  getMedicineFullLabel,
  getRequestNumber,
  getRequestPriority,
  getRequesterName,
  getRequestSourceLabel,
  getRequestSummary,
  getRequestTotalQuantity,
  getStockMap,
  matchesRequestFilters,
  requestPriorityOptions,
  requestSortOptions,
  sortRequests,
  validateManualPaperRequest,
} from "@shared/utils/requestUtils";
import {
  CloseIcon as UiCloseIcon,
  FilterDropdown,
  PlusIcon,
  RequestEmptyState,
  RequestPanel,
  RequestPanelHeader,
  RequestPriorityBadge,
  RequestSearchInput,
  RequestStatusBadge,
  SortIcon,
} from "./RequestUi";

const getProfileName = (profile) =>
  `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "CHO staff";

const getRequestDayKey = (request) => String(request.request_date || "").slice(0, 10);

const getRequestDisplayNumber = (request) => {
  if (!request?.isGrouped) {
    return getRequestNumber(request?.id);
  }

  return `${request.requests.length} requests`;
};

const getGroupedSourceLabel = (request) => {
  if (!request?.isGrouped) {
    return getRequestSourceLabel(request);
  }

  const sources = new Set(request.requests.map((entry) => getRequestSourceLabel(entry)));
  return sources.size === 1 ? [...sources][0] : "Online + Paper Request";
};

const groupRequestsByFacilityDate = (requests = []) => {
  const groups = new Map();

  requests.forEach((request) => {
    const key = `${request.facility_id}:${request.status}:${getRequestDayKey(request)}`;
    const current = groups.get(key) || [];
    current.push(request);
    groups.set(key, current);
  });

  return [...groups.values()].map((group) => {
    if (group.length === 1) {
      return {
        ...group[0],
        items: (group[0].items || []).map((item) => ({
          ...item,
          request_id: group[0].id,
        })),
        requests: group,
      };
    }

    return {
      ...group[0],
      id: `group:${group[0].facility_id}:${group[0].status}:${getRequestDayKey(group[0])}`,
      isGrouped: true,
      items: group.flatMap((request) =>
        (request.items || []).map((item) => ({
          ...item,
          request_id: request.id,
        }))
      ),
      requests: group,
      request_source: group.some((request) => request.request_source === "MANUAL_PAPER")
        ? group.every((request) => request.request_source === "MANUAL_PAPER")
          ? "MANUAL_PAPER"
          : "MIXED"
        : "SYSTEM",
      fulfillments: group.flatMap((request) => request.fulfillments || []),
    };
  });
};

export default function ChoRequestsModule() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [forecastRows, setForecastRows] = useState([]);
  const [inventoryRows, setInventoryRows] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [facilityId, setFacilityId] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [sortMode, setSortMode] = useState("newest");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [releaseBatches, setReleaseBatches] = useState([]);
  const [releaseAllocations, setReleaseAllocations] = useState([]);
  const [isReleaseLoading, setIsReleaseLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [releaseError, setReleaseError] = useState("");
  const [isManualRequestOpen, setIsManualRequestOpen] = useState(false);
  const [manualRequestForm, setManualRequestForm] = useState({
    facility_id: "",
    request_date: new Date().toISOString().split("T")[0],
    paper_slip_reference: "",
    manual_requested_by: "",
    remarks: "",
    items: [{ medicine_id: "", quantity: "", consumed_quantity: "" }],
  });
  const [manualRequestError, setManualRequestError] = useState("");
  const [isSavingManualRequest, setIsSavingManualRequest] = useState(false);

  const location = useLocation();

  useEffect(() => {
    if (location.state?.openNewRequest) {
      setIsManualRequestOpen(true);
      if (location.state.prefillMedicineId) {
        setManualRequestForm((current) => ({
          ...current,
          items: [
            {
              medicine_id: location.state.prefillMedicineId,
              quantity: String(location.state.prefillQuantity || ""),
              consumed_quantity: "",
            },
          ],
        }));
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const today = useMemo(() => formatDateTime(new Date()), []);
  const stockMap = useMemo(() => getStockMap(inventoryRows), [inventoryRows]);
  const forecastDemandMap = useMemo(() => getForecastDemandMap(forecastRows), [forecastRows]);
  const summary = useMemo(() => getRequestSummary(requests), [requests]);
  const facilityOptions = useMemo(
    () => [
      {
        facility_code: "CHO",
        facility_name: "All Facilities",
        id: "ALL",
      },
      ...facilities,
    ],
    [facilities]
  );
  const activeSortOptions =
    statusFilter === "PENDING"
      ? requestSortOptions
      : requestSortOptions.filter((option) => option.value !== "priority");
  const showFacilityColumn = facilityId === "ALL";
  const tableColumnCount = showFacilityColumn ? 6 : 5;

  const selectedRequestDetails = useMemo(() => {
    if (!selectedRequest) {
      return null;
    }

    const baseRequest = selectedRequest.isGrouped
      ? selectedRequest
      : requests.find((request) => request.id === selectedRequest.id) || selectedRequest;

    return {
      ...baseRequest,
      items: (baseRequest.items || []).map((item) => ({
        ...item,
        request_id: item.request_id || baseRequest.id,
      })),
      requests: baseRequest.requests || [baseRequest],
    };
  }, [requests, selectedRequest]);

  const filteredRequests = useMemo(() => {
    const matchedRequests = requests.filter((request) =>
      matchesRequestFilters(request, {
        facilityId,
        forecastDemandMap,
        keyword,
        priority: priorityFilter,
        status: statusFilter,
        stockMap,
      })
    );

    return sortRequests(matchedRequests, sortMode, stockMap, forecastDemandMap);
  }, [facilityId, forecastDemandMap, keyword, priorityFilter, requests, sortMode, statusFilter, stockMap]);
  const groupedRequests = useMemo(
    () => groupRequestsByFacilityDate(filteredRequests),
    [filteredRequests]
  );

  const {
    currentPage,
    paginatedRows: paginatedRequests,
    pageSize,
    setCurrentPage,
    totalCount,
    totalPages,
  } = usePaginatedRows(groupedRequests);

  const activeAllocations = useMemo(
    () => releaseAllocations.filter((allocation) => Number(allocation.quantity || 0) > 0),
    [releaseAllocations]
  );
  const allocationError = useMemo(() => {
    if (!selectedRequestDetails || selectedRequestDetails.status !== "PENDING") {
      return "";
    }

    const validationError = getAllocationValidationError(
      selectedRequestDetails.items || [],
      releaseBatches,
      activeAllocations
    );

    if (validationError) {
      return validationError;
    }

    if (selectedRequestDetails.isGrouped) {
      const allocatedRequestIds = new Set(
        activeAllocations
          .map((allocation) => {
            const item = (selectedRequestDetails.items || []).find(
              (requestItem) => requestItem.id === allocation.request_item_id
            );
            return item?.request_id;
          })
          .filter(Boolean)
      );

      if (
        (selectedRequestDetails.requests || []).some(
          (request) => !allocatedRequestIds.has(request.id)
        )
      ) {
        return "Set a release quantity for each request in this facility/date entry.";
      }
    }

    return "";
  }, [activeAllocations, releaseBatches, selectedRequestDetails]);

  const loadRequests = async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await getRequestsData();
      setFacilities(data.facilities);
      setForecastRows(data.forecastRows);
      setInventoryRows(data.inventoryRows);
      setMedicines(data.medicines);
      setRequests(data.requests);
      return data;
    } catch (loadError) {
      setError(loadError.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const resetFlow = () => {
    setSelectedRequest(null);
    setRemarks("");
    setReviewError("");
    setReleaseError("");
    setReleaseBatches([]);
    setReleaseAllocations([]);
  };

  const openRequest = (request) => {
    setSelectedRequest(request);
    setRemarks(request.remarks || "");
    setReviewError("");
    setReleaseError("");
    setReleaseBatches([]);
    setReleaseAllocations([]);
  };

  const updateManualRequestItem = (index, field, value) => {
    setManualRequestForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const updated = { ...item, [field]: value };
        if (
          field === "quantity" &&
          (item.consumed_quantity === "" || item.consumed_quantity === undefined)
        ) {
          updated.consumed_quantity = value;
        }
        return updated;
      }),
    }));
  };

  const saveManualRequest = async (event, options = {}) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    const validationError = validateManualPaperRequest({
      facilityId: manualRequestForm.facility_id,
      items: manualRequestForm.items,
      requestDate: manualRequestForm.request_date,
    });

    if (validationError) {
      setManualRequestError(validationError);
      return;
    }

    setIsSavingManualRequest(true);
    setManualRequestError("");

    try {
      const result = await createManualMedicineRequest({
        facilityId: manualRequestForm.facility_id,
        items: manualRequestForm.items,
        manualRequestedBy: manualRequestForm.manual_requested_by.trim(),
        remarks: manualRequestForm.remarks.trim(),
        requestDate: manualRequestForm.request_date || null,
        paperSlipReference: manualRequestForm.paper_slip_reference?.trim() || null,
      });

      const newRequestId = typeof result === "string" ? result : result?.id || result?.result_id;

      setIsManualRequestOpen(false);
      setManualRequestForm({
        facility_id: "",
        request_date: new Date().toISOString().split("T")[0],
        paper_slip_reference: "",
        manual_requested_by: "",
        remarks: "",
        items: [{ medicine_id: "", quantity: "", consumed_quantity: "" }],
      });
      if (result?.queued) {
        setNotice("Paper request queued offline. It will be recorded when connection returns.");
      } else {
        setNotice(
          options.proceedToRelease
            ? "Paper requisition encoded. Proceeding directly to batch allocation and release."
            : "Paper requisition encoded and saved to pending requests successfully."
        );
        setStatusFilter("PENDING");
      }
      const updatedData = await loadRequests();

      if (options.proceedToRelease && newRequestId && updatedData?.requests) {
        const newlyCreated = updatedData.requests.find((r) => r.id === newRequestId);
        if (newlyCreated) {
          openRequest(newlyCreated);
        }
      }
    } catch (saveError) {
      setManualRequestError(saveError.message || "Unable to encode paper request.");
    } finally {
      setIsSavingManualRequest(false);
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
      setReleaseError("");

      try {
        const requestEntries = selectedRequestDetails.requests || [selectedRequestDetails];
        const batchesByRequest = await Promise.all(
          requestEntries.map((request) => getRequestReleaseBatches(request.id))
        );

        if (!isCurrent) {
          return;
        }

        const batches = batchesByRequest.flat();
        setReleaseBatches(batches);
        setReleaseAllocations((prevAllocations) => {
          if (prevAllocations && prevAllocations.length > 0) {
            return prevAllocations;
          }
          return buildFefoBatchAllocations(selectedRequestDetails.items || [], batches);
        });
      } catch (loadError) {
        if (isCurrent) {
          setReleaseBatches([]);
          setReleaseAllocations([]);
          setReleaseError(loadError.message);
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
  }, [selectedRequestDetails?.id, selectedRequestDetails?.status]);

  const updateReleaseQuantity = (item, quantity) => {
    const itemBatches = releaseBatches.filter((batch) => batch.request_item_id === item.id);
    const availableQuantity = itemBatches.reduce(
      (total, batch) => total + Number(batch.quantity || 0),
      0
    );
    const requestedQuantity = Number(item.quantity || 0);
    const maxAllowed = Math.min(requestedQuantity, availableQuantity);
    const nextQuantity = Math.max(0, Math.min(Number(quantity || 0), maxAllowed));
    let remainingQuantity = nextQuantity;
    const nextItemAllocations = [];

    for (const batch of itemBatches) {
      if (remainingQuantity <= 0) {
        break;
      }

      const allocatedQuantity = Math.min(remainingQuantity, Number(batch.quantity || 0));
      if (allocatedQuantity > 0) {
        nextItemAllocations.push({
          request_item_id: item.id,
          source_inventory_id: batch.source_inventory_id,
          quantity: allocatedQuantity,
        });
        remainingQuantity -= allocatedQuantity;
      }
    }

    setReleaseAllocations((currentAllocations) => [
      ...currentAllocations.filter((allocation) => allocation.request_item_id !== item.id),
      ...nextItemAllocations,
    ]);
  };

  const rejectRequest = async () => {
    if (!selectedRequestDetails || !profile?.id || isSaving) {
      return;
    }

    setIsSaving(true);
    setReviewError("");

    try {
      const requestEntries = selectedRequestDetails.requests || [selectedRequestDetails];
      await Promise.all(
        requestEntries.map((request) =>
          reviewMedicineRequest({
            allocations: [],
            profileId: profile.id,
            remarks,
            requestId: request.id,
            status: "REJECTED",
          })
        )
      );
      setNotice(
        `Requisition ${getRequestDisplayNumber(selectedRequestDetails)} has been rejected.`
      );
      await loadRequests();
      resetFlow();
    } catch (saveError) {
      setReviewError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const releaseRequest = async () => {
    if (!selectedRequestDetails || !profile?.id || isSaving) {
      return;
    }

    if (allocationError) {
      setReviewError(allocationError);
      return;
    }

    setIsSaving(true);
    setReviewError("");

    try {
      const requestEntries = selectedRequestDetails.requests || [selectedRequestDetails];
      const targetRequestEntries = requestEntries.filter((request) => {
        if (selectedRequestDetails.isGrouped) {
          return activeAllocations.some((allocation) => {
            const item = (selectedRequestDetails.items || []).find(
              (requestItem) => requestItem.id === allocation.request_item_id
            );
            return (item?.request_id || selectedRequestDetails.id) === request.id;
          });
        }
        return true;
      });

      const updatedRequests = [];

      for (const request of targetRequestEntries) {
        const allocationsForRequest = activeAllocations.filter((allocation) => {
          const item = (selectedRequestDetails.items || []).find(
            (requestItem) => requestItem.id === allocation.request_item_id
          );
          return (item?.request_id || selectedRequestDetails.id) === request.id;
        });

        updatedRequests.push(
          await reviewMedicineRequest({
            allocations: selectedRequestDetails.isGrouped ? allocationsForRequest : activeAllocations,
            profileId: profile.id,
            remarks,
            requestId: request.id,
            status: "APPROVED",
          })
        );
      }

      setNotice(
        `Requisition ${getRequestDisplayNumber(selectedRequestDetails)} has been approved and released successfully.`
      );
      setStatusFilter("APPROVED");
      await loadRequests();
      resetFlow();
    } catch (saveError) {
      setReviewError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const completeApprovedRequest = async () => {
    if (!selectedRequestDetails) return;
    setIsSaving(true);
    setReviewError("");

    try {
      const targetRequestEntries = selectedRequestDetails.isGrouped
        ? selectedRequestDetails.requests || []
        : [selectedRequestDetails];

      for (const request of targetRequestEntries) {
        await confirmRequestReceived({ requestId: request.id });
      }

      setNotice(
        `Requisition ${getRequestDisplayNumber(selectedRequestDetails)} has been marked as Completed successfully.`
      );
      setStatusFilter("COMPLETED");
      await loadRequests();
      resetFlow();
    } catch (saveError) {
      setReviewError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <NotificationModal
        notice={notice}
        onClose={() => setNotice("")}
        autoCloseMs={8000}
      />
      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <RequestListView
        activeSortOptions={activeSortOptions}
        currentPage={currentPage}
        facilityId={facilityId}
        facilityOptions={facilityOptions}
        filteredRequests={filteredRequests}
        forecastDemandMap={forecastDemandMap}
        isLoading={isLoading}
        keyword={keyword}
        onAddRequest={() => setIsManualRequestOpen(true)}
        onFacilityChange={setFacilityId}
        onKeywordChange={setKeyword}
        onOpenRequest={openRequest}
        onPageChange={setCurrentPage}
        onPriorityChange={(nextPriority) => {
          setPriorityFilter(nextPriority);
          setCurrentPage(1);
        }}
        priorityFilter={priorityFilter}
        onSortChange={(nextSortMode) => {
          setSortMode(nextSortMode);
        }}
        onStatusChange={(nextStatus) => {
          setStatusFilter(nextStatus);
          setCurrentPage(1);
        }}
        pageSize={pageSize}
        paginatedRequests={paginatedRequests}
        showFacilityColumn={showFacilityColumn}
        sortMode={sortMode}
        statusFilter={statusFilter}
        stockMap={stockMap}
        summary={summary}
        tableColumnCount={tableColumnCount}
        totalCount={totalCount}
        totalPages={totalPages}
      />

      {selectedRequestDetails && (
        <ChoReviewModal
          allocationError={allocationError}
          approverName={getProfileName(profile)}
          forecastDemandMap={forecastDemandMap}
          isLoadingBatches={isReleaseLoading}
          isSaving={isSaving}
          onClose={resetFlow}
          onComplete={completeApprovedRequest}
          onReject={rejectRequest}
          onRelease={releaseRequest}
          onReleaseQuantityChange={updateReleaseQuantity}
          releaseAllocations={releaseAllocations}
          releaseBatches={releaseBatches}
          releaseError={releaseError}
          remarks={remarks}
          request={selectedRequestDetails}
          reviewError={reviewError}
          setRemarks={setRemarks}
          stockMap={stockMap}
        />
      )}

      {isManualRequestOpen && (
        <ManualPaperRequestModal
          error={manualRequestError}
          facilities={facilities}
          form={manualRequestForm}
          inventoryRows={inventoryRows}
          isSaving={isSavingManualRequest}
          medicines={medicines}
          onAddItem={() =>
            setManualRequestForm((current) => ({
              ...current,
              items: [...current.items, { medicine_id: "", quantity: "", consumed_quantity: "" }],
            }))
          }
          onChange={(field, value) =>
            setManualRequestForm((current) => ({ ...current, [field]: value }))
          }
          onClose={() => {
            setIsManualRequestOpen(false);
            setManualRequestError("");
          }}
          onRemoveItem={(index) =>
            setManualRequestForm((current) => ({
              ...current,
              items: current.items.filter((_, itemIndex) => itemIndex !== index),
            }))
          }
          onSubmit={saveManualRequest}
          onUpdateItem={updateManualRequestItem}
        />
      )}
    </AdminShell>
  );
}

function RequestSummaryCards({ onSelectStatus, statusFilter, summary }) {
  const cards = [
    {
      active: statusFilter === "ALL",
      description: "All recorded requisitions",
      id: "total",
      label: "Total Requests",
      onClick: () => onSelectStatus("ALL"),
      value: summary.total,
    },
    {
      active: statusFilter === "PENDING",
      description: "Awaiting CHO action",
      id: "pending",
      label: "Pending Review",
      onClick: () => onSelectStatus(statusFilter === "PENDING" ? "ALL" : "PENDING"),
      value: summary.pending,
    },
    {
      active: statusFilter === "APPROVED",
      description: "Ready for release / pickup",
      id: "approved",
      label: "Approved",
      onClick: () => onSelectStatus(statusFilter === "APPROVED" ? "ALL" : "APPROVED"),
      value: summary.inTransit,
    },
    {
      active: statusFilter === "COMPLETED",
      description: "Fulfilled requisitions",
      id: "completed",
      label: "Completed",
      onClick: () => onSelectStatus(statusFilter === "COMPLETED" ? "ALL" : "COMPLETED"),
      value: summary.completed,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={card.onClick}
          className={`group rounded-xl border bg-[#F9FBFB] p-4 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer ${
            card.active ? "border-[#34769B] ring-2 ring-[#34769B]/20" : "border-[#CFDDE0] hover:border-[#34769B]/40"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-2xl font-black tracking-tight text-[#1B2B30] leading-none">
              {card.value}
            </p>
            {card.active && (
              <span className="rounded-full bg-[#E3EEF5] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#1F4A66]">
                Selected
              </span>
            )}
          </div>
          <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-neutral-500">
            {card.label}
          </p>
          <p className="mt-1 line-clamp-1 text-xs font-semibold text-neutral-400">
            {card.description}
          </p>
        </button>
      ))}
    </div>
  );
}

function RequestListView({
  activeSortOptions,
  currentPage,
  facilityId,
  facilityOptions,
  filteredRequests,
  forecastDemandMap,
  isLoading,
  keyword,
  onAddRequest,
  onFacilityChange,
  onKeywordChange,
  onOpenRequest,
  onPageChange,
  onPriorityChange,
  onSortChange,
  onStatusChange,
  pageSize,
  paginatedRequests,
  priorityFilter,
  showFacilityColumn,
  sortMode,
  statusFilter,
  stockMap,
  summary,
  tableColumnCount,
  totalCount,
  totalPages,
}) {
  return (
    <div className="space-y-4">
      <RequestSummaryCards
        onSelectStatus={onStatusChange}
        statusFilter={statusFilter}
        summary={summary}
      />

      <RequestPanel>
        <RequestPanelHeader
          eyebrow="Supply Chain Command"
          title="Distribution Requests"
          subtitle="Monitor, review, allocate, and approve medicine requisition requests across health centers."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onAddRequest}
                className="btn-primary inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-xs font-bold text-white shadow-xs transition active:scale-[0.99] cursor-pointer"
              >
                <PlusIcon />
                Add Request
              </button>
              <FacilityPicker
                facilities={facilityOptions}
                value={facilityId}
                onSelect={onFacilityChange}
                className="sm:w-64"
                dropdownClassName="sm:w-80"
              />
            </div>
          }
        />

        <div className="bg-neutral-50/40 p-4 space-y-3">
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <RequestSearchInput
              value={keyword}
              onChange={onKeywordChange}
              placeholder={
                showFacilityColumn
                  ? "Search request ID, facility, requester, or medicine..."
                  : "Search request ID, requester, or medicine..."
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              <FilterDropdown
                value={priorityFilter}
                onChange={onPriorityChange}
                options={requestPriorityOptions}
                className="min-w-[10.5rem]"
              />
              <FilterDropdown
                icon={<SortIcon />}
                value={sortMode}
                onChange={onSortChange}
                options={activeSortOptions}
                className="min-w-[10rem]"
              />
            </div>
          </div>
          <p className="mt-2 text-xs font-semibold text-neutral-500">
            Showing {totalCount.toLocaleString()} request(s). Pending: {summary.pending}.
            Completed: {summary.completed}.
          </p>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table
              className={`${
                showFacilityColumn ? "min-w-[52rem]" : "min-w-[44rem]"
              } w-full border-collapse text-left`}
            >
              <thead className="border-b border-slate-200/80 bg-white">
                <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Request ID</th>
                  {showFacilityColumn && <th className="px-4 py-3">Facility</th>}
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={tableColumnCount}
                      className="px-4 py-14 text-center text-sm font-bold text-neutral-500"
                    >
                      Loading medicine requests...
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={tableColumnCount}>
                      <RequestEmptyState
                        title="No requests match this view"
                        description="Try another facility, keyword, status, or sort direction."
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedRequests.map((request) => (
                    <RequestRow
                      key={request.id}
                      request={request}
                      forecastDemandMap={forecastDemandMap}
                      onSelect={() => onOpenRequest(request)}
                      showFacilityColumn={showFacilityColumn}
                      stockMap={stockMap}
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
              onPageChange={onPageChange}
              pageSize={pageSize}
              totalCount={totalCount}
              totalPages={totalPages}
            />
          )}
        </div>
      </div>
    </RequestPanel>
    </div>
  );
}

function RequestRow({
  forecastDemandMap,
  onSelect,
  request,
  showFacilityColumn = true,
  stockMap,
}) {
  const priority = getRequestPriority(request, stockMap, forecastDemandMap);
  const itemCount = (request.items || []).length;
  const totalQty = getRequestTotalQuantity(request);

  return (
    <tr
      tabIndex={0}
      role="button"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className="group cursor-pointer align-top text-sm transition hover:bg-emerald-50/40 focus:outline-none focus-visible:bg-emerald-50/60"
    >
      <td className="px-4 py-3.5">
        <span className="text-xs font-black text-blue-600 underline-offset-4 group-hover:text-blue-800 group-hover:underline">
          {getRequestDisplayNumber(request)}
        </span>
        <span className="mt-1 block w-fit rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-neutral-600">
          {getGroupedSourceLabel(request)}
        </span>
      </td>
      {showFacilityColumn && (
        <td className="px-4 py-3.5">
          <p className="max-w-56 break-words font-black text-black">
            {request.facility?.facility_name || "No facility"}
          </p>
        </td>
      )}
      <td className="px-4 py-3.5">
        <p className="font-bold text-[#0d1117]">
          {itemCount} {itemCount === 1 ? "medicine" : "medicines"}
        </p>
        <p className="mt-0.5 text-xs font-medium text-neutral-500">
          {totalQty.toLocaleString()} units
        </p>
      </td>
      <td className="px-4 py-3.5">
        <RequestPriorityBadge priority={priority} />
      </td>
      <td className="px-4 py-3.5">
        <RequestStatusBadge status={request.status} />
      </td>
      <td className="px-4 py-3.5 text-xs font-semibold text-neutral-600">
        {formatRequestDate(request.request_date)}
      </td>
    </tr>
  );
}

function ChoReviewModal({
  allocationError,
  approverName,
  forecastDemandMap,
  isLoadingBatches,
  isSaving,
  onClose,
  onComplete,
  onReject,
  onRelease,
  onReleaseQuantityChange,
  releaseAllocations,
  releaseBatches,
  releaseError,
  remarks,
  request,
  reviewError,
  setRemarks,
  stockMap,
}) {
  const [isConfirmingReject, setIsConfirmingReject] = useState(false);
  const isPending = request.status === "PENDING";
  const isCompleted = request.status === "COMPLETED";
  const isRejected = request.status === "REJECTED";

  const priority = getRequestPriority(request, stockMap, forecastDemandMap);
  const items = request.items || [];
  const itemCount = items.length;
  const totalRequestedQty = getRequestTotalQuantity(request);

  const totalAllocatedQty = useMemo(() => {
    if (isPending) {
      return releaseAllocations.reduce((sum, a) => sum + Number(a.quantity || 0), 0);
    }
    if (request.fulfillments && request.fulfillments.length > 0) {
      return request.fulfillments.reduce((sum, f) => sum + Number(f.quantity || 0), 0);
    }
    return isRejected ? 0 : totalRequestedQty;
  }, [isPending, releaseAllocations, request.fulfillments, isRejected, totalRequestedQty]);

  return (
    <ModalShell
      labelledBy="cho-review-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="max-w-3xl w-full p-0 overflow-hidden rounded-2xl bg-white shadow-2xl border border-neutral-100"
    >
      <div className="w-full flex max-h-[90vh] flex-col overflow-hidden">
        {/* Modal Header */}
        <header className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 bg-neutral-50/40">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
              <Package className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="cho-review-modal-title" className="text-base font-black text-neutral-900 tracking-tight">
                  {getRequestDisplayNumber(request)}
                </h3>
                <RequestStatusBadge status={request.status} />
              </div>
              <p className="mt-0.5 text-xs font-semibold text-neutral-500">
                {request.facility?.facility_name || "Health Center"} · Submitted {formatRequestDate(request.request_date)}
              </p>
            </div>
          </div>
        </header>

        {/* Modal Body */}
        <div className="prds-modal-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* Error & Warning Banners */}
          {reviewError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <p className="flex-1">{reviewError}</p>
            </div>
          )}
          {releaseError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-orange-200 bg-orange-50 p-3.5 text-xs font-semibold text-orange-700">
              <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600 mt-0.5" />
              <p className="flex-1">{releaseError}</p>
            </div>
          )}

          {/* Overview KPI Cards */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-neutral-200/80 bg-white p-3 shadow-2xs flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                  Requesting Station
                </p>
                <p className="mt-1 text-xs sm:text-[13px] font-black text-neutral-900 leading-snug break-words" title={request.facility?.facility_name}>
                  {request.facility?.facility_name || "Health Center"}
                </p>
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-neutral-500">
                {request.facility?.facility_code || "BHC"}
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200/80 bg-white p-3 shadow-2xs flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                  Requested Items
                </p>
                <p className="mt-1 text-base font-black text-neutral-900">
                  {itemCount} {itemCount === 1 ? "medicine" : "medicines"}
                </p>
              </div>
              <p className="mt-1.5 text-[11px] font-bold text-neutral-500">
                {totalRequestedQty.toLocaleString()} units total
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200/80 bg-white p-3 shadow-2xs flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                  Priority
                </p>
                <div className="mt-1">
                  <RequestPriorityBadge priority={priority} />
                </div>
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-neutral-500">
                {request.isGrouped ? getGroupedSourceLabel(request) : getRequestSourceLabel(request)}
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200/80 bg-white p-3 shadow-2xs flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                  Requisition Date
                </p>
                <p className="mt-1 text-sm font-black text-neutral-900">
                  {formatRequestDate(request.request_date)}
                </p>
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-neutral-500 truncate" title={getRequesterName(request)}>
                {getRequesterName(request)}
              </p>
            </div>
          </section>

          {/* Contextual Status Banner */}
          {isPending ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
              <Clock className="h-4 w-4 text-blue-700 shrink-0" />
              <span>
                <strong>Awaiting CHO Review & Allocation.</strong> Earliest-expiring batches are automatically prioritized (FEFO). You may adjust release quantities before approving.
              </span>
            </div>
          ) : isCompleted ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
              <Check className="h-4 w-4 text-emerald-700 shrink-0" />
              <span>
                <strong>Requisition Fulfilled & Released.</strong> Medicines have been released from City Health Office to {request.facility?.facility_name || "the requesting station"}.
              </span>
            </div>
          ) : isRejected ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs text-red-900">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <span>
                <strong>Requisition Rejected.</strong> This request was reviewed and rejected by CHO.
              </span>
            </div>
          ) : request.status === "APPROVED" ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
              <span>
                <strong>Approved & Ready for Pickup.</strong> Supplies have been allocated and staged for pickup at CHO. Once collected, click &quot;Mark as Completed&quot; below (or the BHW will confirm upon pickup).
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
              <CheckCircle2 className="h-4 w-4 text-blue-700 shrink-0" />
              <span>
                <strong>Approved.</strong> Requisition has been approved by CHO.
              </span>
            </div>
          )}

          {/* Requested Medicines Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-neutral-700" />
                <h4 className="text-xs font-black uppercase tracking-wider text-neutral-700">
                  Requested Medicines
                </h4>
              </div>
              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-neutral-600">
                {itemCount} {itemCount === 1 ? "medicine" : "medicines"} · {totalRequestedQty.toLocaleString()} units needed
              </span>
            </div>

            {isLoadingBatches ? (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 py-8 text-center text-xs font-bold text-neutral-500">
                Loading CHO stock inventory...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center text-xs font-semibold text-neutral-500">
                No medicine items recorded for this requisition.
              </div>
            ) : (
              <div className="space-y-2.5">
                {items.map((item, idx) => {
                  const genericName = item.medicine?.generic_name || "Unknown Generic Name";
                  const brandName = item.medicine?.brand_name;
                  const dosage = item.medicine?.dosage;
                  const unit = item.medicine?.unit_of_measure || "unit";
                  const requestedQuantity = Number(item.quantity || 0);

                  let availableQuantity = 0;
                  let releasedQuantity = 0;
                  let remainingStock = 0;
                  let maxAllowed = 0;

                  if (isPending) {
                    const itemBatches = releaseBatches.filter(
                      (batch) => batch.request_item_id === item.id
                    );
                    availableQuantity = itemBatches.reduce(
                      (total, batch) => total + Number(batch.quantity || 0),
                      0
                    );
                    releasedQuantity = getAllocatedQuantityForItem(item.id, releaseAllocations);
                    remainingStock = Math.max(0, availableQuantity - releasedQuantity);
                    maxAllowed = Math.min(requestedQuantity, availableQuantity);
                  } else {
                    const fulfillments = (request.fulfillments || []).filter(
                      (f) => f.request_item_id === item.id
                    );
                    releasedQuantity = fulfillments.length > 0
                      ? fulfillments.reduce((sum, f) => sum + Number(f.quantity || 0), 0)
                      : isRejected || (request.fulfillments && request.fulfillments.length > 0)
                        ? 0
                        : requestedQuantity;
                  }

                  return (
                    <article
                      key={item.id || idx}
                      className="rounded-xl border border-neutral-200/90 bg-white p-3.5 shadow-2xs hover:border-emerald-200 transition-colors"
                    >
                      {/* Top Row: Title, Brand, Dosage, Unit */}
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
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {dosage && (
                                <span className="inline-flex items-center rounded-md bg-blue-50 border border-blue-200/70 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                                  Dosage: {dosage}
                                </span>
                              )}
                              <span className="inline-flex items-center rounded-md bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                Unit: {unit}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Stock Indicator Status Badge (for Pending) */}
                        {isPending && (
                          <div className="shrink-0">
                            {availableQuantity === 0 ? (
                              <span className="rounded-full bg-red-100 border border-red-200 px-2.5 py-0.5 text-[10px] font-black text-red-700">
                                Out of Stock
                              </span>
                            ) : availableQuantity < requestedQuantity ? (
                              <span className="rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-[10px] font-black text-amber-800">
                                Partial Stock ({availableQuantity})
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-black text-emerald-800">
                                Sufficient Stock
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Bottom Row: Quantities & Release Controls */}
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-neutral-100 pt-3 text-xs">
                        {/* Needed Quantity */}
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                            Needed Quantity
                          </p>
                          <p className="mt-1 text-sm font-black text-neutral-900">
                            {requestedQuantity.toLocaleString()}{" "}
                            <span className="text-xs font-semibold text-neutral-500">{unit}</span>
                          </p>
                        </div>

                        {/* CHO Stock (for Pending) or Fulfillment Status */}
                        {isPending ? (
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                              CHO Stock
                            </p>
                            <p className="mt-1 text-sm font-black text-neutral-900">
                              {availableQuantity.toLocaleString()}{" "}
                              <span className="text-xs font-semibold text-neutral-500">{unit} available</span>
                            </p>
                            {releasedQuantity > 0 && (
                              <p className="text-[11px] font-semibold text-neutral-400">
                                {remainingStock.toLocaleString()} {unit} left after release
                              </p>
                            )}
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                              Fulfillment Status
                            </p>
                            <p className="mt-1 text-sm font-bold text-neutral-700">
                              {isCompleted ? "Fulfilled" : isRejected ? "Not Released" : "Ready for Pickup"}
                            </p>
                          </div>
                        )}

                        {/* Release Quantity Field */}
                        {isPending ? (
                          <div className="sm:text-right">
                            <label className="text-[10px] font-black uppercase tracking-wider text-neutral-500 block">
                              Release Quantity
                            </label>
                            <div className="mt-1 inline-flex items-center gap-1.5 sm:justify-end">
                              <input
                                type="number"
                                min="0"
                                max={maxAllowed}
                                value={releasedQuantity === 0 ? "" : releasedQuantity}
                                onChange={(e) => onReleaseQuantityChange(item, e.target.value)}
                                placeholder="0"
                                className="h-8.5 w-24 rounded-lg border border-neutral-300 px-2 text-right text-sm font-black text-neutral-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                              />
                              <span className="text-xs font-bold text-neutral-600">{unit}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="sm:text-right">
                            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                              Released Quantity
                            </p>
                            <p className={`mt-1 text-base font-black ${releasedQuantity === 0 ? "text-red-600" : "text-emerald-700"}`}>
                              {releasedQuantity.toLocaleString()}{" "}
                              <span className="text-xs font-bold text-neutral-500">{unit}</span>
                            </p>
                            {releasedQuantity === 0 && (
                              <span className="mt-0.5 inline-block rounded bg-red-100 px-1.5 py-0.2 text-[9px] font-black text-red-700">
                                0 Released (Out of stock)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Allocation Validation Error */}
          {allocationError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs font-bold text-orange-700">
              <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600 mt-0.5" />
              <p>{allocationError}</p>
            </div>
          )}

          {/* Releasing Units Summary Bar */}
          {isPending ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-2.5 text-xs font-bold text-neutral-700">
              <Package className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                Releasing: <strong className="text-emerald-700">{totalAllocatedQty.toLocaleString()}</strong> of{" "}
                <strong className="text-neutral-900">{totalRequestedQty.toLocaleString()} units</strong>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200/80 bg-neutral-50/70 px-3.5 py-2.5 text-xs font-bold text-neutral-700">
              <Package className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                Total Released Units: <strong className="text-emerald-700">{totalAllocatedQty.toLocaleString()} units</strong>
              </span>
            </div>
          )}

          {/* Remarks Section */}
          {isPending ? (
            <div className="space-y-1.5 pt-2 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-wider text-neutral-500 block">
                  CHO Remarks & Handling Notes (optional)
                </label>
                {items.some((item) => getAllocatedQuantityForItem(item.id, releaseAllocations) === 0) && (
                  <span className="text-[11px] font-semibold text-amber-700">
                    Note reason for items allocated 0 quantity
                  </span>
                )}
              </div>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows="2"
                placeholder="Optional approval notes, reason for 0 or partial quantity released, pickup instructions..."
                className="w-full resize-none rounded-xl border border-neutral-300 px-3.5 py-2 text-xs font-medium text-neutral-800 outline-none placeholder:text-neutral-400 transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          ) : remarks ? (
            <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/70 p-3 text-xs space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 block">
                CHO Remarks
              </span>
              <p className="font-semibold text-neutral-700 leading-relaxed">{remarks}</p>
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-6 py-3.5 bg-neutral-50/50">
          <div>
            {isPending && (
              isConfirmingReject ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-red-700">Reject this requisition?</span>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingReject(false)}
                    className="h-8.5 rounded-lg bg-neutral-100 px-3 text-xs font-bold text-neutral-700 hover:bg-neutral-200 transition cursor-pointer"
                  >
                    No, Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={onReject}
                    className="h-8.5 rounded-lg bg-red-600 px-3.5 text-xs font-bold text-white hover:bg-red-700 transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? "Rejecting..." : "Confirm Reject"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsConfirmingReject(true)}
                  className="h-8.5 rounded-lg border border-red-200 bg-red-50 px-3.5 text-xs font-bold text-red-700 hover:bg-red-100 transition disabled:opacity-50 cursor-pointer"
                >
                  Reject Request
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            {isPending ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8.5 rounded-lg bg-neutral-100 px-3.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isLoadingBatches || Boolean(allocationError)}
                  onClick={onRelease}
                  className="inline-flex items-center gap-1.5 h-8.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:cursor-not-allowed disabled:bg-neutral-300 cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  {isSaving ? "Releasing..." : "Approve & Release"}
                </button>
              </>
            ) : request.status === "APPROVED" ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8.5 rounded-lg bg-neutral-100 px-4 text-xs font-bold text-neutral-700 hover:bg-neutral-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={onComplete}
                  className="inline-flex items-center gap-1.5 h-8.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer"
                >
                  <Check className="h-4 w-4 stroke-[2.5]" />
                  <span>{isSaving ? "Completing..." : "Mark as Completed"}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="h-8.5 rounded-lg bg-neutral-100 px-4 text-xs font-bold text-neutral-700 hover:bg-neutral-200 transition cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </footer>
      </div>
    </ModalShell>
  );
}

function ManualMedicineSearchDropdown({
  bhsStockMap,
  disabled = false,
  medicines = [],
  onChange,
  otherSelectedIds = new Set(),
  placeholder = "Search medicine generic name, dosage, or brand...",
  stationName,
  value,
  warehouseStockMap,
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

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setSearchQuery("");
      e.preventDefault();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const firstValid = filteredMedicines.find((m) => !otherSelectedIds.has(m.id) || m.id === value);
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
          className={`relative flex h-9.5 w-full items-center rounded-lg border bg-white px-3 transition ${
            isOpen
              ? "border-emerald-500 ring-2 ring-emerald-100"
              : "border-neutral-200 hover:border-neutral-300"
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
              className="mr-1 rounded p-0.5 text-neutral-400 hover:text-neutral-600 cursor-pointer"
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
            className="rounded p-0.5 text-neutral-400 hover:text-neutral-600 cursor-pointer"
            title={isOpen ? "Close dropdown" : "Open list"}
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
            if (!disabled) {
              setIsOpen(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsOpen(true);
            }
          }}
          className="flex h-9.5 w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 hover:border-neutral-300 transition cursor-pointer"
        >
          <div className="flex items-center gap-2 truncate">
            <span className="text-xs font-bold text-neutral-900 truncate">
              {selectedMedicine.generic_name}
            </span>
            {selectedMedicine.dosage && (
              <span className="text-[10px] font-semibold text-neutral-500 shrink-0">
                ({selectedMedicine.dosage})
              </span>
            )}
            {selectedMedicine.brand_name && selectedMedicine.brand_name !== "-" && (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 shrink-0">
                {selectedMedicine.brand_name}
              </span>
            )}
          </div>
          <span className="text-[10.5px] font-semibold text-emerald-600 hover:text-emerald-700 shrink-0 ml-2">
            Change
          </span>
        </div>
      )}

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl">
          {filteredMedicines.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-neutral-500">
              No matching medicines found for "{searchQuery}".
            </div>
          ) : (
            filteredMedicines.map((medicine) => {
              const isAlreadySelected = otherSelectedIds.has(medicine.id) && medicine.id !== value;
              const choStock = warehouseStockMap?.get(medicine.id) ?? 0;
              const bhsStock = bhsStockMap?.get(medicine.id) ?? 0;
              const isCurrent = medicine.id === value;

              return (
                <button
                  key={medicine.id}
                  type="button"
                  disabled={isAlreadySelected}
                  onClick={() => {
                    onChange(medicine.id);
                    setIsOpen(false);
                    setSearchQuery("");
                  }}
                  className={`w-full flex flex-col text-left rounded-lg p-2 transition cursor-pointer mb-1 last:mb-0 ${
                    isCurrent
                      ? "bg-emerald-50 border border-emerald-200/80"
                      : isAlreadySelected
                      ? "opacity-40 cursor-not-allowed bg-neutral-50"
                      : "hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-neutral-900 truncate">
                      {medicine.generic_name}
                    </span>
                    {isAlreadySelected && (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                        Already Added
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10.5px]">
                    {medicine.dosage && (
                      <span className="text-neutral-600 font-medium">
                        {medicine.dosage}
                      </span>
                    )}
                    {medicine.brand_name && medicine.brand_name !== "-" && (
                      <span className="text-emerald-700 font-semibold">
                        • {medicine.brand_name}
                      </span>
                    )}
                    <span className="text-neutral-400">•</span>
                    <span className="text-neutral-600 font-semibold">
                      CHO: <strong className={choStock > 0 ? "text-emerald-700" : "text-amber-700"}>{choStock.toLocaleString()}</strong>
                    </span>
                    {stationName && (
                      <>
                        <span className="text-neutral-400">•</span>
                        <span className="text-purple-700 font-semibold">
                          BHS: <strong>{bhsStock.toLocaleString()}</strong>
                        </span>
                      </>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function ManualPaperRequestModal({
  error,
  facilities = [],
  form,
  inventoryRows = [],
  isSaving,
  medicines = [],
  onAddItem,
  onChange,
  onClose,
  onRemoveItem,
  onSubmit,
  onUpdateItem,
}) {
  const medicinesMap = useMemo(
    () => new Map(medicines.map((medicine) => [medicine.id, medicine])),
    [medicines]
  );

  const selectedFacility = useMemo(
    () => facilities.find((facility) => facility.id === form.facility_id),
    [facilities, form.facility_id]
  );

  const choFacility = useMemo(
    () => facilities.find((facility) => facility.facility_type === "CHO"),
    [facilities]
  );

  const healthCenterFacilities = useMemo(
    () => facilities.filter((facility) => facility.facility_type === "HEALTH_CENTER"),
    [facilities]
  );

  const bhsStockMap = useMemo(() => {
    const map = new Map();
    if (!form.facility_id) return map;
    for (const row of inventoryRows) {
      if (row.facility_id === form.facility_id) {
        map.set(row.medicine_id, (map.get(row.medicine_id) || 0) + Number(row.quantity || 0));
      }
    }
    return map;
  }, [inventoryRows, form.facility_id]);

  const warehouseStockMap = useMemo(() => {
    const map = new Map();
    const choId = choFacility?.id;
    for (const row of inventoryRows) {
      if (choId ? row.facility_id === choId : row.facility_id !== form.facility_id) {
        map.set(row.medicine_id, (map.get(row.medicine_id) || 0) + Number(row.quantity || 0));
      }
    }
    return map;
  }, [inventoryRows, choFacility?.id, form.facility_id]);

  const selectedMedicineIds = useMemo(() => {
    return new Set(form.items.map((item) => item.medicine_id).filter(Boolean));
  }, [form.items]);

  const totalRequestedUnits = useMemo(() => {
    return form.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }, [form.items]);

  const totalConsumedUnits = useMemo(() => {
    return form.items.reduce((sum, item) => sum + (Number(item.consumed_quantity) || 0), 0);
  }, [form.items]);

  const todayDateString = useMemo(() => new Date().toISOString().split("T")[0], []);

  return (
    <ModalShell
      labelledBy="paper-request-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="max-w-3xl w-full p-0 overflow-hidden rounded-2xl bg-white shadow-2xl border border-neutral-100"
    >
      <form onSubmit={(e) => onSubmit(e, { proceedToRelease: false })} className="w-full flex max-h-[90vh] flex-col overflow-hidden">
        {/* Modal Header */}
        <header className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 bg-neutral-50/50">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="paper-request-title" className="text-base font-black text-neutral-900 tracking-tight">
                  Record Manual Requisition
                </h2>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                  Paper Slip Entry
                </span>
              </div>
              <p className="text-[11px] font-medium text-neutral-500 mt-0.5">
                Record paper requests from health stations and update their stock.
              </p>
            </div>
          </div>
        </header>

        {/* Modal Body */}
        <div className="prds-modal-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <p className="flex-1">{error}</p>
            </div>
          )}

          {/* Section 1: Requisition Origin & Reference */}
          <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-800 uppercase tracking-wider">
              <Building2 className="h-4 w-4 text-emerald-600" />
              <span>Requisition Details</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Requesting Barangay Health Station <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.facility_id}
                  onChange={(event) => onChange("facility_id", event.target.value)}
                  className="w-full h-10 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                >
                  <option value="">Select barangay station...</option>
                  {healthCenterFacilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.facility_name} ({facility.facility_code || "BHC"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  RIS No.
                </label>
                <input
                  type="text"
                  value={form.paper_slip_reference || ""}
                  onChange={(event) => onChange("paper_slip_reference", event.target.value)}
                  placeholder="e.g. RIS-2026-10-042"
                  className="w-full h-10 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition placeholder:text-neutral-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    max={todayDateString}
                    value={form.request_date || todayDateString}
                    onChange={(event) => onChange("request_date", event.target.value)}
                    className="w-full h-10 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  BHW / Midwife Representative
                </label>
                <input
                  type="text"
                  value={form.manual_requested_by}
                  onChange={(event) => onChange("manual_requested_by", event.target.value)}
                  placeholder="e.g. Maria Santos (Midwife / BHW)"
                  className="w-full h-10 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition placeholder:text-neutral-400"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Requested Medicines */}
          <div className="rounded-xl border border-neutral-200/80 bg-white p-4 space-y-3.5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <Pill className="h-4 w-4 text-emerald-600" />
                <h3 className="text-xs font-black uppercase tracking-wider text-neutral-800">
                  Requested Medicines
                </h3>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10.5px] font-bold text-neutral-600">
                  {form.items.length} {form.items.length === 1 ? "item line" : "item lines"}
                </span>
              </div>
              <button
                type="button"
                onClick={onAddItem}
                className="btn-primary inline-flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-bold text-white transition shadow-xs cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Medicine Line</span>
              </button>
            </div>

            <div className="space-y-3">
              {form.items.map((item, index) => {
                const selectedMed = medicinesMap.get(item.medicine_id);
                const bhsStock = item.medicine_id ? bhsStockMap.get(item.medicine_id) ?? 0 : 0;
                const warehouseStock = item.medicine_id ? warehouseStockMap.get(item.medicine_id) ?? 0 : 0;
                const requestedQty = Number(item.quantity) || 0;
                const consumedQty = Number(item.consumed_quantity) || 0;
                const stationName = selectedFacility?.facility_name || "BHS Station";

                const remainingBeforeRelease = Math.max(0, bhsStock - consumedQty);
                const postReleaseStock = remainingBeforeRelease + requestedQty;

                return (
                  <div
                    key={index}
                    className="rounded-xl border border-neutral-200/90 bg-[#fafbfc] hover:border-neutral-300 p-3.5 transition space-y-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-neutral-200/80 text-[11px] font-black text-neutral-700 mt-1">
                        #{index + 1}
                      </span>

                      {/* Medicine Search Dropdown */}
                      <div className="flex-1 min-w-0">
                        <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                          Medicine <span className="text-red-500">*</span>
                        </label>
                        <ManualMedicineSearchDropdown
                          medicines={medicines}
                          value={item.medicine_id}
                          onChange={(medId) => onUpdateItem(index, "medicine_id", medId)}
                          otherSelectedIds={selectedMedicineIds}
                          bhsStockMap={bhsStockMap}
                          warehouseStockMap={warehouseStockMap}
                          stationName={stationName}
                        />

                        {/* Medicine details badge */}
                        {selectedMed && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                            <span className="inline-flex items-center rounded-md bg-blue-50 border border-blue-200/80 px-2 py-0.5 font-bold text-blue-700">
                              Unit: {selectedMed.unit_of_measure || "units"}
                            </span>
                            {form.facility_id && (
                              <span
                                className={`inline-flex items-center rounded-md px-2 py-0.5 font-bold border ${
                                  bhsStock > 0
                                    ? "bg-purple-50 border-purple-200 text-purple-800"
                                    : "bg-neutral-100 border-neutral-200 text-neutral-600"
                                }`}
                              >
                                Station Stock: {bhsStock.toLocaleString()} {selectedMed.unit_of_measure || "units"}
                              </span>
                            )}
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-0.5 font-bold border ${
                                warehouseStock > 0
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                  : "bg-amber-50 border-amber-200 text-amber-800"
                              }`}
                            >
                              {warehouseStock > 0
                                ? `CHO Stock: ${warehouseStock.toLocaleString()} ${selectedMed.unit_of_measure || "units"}`
                                : "Zero Stock in CHO Warehouse"}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Remove button */}
                      <div className="pt-6">
                        <button
                          type="button"
                          onClick={() => onRemoveItem(index)}
                          disabled={form.items.length === 1}
                          title={form.items.length === 1 ? "At least one item line is required" : "Remove this medicine line"}
                          className="grid h-9.5 w-9.5 place-items-center rounded-lg border border-neutral-200 bg-white text-neutral-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition disabled:opacity-30 disabled:hover:text-neutral-400 disabled:hover:border-neutral-200 disabled:hover:bg-white cursor-pointer"
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Quantities Row */}
                    {selectedMed && (
                      <div className="grid gap-3 sm:grid-cols-2 pt-1 border-t border-neutral-200/60">
                        {/* Consumed Quantity */}
                        <div>
                          <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                            Quantity Consumed
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              value={item.consumed_quantity ?? ""}
                              onChange={(event) => onUpdateItem(index, "consumed_quantity", event.target.value)}
                              placeholder="0"
                              className="w-full h-9 rounded-lg border border-neutral-200 bg-white pl-3 pr-12 text-xs font-bold text-neutral-800 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] font-bold text-neutral-400 pointer-events-none truncate max-w-[36px]">
                              {selectedMed?.unit_of_measure || "units"}
                            </span>
                          </div>
                        </div>

                        {/* Requested Quantity */}
                        <div>
                          <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                            Quantity Requested <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(event) => onUpdateItem(index, "quantity", event.target.value)}
                              placeholder="0"
                              className="w-full h-9 rounded-lg border border-neutral-200 bg-white pl-3 pr-12 text-xs font-bold text-neutral-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] font-bold text-neutral-400 pointer-events-none truncate max-w-[36px]">
                              {selectedMed?.unit_of_measure || "qty"}
                            </span>
                          </div>
                        </div>

                        {/* Alpaco Inventory Tracking Live Calculation Banner */}
                        {form.facility_id && (requestedQty > 0 || consumedQty > 0) && (
                          <div className="sm:col-span-2 rounded-lg bg-emerald-50/70 border border-emerald-200/80 px-3 py-2 flex items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-1.5 text-emerald-900 font-semibold text-[11px]">
                              <span className="font-bold text-emerald-700">💡 Stock Calculation:</span>
                              <span>Previous ({bhsStock})</span>
                              <span>-</span>
                              <span>Consumed ({consumedQty})</span>
                              <span>=</span>
                              <span className="font-bold text-purple-800">{remainingBeforeRelease} remaining</span>
                              <span>➔</span>
                              <span className="font-black text-emerald-800">Post-Release Stock: {postReleaseStock} {selectedMed.unit_of_measure || "units"}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Total Requested & Summary above Remarks */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200/80 bg-neutral-50/70 px-4 py-2.5 text-xs font-bold text-neutral-700">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-emerald-600" />
              <span>
                Total Requested: <strong className="text-emerald-700 font-black">{totalRequestedUnits.toLocaleString()} units</strong>
              </span>
            </div>
            {totalConsumedUnits > 0 && (
              <div className="flex items-center gap-1.5 text-purple-800">
                <span>
                  Total Consumed: <strong className="font-bold">{totalConsumedUnits.toLocaleString()} units</strong>
                </span>
              </div>
            )}
          </div>

          {/* Section 3: Remarks */}
          <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-800 uppercase tracking-wider">
              <FileText className="h-4 w-4 text-neutral-600" />
              <span>Remarks</span>
            </div>
            <textarea
              value={form.remarks}
              onChange={(event) => onChange("remarks", event.target.value)}
              rows="2"
              placeholder="Optional notes or delivery specifications..."
              className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition placeholder:text-neutral-400"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <footer className="flex items-center justify-between border-t border-neutral-100 px-6 py-3.5 bg-neutral-50/60">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-9 rounded-lg border border-neutral-200 bg-white px-4 text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={(e) => onSubmit(e, { proceedToRelease: false })}
              className="h-9 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 px-4 text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save as Pending"}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={(e) => onSubmit(e, { proceedToRelease: true })}
              className="h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 text-xs font-bold text-white transition shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? "Processing..." : "Save & Release Now"}
            </button>
          </div>
        </footer>
      </form>
    </ModalShell>
  );
}
