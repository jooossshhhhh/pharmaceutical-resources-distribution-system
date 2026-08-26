import {
  formatDate,
  formatFacilityLabel,
  getDisplayEmail,
  getDisplayPhone,
  getFullName,
  getInitials,
  getRoleLabel,
} from "../userManagementUtils";
import { RoleBadge, UserStatusBadge } from "./UserManagementBadges";
import { UserIcon } from "./UserManagementIcons";

export default function UserAccountsTable({ isLoading, onSelectUser, users }) {
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#007f5f]">Account Directory</p>
          <h2 className="mt-1 text-base font-black text-black">User Accounts</h2>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
          {users.length} shown
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-neutral-50 text-xs font-black uppercase tracking-[0.14em] text-neutral-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Facility</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Registered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isLoading ? (
              <TableSkeleton />
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="6">
                  <UserEmptyState />
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  tabIndex={0}
                  onClick={() => onSelectUser(user)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectUser(user);
                    }
                  }}
                  className="cursor-pointer transition hover:bg-[#f2fff9] focus:bg-[#f2fff9] focus:outline-none"
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6be9c2]/40 text-xs font-black text-[#0d1117]">
                        {getInitials(user)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-black text-black">{getFullName(user)}</p>
                        <p className="text-xs font-semibold text-neutral-500">ID: {user.id.slice(0, 8)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="grid gap-1">
                      <p className="min-h-4 break-all text-sm font-semibold text-neutral-800">
                        {getDisplayEmail(user) || "No email linked"}
                      </p>
                      <p className="min-h-4 text-xs font-semibold text-neutral-500">
                        {getDisplayPhone(user) || "No phone linked"}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <RoleBadge>{getRoleLabel(user.role)}</RoleBadge>
                  </td>
                  <td className="px-4 py-4">
                    <p className="max-w-[220px] truncate font-semibold text-neutral-700">
                      {formatFacilityLabel(user.facility)}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <UserStatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-4 font-medium text-neutral-500">{formatDate(user.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TableSkeleton() {
  return Array.from({ length: 5 }, (_, index) => (
    <tr key={index}>
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 animate-pulse rounded-full bg-neutral-100" />
          <div className="grid gap-2">
            <span className="h-3 w-32 animate-pulse rounded bg-neutral-100" />
            <span className="h-3 w-20 animate-pulse rounded bg-neutral-100" />
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="grid gap-2">
          <span className="h-3 w-44 animate-pulse rounded bg-neutral-100" />
          <span className="h-3 w-28 animate-pulse rounded bg-neutral-100" />
        </div>
      </td>
      <td className="px-4 py-4"><span className="block h-6 w-24 animate-pulse rounded-full bg-neutral-100" /></td>
      <td className="px-4 py-4"><span className="block h-3 w-36 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-4"><span className="block h-6 w-20 animate-pulse rounded-full bg-neutral-100" /></td>
      <td className="px-4 py-4"><span className="block h-3 w-24 animate-pulse rounded bg-neutral-100" /></td>
    </tr>
  ));
}

function UserEmptyState() {
  return (
    <div className="grid place-items-center px-4 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <UserIcon />
      </span>
      <h3 className="mt-3 text-sm font-black text-black">No users match this view</h3>
      <p className="mt-1 max-w-md text-sm font-medium text-neutral-500">
        Try a different summary card, role filter, or search keyword.
      </p>
    </div>
  );
}
