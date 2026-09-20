import UserAccountsTable from "./UserAccountsTable";

export default function AccountsView({
  currentPage,
  isLoading,
  onPageChange,
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
      onSelectUser={onSelectUser}
      pageSize={pageSize}
      totalCount={totalCount}
      totalPages={totalPages}
      users={users}
    />
  );
}
