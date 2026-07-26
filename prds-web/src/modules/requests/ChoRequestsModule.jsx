import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { formatDateTime } from "../dashboard/dashboardUtils";
import { getRequestsData, reviewMedicineRequest } from "./RequestsService";
import {
  formatRequestDate,
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
  requestStatuses,
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

export default function ChoRequestsModule() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [inventoryRows, setInventoryRows] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [facilityId, setFacilityId] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortMode, setSortMode] = useState("newest");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [remarks, setRemarks] = useState("");
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

  const handleReview = async (request, status) => {
    if (!profile?.id || isSaving) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const updatedRequest = await reviewMedicineRequest({
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
        <SummaryCard
          icon={<RequestIcon />}
          label="Total Requests"
          value={summary.total}
          note="All facilities"
        />
        <SummaryCard
          active
          icon={<ClockIcon />}
          label="Pending Approval"
          value={summary.pending}
          note="Requires CHO action"
        />
        <SummaryCard
          icon={<TransitIcon />}
          label="Approved"
          value={summary.inTransit}
          note="Ready for fulfillment"
        />
        <SummaryCard
          icon={<CheckIcon />}
          label="Completed"
          value={summary.completed}
          note="Fulfilled requests"
        />
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-4">
          <div>
            <h2 className="text-base font-black text-black">Active Distribution Requests</h2>
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
            <SelectFilter value={statusFilter} onChange={setStatusFilter} options={requestStatuses} />
            <SelectFilter value={sortMode} onChange={setSortMode} options={requestSortOptions} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1050px] w-full border-collapse text-left">
            <thead className="bg-neutral-50">
              <tr className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">
                <th className="px-4 py-3">Request ID</th>
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
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
            Select a facility to review request history for one health center.
          </span>
        </div>
      </section>

      {selectedRequestDetails && (
        <RequestDetailsModal
          isSaving={isSaving}
          onClose={() => {
            setSelectedRequest(null);
            setRemarks("");
          }}
          onReview={handleReview}
          remarks={remarks}
          request={selectedRequestDetails}
          setRemarks={setRemarks}
          stockMap={stockMap}
        />
      )}
    </AdminShell>
  );
}

function SummaryCard({ active = false, icon, label, note, value }) {
  return (
    <article
      className={`rounded-xl border p-5 shadow-sm ${
        active ? "border-neutral-900 bg-neutral-950 text-white" : "border-neutral-200 bg-white text-black"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-black uppercase tracking-[0.14em] ${active ? "text-blue-300" : "text-neutral-500"}`}>
            {label}
          </p>
          <p className="mt-5 text-3xl font-black">{value}</p>
          <p className={`mt-1 text-xs font-semibold ${active ? "text-neutral-400" : "text-neutral-500"}`}>
            {note}
          </p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${active ? "bg-blue-500 text-white" : "bg-neutral-50 text-neutral-500"}`}>
          {icon}
        </span>
      </div>
    </article>
  );
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
                onClick={() => onReview(request, "APPROVED")}
                className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                Approve
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
  onClose,
  onReview,
  remarks,
  request,
  setRemarks,
  stockMap,
}) {
  const priority = getRequestPriority(request);
  const canReview = request.status === "PENDING";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
      <article className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-black text-black">{getRequestNumber(request.id)}</h2>
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
                disabled={isSaving}
                onClick={() => onReview(request, "APPROVED")}
                className="h-10 rounded-lg bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                Approve Request
              </button>
            </>
          )}
        </footer>
      </article>
    </div>
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

const SearchIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
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
