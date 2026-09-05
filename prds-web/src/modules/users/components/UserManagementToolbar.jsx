import { roleOptions } from "../userManagementUtils";
import { SearchIcon } from "./UserManagementIcons";

export default function UserManagementToolbar({
  activeView,
  onRoleFilterChange,
  onSearchChange,
  roleFilter,
  searchTerm,
}) {
  const isChangeRequests = activeView === "change-requests";

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className={`grid gap-3 ${isChangeRequests ? "" : "xl:grid-cols-[1fr_220px]"}`}>
        <label className="relative block">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={
              isChangeRequests
                ? "Search requester, facility, reason, or status..."
                : "Search user name, email, phone, role, or facility..."
            }
            className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/30"
          />
        </label>

        {!isChangeRequests ? (
          <select
            value={roleFilter}
            onChange={(event) => onRoleFilterChange(event.target.value)}
            className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-bold text-neutral-700 outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/30"
          >
            <option value="ALL">All roles</option>
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </section>
  );
}
