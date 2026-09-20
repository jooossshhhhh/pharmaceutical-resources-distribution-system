import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import ModalShell from "../../components/ModalShell";
import PaginationControls from "../../components/PaginationControls";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import { formatDateTime } from "../dashboard/dashboardUtils";
import { FacilityPicker } from "../inventory/inventoryComponents";
import {
  createManualMedicineRequest,
  getRequestReleaseBatches,
  getRequestsData,
  reviewMedicineRequest,
} from "./RequestsService";
import {
  buildFefoBatchAllocations,
  formatRequestDate,
  getAllocatedQuantityForItem,
  getAllocationValidationError,
  getForecastDemandMap,
  getItemLabel,
  getMedicineFullLabel,
  getRequestNumber,
  getRequestPriority,
  getRequestSourceLabel,
  getRequestSummary,
  getRequestTotalQuantity,
  getStockMap,
  matchesRequestFilters,
  requestPriorityOptions,
  requestSortOptions,
  sortRequests,
  validateManualPaperRequest,
} from "./requestUtils";
import {
  CheckIcon as UiCheckIcon,
  ClockIcon,
  CloseIcon as UiCloseIcon,
  FilterDropdown,
  PlusIcon,
  RequestEmptyState,
  RequestIcon,
  RequestPanel,
  RequestPanelHeader,
  RequestPriorityBadge,
  RequestSearchInput,
  RequestStatusBadge,
  SmallCheckIcon,
  SortIcon,
  TruckIcon,
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
  const [currentStep, setCurrentStep] = useState("REQUEST");
  const [remarks, setRemarks] = useState("");
  const [releaseBatches, setReleaseBatches] = useState([]);
  const [releaseAllocations, setReleaseAllocations] = useState([]);
  const [isReleaseLoading, setIsReleaseLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [releaseError, setReleaseError] = useState("");
  const [isManualRequestOpen, setIsManualRequestOpen] = useState(false);
  const [manualRequestForm, setManualRequestForm] = useState({
    facility_id: "",
    items: [{ medicine_id: "", quantity: "" }],
    manual_requested_by: "",
    remarks: "",
  });
  const [manualRequestError, setManualRequestError] = useState("");
  const [isSavingManualRequest, setIsSavingManualRequest] = useState(false);

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
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  };

  const resetFlow = () => {
    setSelectedRequest(null);
    setCurrentStep("REQUEST");
    setRemarks("");
    setReviewError("");
    setReleaseError("");
    setReleaseBatches([]);
    setReleaseAllocations([]);
  };

  const openRequest = (request) => {
    setSelectedRequest(request);
    setCurrentStep(request.status === "PENDING" ? "ALLOCATION" : "REVIEW AND APPROVAL");
    setRemarks(request.remarks || "");
    setReviewError("");
    setReleaseError("");
    setReleaseBatches([]);
    setReleaseAllocations([]);
  };

  const updateManualRequestItem = (index, field, value) => {
    setManualRequestForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const saveManualRequest = async (event) => {
    event.preventDefault();
    const validationError = validateManualPaperRequest({
      facilityId: manualRequestForm.facility_id,
      items: manualRequestForm.items,
    });

    if (validationError) {
      setManualRequestError(validationError);
      return;
    }

    setIsSavingManualRequest(true);
    setManualRequestError("");

    try {
      await createManualMedicineRequest({
        facilityId: manualRequestForm.facility_id,
        items: manualRequestForm.items,
        manualRequestedBy: manualRequestForm.manual_requested_by.trim(),
        remarks: manualRequestForm.remarks.trim(),
      });
      setIsManualRequestOpen(false);
      setManualRequestForm({
        facility_id: "",
        items: [{ medicine_id: "", quantity: "" }],
        manual_requested_by: "",
        remarks: "",
      });
      setStatusFilter("PENDING");
      await loadRequests();
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
    if (
      !selectedRequestDetails ||
      selectedRequestDetails.status !== "PENDING" ||
      currentStep === "REQUEST" ||
      currentStep === "RELEASE"
    ) {
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
            allocations: allocationsForRequest.length > 0 ? allocationsForRequest : activeAllocations,
            profileId: profile.id,
            remarks,
            requestId: request.id,
            status: "APPROVED",
          })
        );
      }

      setSelectedRequest({
        ...selectedRequestDetails,
        status: "COMPLETED",
        requests: updatedRequests.map((request) => ({ ...request, status: "COMPLETED" })),
      });
      setCurrentStep("RELEASE");
      setStatusFilter("COMPLETED");
      await loadRequests();
    } catch (saveError) {
      setReviewError(saveError.message);
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

      <div className="motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out">
        {currentStep === "REQUEST" && (
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
        )}

        {currentStep === "ALLOCATION" && selectedRequestDetails && (
          <AllocationStep
            allocationError={allocationError}
            isLoading={isReleaseLoading}
            onBack={resetFlow}
            onProceed={() => {
              if (allocationError) {
                setReviewError(allocationError);
                return;
              }
              setReviewError("");
              setCurrentStep("REVIEW AND APPROVAL");
            }}
            onReleaseQuantityChange={updateReleaseQuantity}
            releaseAllocations={releaseAllocations}
            releaseBatches={releaseBatches}
            releaseError={releaseError}
            request={selectedRequestDetails}
          />
        )}

        {currentStep === "REVIEW AND APPROVAL" && selectedRequestDetails && (
          <ReviewApprovalStep
            allocations={activeAllocations}
            approverName={getProfileName(profile)}
            isSaving={isSaving}
            onBack={() =>
              selectedRequestDetails.status === "PENDING"
                ? setCurrentStep("ALLOCATION")
                : resetFlow()
            }
            onRelease={releaseRequest}
            releaseBatches={releaseBatches}
            remarks={remarks}
            request={selectedRequestDetails}
            reviewError={reviewError}
            setRemarks={setRemarks}
          />
        )}

        {currentStep === "RELEASE" && selectedRequestDetails && (
          <ReleaseStep onBackToRequests={resetFlow} request={selectedRequestDetails} />
        )}
      </div>

      {isManualRequestOpen && (
        <ManualPaperRequestModal
          error={manualRequestError}
          facilities={facilities.filter((facility) => facility.facility_type === "HEALTH_CENTER")}
          form={manualRequestForm}
          isSaving={isSavingManualRequest}
          medicines={medicines}
          onAddItem={() =>
            setManualRequestForm((current) => ({
              ...current,
              items: [...current.items, { medicine_id: "", quantity: "" }],
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
      icon: <RequestIcon />,
      id: "total",
      label: "Total Requests",
      onClick: () => onSelectStatus("ALL"),
      tone: "teal",
      value: summary.total,
    },
    {
      active: statusFilter === "PENDING",
      description: "Awaiting CHO action",
      icon: <ClockIcon />,
      id: "pending",
      label: "Pending Review",
      onClick: () => onSelectStatus(statusFilter === "PENDING" ? "ALL" : "PENDING"),
      tone: "amber",
      value: summary.pending,
    },
    {
      active: statusFilter === "APPROVED",
      description: "Ready for release / pickup",
      icon: <TruckIcon />,
      id: "approved",
      label: "Approved",
      onClick: () => onSelectStatus(statusFilter === "APPROVED" ? "ALL" : "APPROVED"),
      tone: "blue",
      value: summary.inTransit,
    },
    {
      active: statusFilter === "COMPLETED",
      description: "Fulfilled requisitions",
      icon: <SmallCheckIcon />,
      id: "completed",
      label: "Completed",
      onClick: () => onSelectStatus(statusFilter === "COMPLETED" ? "ALL" : "COMPLETED"),
      tone: "emerald",
      value: summary.completed,
    },
  ];

  const toneClasses = {
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    teal: "bg-[#e8fff7] text-[#007f5f] ring-[#6be9c2]/40",
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={card.onClick}
          className={`group rounded-xl border bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
            card.active ? "border-[#6be9c2] ring-2 ring-[#6be9c2]/30" : "border-neutral-200"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${
                toneClasses[card.tone]
              }`}
            >
              {card.icon}
            </span>
            {card.active && (
              <span className="rounded-full bg-[#6be9c2]/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#0d1117]">
                Selected
              </span>
            )}
          </div>
          <p className="mt-3 text-2xl font-black text-black">{card.value}</p>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
            {card.label}
          </p>
          <p className="mt-1 line-clamp-1 text-xs font-semibold text-neutral-500">
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
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#0d1117] px-4 text-xs font-black text-white shadow-sm transition hover:bg-neutral-800"
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
              <thead className="bg-[#f7f6f3] border-b border-neutral-100">
                <tr className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">
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

function AllocationStep({
  allocationError,
  isLoading,
  onBack,
  onProceed,
  onReleaseQuantityChange,
  releaseAllocations,
  releaseBatches,
  releaseError,
  request,
}) {
  return (
    <RequestPanel>
      <RequestPanelHeader
        eyebrow="Allocation"
        title={getRequestDisplayNumber(request)}
        subtitle="Review requested medicine and set the release quantity CHO will provide."
        actions={<RequestStatusBadge status={request.status} />}
      />

      <div className="space-y-4 bg-neutral-50/40 p-4">
        <RequestContextCards request={request} />

        {isLoading ? (
          <p className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm font-bold text-neutral-500">
            Loading CHO lot inventory...
          </p>
        ) : releaseError ? (
          <p className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-700">
            {releaseError}
          </p>
        ) : (
          <div className="space-y-3">
            {(request.items || []).map((item) => {
              const itemBatches = releaseBatches.filter(
                (batch) => batch.request_item_id === item.id
              );
              const requestedQuantity = Number(item.quantity || 0);
              const releasedQuantity = getAllocatedQuantityForItem(item.id, releaseAllocations);
              const availableQuantity = itemBatches.reduce(
                (total, batch) => total + Number(batch.quantity || 0),
                0
              );
              const remainingStock = Math.max(0, availableQuantity - releasedQuantity);

              return (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
                >
                  <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_160px_160px_160px] lg:items-center">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-black text-black">
                        {getItemLabel(item)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-neutral-500">
                        {item.medicine?.brand_name || "No brand"} -{" "}
                        {item.medicine?.unit_of_measure || "No measurement"}
                      </p>
                    </div>
                    <QuantityStat label="Needed quantity" value={requestedQuantity} />
                    <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-neutral-500">
                      Release quantity
                      <input
                        type="number"
                        min="0"
                        max={Math.min(requestedQuantity, availableQuantity)}
                        value={releasedQuantity || ""}
                        onChange={(event) => onReleaseQuantityChange(item, event.target.value)}
                        className="h-9 w-28 rounded-lg border border-neutral-200 px-2 text-right text-sm font-black normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      />
                    </label>
                    <QuantityStat
                      label="Central Stock"
                      value={remainingStock}
                      subtext={releasedQuantity > 0 ? `Initial: ${availableQuantity.toLocaleString()}` : null}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {allocationError && (
          <p role="alert" className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700">
            {allocationError}
          </p>
        )}

        <FlowFooter
          backLabel="Back to Requests"
          nextLabel="Proceed to Review"
          onBack={onBack}
          onNext={onProceed}
          nextDisabled={isLoading || Boolean(releaseError) || Boolean(allocationError)}
        />
      </div>
    </RequestPanel>
  );
}

function ReviewApprovalStep({
  allocations,
  approverName,
  isSaving,
  onBack,
  onRelease,
  remarks,
  request,
  reviewError,
  setRemarks,
}) {
  const isPending = request.status === "PENDING";
  const displayedAllocations = isPending
    ? allocations
    : (request.fulfillments || []).map((fulfillment) => ({
        request_item_id: fulfillment.request_item_id,
        source_inventory_id: fulfillment.source_inventory_id,
        quantity: fulfillment.quantity,
      }));

  return (
    <RequestPanel>
      <RequestPanelHeader
        eyebrow="Review and Approval"
        title={getRequestDisplayNumber(request)}
        subtitle="Final check before CHO releases the approved quantities."
        actions={<RequestStatusBadge status={request.status} />}
      />

      <div className="space-y-4 bg-neutral-50/40 p-4">
        <RequestContextCards request={request} approverName={approverName} />

        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-4 py-3">
            <h3 className="text-sm font-black text-black">Allocated medicines</h3>
            <p className="mt-1 text-xs font-semibold text-neutral-500">
              Needed quantity stays from the original request. Release quantity is what CHO will provide.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[560px] w-full border-collapse text-left text-sm">
              <thead className="bg-neutral-50 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Medicine</th>
                  <th className="px-4 py-3 text-right">Needed quantity</th>
                  <th className="px-4 py-3 text-right">Release quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(request.items || []).map((item) => {
                  const releaseQuantity = getAllocatedQuantityForItem(item.id, displayedAllocations);

                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <p className="font-black text-black">{getItemLabel(item)}</p>
                        <p className="mt-1 text-xs font-semibold text-neutral-500">
                          {item.medicine?.brand_name || "No brand"} -{" "}
                          {item.medicine?.unit_of_measure || "No measurement"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-neutral-800">
                        {Number(item.quantity || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-neutral-800">
                        {releaseQuantity.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-500">
          CHO remarks
          <textarea
            value={remarks}
            disabled={!isPending}
            onChange={(event) => setRemarks(event.target.value)}
            rows="3"
            placeholder="Optional approval or release note..."
            className="resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-neutral-50"
          />
        </label>

        {reviewError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {reviewError}
          </p>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="h-10 rounded-lg bg-neutral-100 px-5 text-sm font-black text-neutral-700 hover:bg-neutral-200"
          >
            {isPending ? "Back to Allocation" : "Back to Requests"}
          </button>
          {isPending && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={onRelease}
                className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                {isSaving ? "Releasing..." : "Release"}
              </button>
            </div>
          )}
        </footer>
      </div>
    </RequestPanel>
  );
}

function ReleaseStep({ onBackToRequests, request }) {
  return (
    <RequestPanel>
      <RequestPanelHeader
        eyebrow="Release"
        title="Request completed"
        subtitle="The released medicines were recorded and moved to completed request history."
        actions={<RequestStatusBadge status="COMPLETED" />}
      />
      <div className="bg-neutral-50/40 p-4">
        <div className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <UiCheckIcon />
          </span>
          <h3 className="mt-4 text-lg font-black text-black">{getRequestDisplayNumber(request)}</h3>
          <p className="mt-1 text-sm font-semibold text-neutral-600">
            Released to {request.facility?.facility_name || "the requesting facility"}.
          </p>
          <button
            type="button"
            onClick={onBackToRequests}
            className="mt-5 h-10 rounded-lg bg-black px-5 text-sm font-black text-white hover:bg-neutral-800"
          >
            Back to Requests
          </button>
        </div>
      </div>
    </RequestPanel>
  );
}

function RequestContextCards({ approverName, request }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <DetailCard label="Requesting facility">
        <p className="font-black text-black">{request.facility?.facility_name || "No facility"}</p>
      </DetailCard>
      <DetailCard label="Request type">
        <p className="font-black text-black">
          {request.isGrouped ? getGroupedSourceLabel(request) : getRequestSourceLabel(request)}
        </p>
      </DetailCard>
      <DetailCard label={approverName ? "Approver" : "Request date"}>
        <p className="font-black text-black">
          {approverName || formatRequestDate(request.request_date)}
        </p>
        <p className="mt-1 text-xs font-semibold text-neutral-500">
          {approverName ? "Based on current session" : "Submitted request"}
        </p>
      </DetailCard>
    </div>
  );
}

function DetailCard({ children, label }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function QuantityStat({ label, subtext, value }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-black text-neutral-900">
        {Number(value || 0).toLocaleString()}
      </p>
      {subtext && (
        <p className="text-[11px] font-semibold text-neutral-400">{subtext}</p>
      )}
    </div>
  );
}

function FlowFooter({ backLabel, nextDisabled, nextLabel, onBack, onNext }) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        onClick={onBack}
        className="h-10 rounded-lg bg-neutral-100 px-5 text-sm font-black text-neutral-700 hover:bg-neutral-200"
      >
        {backLabel}
      </button>
      <button
        type="button"
        disabled={nextDisabled}
        onClick={onNext}
        className="h-10 rounded-lg bg-black px-5 text-sm font-black text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {nextLabel}
      </button>
    </footer>
  );
}

function ManualPaperRequestModal({
  error,
  facilities,
  form,
  isSaving,
  medicines,
  onAddItem,
  onChange,
  onClose,
  onRemoveItem,
  onSubmit,
  onUpdateItem,
}) {
  return (
    <ModalShell
      labelledBy="paper-request-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="max-w-3xl"
    >
      <form onSubmit={onSubmit} className="w-full overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
              Manual Request
            </p>
            <h2 id="paper-request-title" className="mt-1 text-lg font-black text-black">
              Add Request
            </h2>
            <p className="mt-1 text-sm font-semibold text-neutral-500">
              Save the barangay paper list as a pending request for CHO review and release.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-800">
            <UiCloseIcon />
          </button>
        </header>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              {error}
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-black uppercase tracking-wide text-neutral-500">
              Requesting barangay
              <select
                value={form.facility_id}
                onChange={(event) => onChange("facility_id", event.target.value)}
                className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">Select barangay facility</option>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.facility_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-black uppercase tracking-wide text-neutral-500">
              Paper requester
              <input
                value={form.manual_requested_by}
                onChange={(event) => onChange("manual_requested_by", event.target.value)}
                placeholder="Optional name from paper list"
                className="h-10 rounded-lg border border-neutral-200 px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>

          <section className="rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              <h3 className="text-sm font-black text-black">Medicines</h3>
              <button type="button" onClick={onAddItem} className="h-8 rounded-lg bg-neutral-900 px-3 text-xs font-black text-white">
                Add line
              </button>
            </div>
            <div className="space-y-2 p-3">
              {form.items.map((item, index) => (
                <div key={index} className="grid gap-2 rounded-lg bg-neutral-50 p-2 md:grid-cols-[minmax(0,1fr)_120px_72px]">
                  <select
                    value={item.medicine_id}
                    onChange={(event) => onUpdateItem(index, "medicine_id", event.target.value)}
                    className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="">Select medicine</option>
                    {medicines.map((medicine) => (
                      <option key={medicine.id} value={medicine.id}>
                        {getMedicineFullLabel(medicine)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(event) => onUpdateItem(index, "quantity", event.target.value)}
                    placeholder="Quantity"
                    className="h-10 rounded-lg border border-neutral-200 px-3 text-sm font-semibold text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    disabled={form.items.length === 1}
                    className="h-10 rounded-lg border border-neutral-200 bg-white text-xs font-black text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          <label className="grid gap-1.5 text-xs font-black uppercase tracking-wide text-neutral-500">
            Remarks
            <textarea
              value={form.remarks}
              onChange={(event) => onChange("remarks", event.target.value)}
              rows="3"
              placeholder="Optional note from paper request..."
              className="resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
        </div>

        <footer className="flex justify-end gap-2 border-t border-neutral-100 px-5 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-lg bg-neutral-50 px-5 text-sm font-black text-neutral-700 hover:bg-neutral-100">
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="h-10 rounded-lg bg-black px-5 text-sm font-black text-white hover:bg-neutral-800 disabled:opacity-50">
            {isSaving ? "Saving..." : "Save Pending Request"}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}
