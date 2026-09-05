import UserAccountsTable from "./UserAccountsTable";

export default function AccountsView({ isLoading, onSelectUser, users }) {
  return (
    <UserAccountsTable
      isLoading={isLoading}
      onSelectUser={onSelectUser}
      users={users}
    />
  );
}
