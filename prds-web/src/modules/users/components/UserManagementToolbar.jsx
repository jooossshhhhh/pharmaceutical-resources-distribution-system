import { roleOptions } from "../userManagementUtils";
import { SearchIcon } from "./UserManagementIcons";

export default function UserManagementToolbar({
  activeView,
  onRoleFilterChange,
  onSearchChange,
  onViewChange,
  pendingRequests,
  roleFilter,
  searchTerm,
}) {
  return (
    <section className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="inline-flex w-fit rounded-xl bg-neutral-100 p-1">
          <ViewButton active={activeView === "accounts"} onClick={() => onViewChange("accounts")}>
            Accounts
          </ViewButton>
          <ViewButton active={activeView === "requests"} onClick={() => onViewChange("requests")}>
            Facility Requests
            {pendingRequests ? (
              <span className="ml-2 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-black text-white">
                {pendingRequests}
              </span>
            ) : null}
          </ViewButton>
        </div>

        <div className="grid flex-1 gap-3 xl:grid-cols-[1fr_220px]">
          <label className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={
                activeView === "requests"
                  ? "Search requester, facility, reason, or status..."
                  : "Search user name, email, phone, role, or facility..."
              }
              className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/30"
            />
          </label>

          {activeView === "accounts" ? (
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
          ) : (
            <div className="hidden h-10 rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 text-sm font-bold text-neutral-500 xl:flex xl:items-center">
              Review queue
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ViewButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center rounded-lg px-4 text-sm font-black transition ${
        active ? "bg-black text-white shadow-sm" : "text-neutral-600 hover:bg-white"
      }`}
    >
      {children}
    </button>
  );
}
