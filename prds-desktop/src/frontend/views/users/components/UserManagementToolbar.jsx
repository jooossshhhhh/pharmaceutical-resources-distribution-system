import { roleOptions } from "@shared/utils/userManagementUtils";
import { SearchIcon } from "./UserManagementIcons";

export default function UserManagementToolbar({
  facilities = [],
  facilityFilter = "ALL",
  hasActiveFilters = false,
  onFacilityFilterChange,
  onResetFilters,
  onRoleFilterChange,
  onSearchChange,
  roleFilter = "ALL",
  searchTerm = "",
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Search input with clear button */}
        <div className="relative min-w-0 flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search user name, email, phone, role, or facility..."
            className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-8 text-sm font-semibold text-[#0d1117] outline-none transition placeholder:text-neutral-400 focus:border-[#00a36c] focus:ring-2 focus:ring-emerald-100"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Role Filter */}
        <select
          value={roleFilter}
          onChange={(event) => onRoleFilterChange(event.target.value)}
          className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-bold text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-emerald-100 cursor-pointer"
        >
          <option value="ALL">All Roles</option>
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Facility Filter */}
        <select
          value={facilityFilter}
          onChange={(event) => onFacilityFilterChange?.(event.target.value)}
          className="h-10 max-w-xs rounded-lg border border-neutral-200 bg-white px-3 text-xs font-bold text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-emerald-100 cursor-pointer"
        >
          <option value="ALL">All Facilities</option>
          <option value="NONE">No facility assigned</option>
          {facilities.map((facility) => (
            <option key={facility.id} value={facility.id}>
              {facility.facility_name}
            </option>
          ))}
        </select>

        {/* Reset button if any filter is active */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 text-xs font-bold text-neutral-600 transition hover:bg-neutral-100 hover:text-black cursor-pointer shrink-0"
          >
            Reset Filters
          </button>
        )}
      </div>
    </section>
  );
}
