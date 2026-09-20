import {
  formatDate,
  formatDateTime,
  formatFacilityLabel,
  getFullName,
  getInitials,
  getRoleLabel,
} from "../userManagementUtils";
import { RequestStatusBadge } from "../components/UserManagementBadges";
import { SwapIcon } from "../components/UserManagementIcons";

export default function FacilityChangeRequestCard({ isSaving, onReview, request }) {
  return (
    <article className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-[#6be9c2]/60 xl:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6be9c2]/35 text-xs font-black text-[#0d1117]">
            {getInitials(request.profile)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-black">{getFullName(request.profile)}</h3>
              <RequestStatusBadge status={request.status} />
            </div>
            <p className="mt-1 text-xs font-semibold text-neutral-500">
              {getRoleLabel(request.profile?.role)} - Submitted {formatDateTime(request.created_at)}
            </p>
          </div>
          </div>
          <p className="rounded-full bg-neutral-50 px-3 py-1 text-xs font-black text-neutral-500">
            {request.reviewed_at ? `Reviewed ${formatDate(request.reviewed_at)}` : "Waiting for review"}
          </p>
        </div>

        <div className="mt-4 grid gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3 md:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)]">
          <FacilityBlock label="Current Facility" facility={request.current_facility} />
          <span className="hidden h-8 w-8 items-center justify-center self-center rounded-full bg-white text-neutral-400 ring-1 ring-neutral-100 md:flex">
            <SwapIcon />
          </span>
          <FacilityBlock label="New Facility" facility={request.requested_facility} highlight />
        </div>

        {request.reason ? (
          <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm leading-6 text-neutral-600 ring-1 ring-neutral-100">
            <span className="font-black text-neutral-800">Reason: </span>
            {request.reason}
          </p>
        ) : null}

        {request.reviewer ? (
          <p className="mt-3 text-xs font-semibold text-neutral-400">
            Reviewed by {getFullName(request.reviewer)}
          </p>
        ) : null}
      </div>

      {request.status === "PENDING" ? (
        <div className="flex items-center gap-2 xl:self-center">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => onReview(request, "APPROVED")}
            className="h-10 min-w-24 rounded-lg bg-black px-4 text-sm font-black text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
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
        <p className="self-center rounded-lg bg-neutral-50 px-3 py-2 text-sm font-bold text-neutral-500">
          Reviewed
        </p>
      )}
    </article>
  );
}

function FacilityBlock({ facility, highlight = false, label }) {
  return (
    <div className={`min-w-0 rounded-lg bg-white p-3 ring-1 ${highlight ? "ring-[#6be9c2]/50" : "ring-neutral-100"}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p className="mt-1 break-words text-sm font-black leading-5 text-black">{formatFacilityLabel(facility)}</p>
    </div>
  );
}
