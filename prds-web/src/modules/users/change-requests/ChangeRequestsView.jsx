import ChangeRequestEmptyState from "./ChangeRequestEmptyState";
import ChangeRequestFilters from "./ChangeRequestFilters";
import FacilityChangeRequestCard from "./FacilityChangeRequestCard";
import { SearchIcon } from "../components/UserManagementIcons";

export default function ChangeRequestsView({
  dateFilter,
  isLoading,
  isSaving,
  onDateFilterChange,
  onReview,
  onSearchChange,
  onStatusFilterChange,
  requests,
  searchTerm,
  statusFilter,
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#007f5f]">Facility Changes</p>
            <h2 className="mt-1 text-base font-black text-black">Facility Change Requests</h2>
            <p className="mt-1 text-xs font-semibold text-neutral-500">
              Review requested facility updates from user profile settings.
            </p>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
            {requests.length} shown
          </span>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_12rem_auto] xl:items-end">
          <label className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search requester, barangay, facility, reason, date, or status..."
              className="h-11 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
              Date
            </span>
            <input
              aria-label="Filter facility changes by date"
              type="date"
              value={dateFilter}
              onChange={(event) => onDateFilterChange(event.target.value)}
              className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-bold text-neutral-700 outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/30"
            />
          </label>
          <ChangeRequestFilters
            onStatusFilterChange={onStatusFilterChange}
            statusFilter={statusFilter}
          />
        </div>
      </div>

      <div className="space-y-3 bg-[#f8f9ff] p-4">
        {isLoading ? (
          <RequestSkeleton />
        ) : requests.length === 0 ? (
          <ChangeRequestEmptyState />
        ) : (
          requests.map((request) => (
            <FacilityChangeRequestCard
              key={request.id}
              isSaving={isSaving}
              onReview={onReview}
              request={request}
            />
          ))
        )}
      </div>
    </section>
  );
}

function RequestSkeleton() {
  return Array.from({ length: 3 }, (_, index) => (
    <div key={index} className="rounded-xl border border-neutral-100 bg-white p-4">
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
