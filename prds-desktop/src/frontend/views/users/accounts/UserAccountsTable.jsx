import {
  formatFacilityLabel,
  getDisplayEmail,
  getDisplayPhone,
  getFullName,
  getInitials,
  getRoleLabel,
} from "@shared/utils/userManagementUtils";
import PaginationControls from "../../../components/PaginationControls";
import { RoleBadge, UserStatusBadge } from "../components/UserManagementBadges";
import { UserIcon } from "../components/UserManagementIcons";

export default function UserAccountsTable({
  currentPage,
  isLoading,
  onPageChange,
  onQuickApprove,
  onSelectUser,
  pageSize,
  totalCount,
  totalPages,
  users,
}) {
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-sm">
      <div className="flex items-center justify-between border-b border-[#CFDDE0] px-4 py-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#1F4E5A]">Account Directory</p>
          <h2 className="mt-1 text-base font-black text-[#1B2B30]">User Accounts</h2>
        </div>
        <span className="rounded-full bg-[#E5EFF1] px-3 py-1 text-xs font-black text-[#5B7077]">
          {totalCount} shown
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#CFDDE0] bg-[#E5EFF1]/60 text-[11px] font-bold uppercase tracking-wider text-[#5B7077]">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Facility</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#CFDDE0]/50">
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
                  className="cursor-pointer transition hover:bg-[#E2F3EC]/40 focus:bg-[#E2F3EC]/50 focus:outline-none"
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E5EFF1] text-xs font-black text-[#1F4E5A] border border-[#CFDDE0]">
                        {getInitials(user)}
                      </span>
                      <p className="truncate font-black text-[#1B2B30]">{getFullName(user)}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="grid gap-0.5">
                      <p className="truncate text-sm font-semibold text-[#1B2B30]" title={getDisplayEmail(user)}>
                        {getDisplayEmail(user) || "No email linked"}
                      </p>
                      {getDisplayPhone(user) ? (
                        <p className="text-xs font-semibold text-[#5B7077]">
                          {getDisplayPhone(user)}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <RoleBadge>{getRoleLabel(user.role)}</RoleBadge>
                  </td>
                  <td className="px-4 py-4">
                    <p className="max-w-[240px] truncate font-semibold text-[#5B7077]" title={formatFacilityLabel(user.facility)}>
                      {formatFacilityLabel(user.facility)}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <UserStatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div
                      className="flex items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {user.status === "PENDING" && (
                        <button
                          type="button"
                          onClick={() => onQuickApprove?.(user)}
                          className="btn-primary inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-xs transition cursor-pointer"
                          title="Approve user account immediately"
                        >
                          Approve
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectUser(user)}
                        className="btn-secondary inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer"
                      >
                        Manage
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && totalCount > 0 && (
        <PaginationControls
          currentPage={currentPage}
          itemLabel="users"
          onPageChange={onPageChange}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
        />
      )}
    </section>
  );
}

function TableSkeleton() {
  return Array.from({ length: 10 }, (_, index) => (
    <tr key={index}>
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 animate-pulse rounded-full bg-neutral-100" />
          <span className="h-3 w-32 animate-pulse rounded bg-neutral-100" />
        </div>
      </td>
      <td className="px-4 py-4">
        <span className="h-3 w-40 animate-pulse rounded bg-neutral-100" />
      </td>
      <td className="px-4 py-4"><span className="block h-6 w-24 animate-pulse rounded-full bg-neutral-100" /></td>
      <td className="px-4 py-4"><span className="block h-3 w-36 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-4"><span className="block h-6 w-20 animate-pulse rounded-full bg-neutral-100" /></td>
      <td className="px-4 py-4"><span className="ml-auto block h-8 w-24 animate-pulse rounded bg-neutral-100" /></td>
    </tr>
  ));
}

function UserEmptyState() {
  return (
    <div className="grid place-items-center px-4 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E5EFF1] text-[#5B7077]">
        <UserIcon />
      </span>
      <h3 className="mt-3 text-sm font-black text-[#1B2B30]">No users match this view</h3>
      <p className="mt-1 max-w-md text-sm font-medium text-[#5B7077]">
        Try a different summary card, role filter, or search keyword.
      </p>
    </div>
  );
}
