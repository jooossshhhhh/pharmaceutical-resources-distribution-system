import {
  formatDate,
  formatDateTime,
  formatFacilityLabel,
  getFullName,
  getInitials,
  getRoleLabel,
} from "../userManagementUtils";
import { RequestStatusBadge } from "./UserManagementBadges";
import { SwapIcon } from "./UserManagementIcons";

export default function FacilityRequestsPanel({ isLoading, isSaving, onReview, requests }) {
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#007f5f]">Review Queue</p>
          <h2 className="mt-1 text-base font-black text-black">Facility Change Requests</h2>
          <p className="mt-1 text-xs font-semibold text-neutral-500">
            Approve or reject assigned facility changes requested from profile settings.
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
          {requests.length} shown
        </span>
      </div>

      <div className="divide-y divide-neutral-100">
        {isLoading ? (
          <RequestSkeleton />
        ) : requests.length === 0 ? (
          <RequestEmptyState />
        ) : (
          requests.map((request) => (
            <article key={request.id} className="grid gap-4 px-4 py-4 xl:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6be9c2]/35 text-xs font-black text-[#0d1117]">
                    {getInitials(request.profile)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-black text-black">{getFullName(request.profile)}</h3>
                      <RequestStatusBadge status={request.status} />
                    </div>
                    <p className="mt-1 text-xs font-semibold text-neutral-500">
                      {getRoleLabel(request.profile?.role)} · Requested {formatDateTime(request.created_at)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3 md:grid-cols-[1fr_auto_1fr]">
                  <FacilityBlock label="Current Facility" facility={request.current_facility} />
                  <span className="hidden self-center text-neutral-400 md:block">
                    <SwapIcon />
                  </span>
                  <FacilityBlock label="Requested Facility" facility={request.requested_facility} highlight />
                </div>

                {request.reason ? (
                  <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm leading-6 text-neutral-600 ring-1 ring-neutral-100">
                    {request.reason}
                  </p>
                ) : null}

                <p className="mt-3 text-xs font-semibold text-neutral-400">
                  {request.reviewer ? `Reviewed by ${getFullName(request.reviewer)}` : "Awaiting admin review"}
                </p>
              </div>

              {request.status === "PENDING" ? (
                <div className="flex items-center gap-2 xl:self-center">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => onReview(request, "APPROVED")}
                    className="h-10 rounded-lg bg-black px-4 text-sm font-black text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => onReview(request, "REJECTED")}
                    className="h-10 rounded-lg bg-red-50 px-4 text-sm font-black text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <p className="self-center text-sm font-bold text-neutral-400">
                  {request.reviewed_at ? formatDate(request.reviewed_at) : "Reviewed"}
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function FacilityBlock({ facility, highlight = false, label }) {
  return (
    <div className={`rounded-lg bg-white p-3 ring-1 ${highlight ? "ring-[#6be9c2]/50" : "ring-neutral-100"}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-black text-black">{formatFacilityLabel(facility)}</p>
    </div>
  );
}

function RequestSkeleton() {
  return Array.from({ length: 3 }, (_, index) => (
    <div key={index} className="px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 animate-pulse rounded-full bg-neutral-100" />
        <div className="grid gap-2">
          <span className="h-3 w-40 animate-pulse rounded bg-neutral-100" />
          <span className="h-3 w-56 animate-pulse rounded bg-neutral-100" />
        </div>
      </div>
      <div className="mt-4 h-20 animate-pulse rounded-xl bg-neutral-100" />
    </div>
  ));
}

function RequestEmptyState() {
  return (
    <div className="grid place-items-center px-4 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <SwapIcon />
      </span>
      <h3 className="mt-3 text-sm font-black text-black">No facility requests match this view</h3>
      <p className="mt-1 max-w-md text-sm font-medium text-neutral-500">
        Requests from profile settings will appear here when users ask to change facility.
      </p>
    </div>
  );
}
