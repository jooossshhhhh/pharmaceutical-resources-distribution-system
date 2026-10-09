import UserAccountsTable from "./UserAccountsTable";

export default function AccountsView({
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
    <UserAccountsTable
      currentPage={currentPage}
      isLoading={isLoading}
      onPageChange={onPageChange}
      onQuickApprove={onQuickApprove}
      onSelectUser={onSelectUser}
      pageSize={pageSize}
      totalCount={totalCount}
      totalPages={totalPages}
      users={users}
    />
  );
}
