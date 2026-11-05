import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import AccountsView from "./accounts/AccountsView";
import ManageAccountModal from "./accounts/ManageAccountModal";
import UserManagementToolbar from "./components/UserManagementToolbar";
import UserSummaryCards from "./components/UserSummaryCards";
import {
  buildUserSummary,
  filterUsers,
  formatDateTime,
} from "@shared/utils/userManagementUtils";
import {
  getUserManagementData,
  updateManagedUser,
} from "@backend/services/userManagementService";
import { getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { supabase } from "@backend/client/supabase";

const emptyForm = {
  facility_id: "",
  role: "BHW",
  status: "PENDING",
};

export default function UserManagementModule() {
  const { profile } = useAuth();
  const [users, setUsers] = useState(() => getSnapshot(STORAGE_KEYS.USERS, []));
  const [facilities, setFacilities] = useState(() => getSnapshot(STORAGE_KEYS.FACILITIES, []));
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [facilityFilter, setFacilityFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(() => getSnapshot(STORAGE_KEYS.USERS, []).length === 0);
  const [isSaving, setIsSaving] = useState(false);
  const [userError, setUserError] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [formValues, setFormValues] = useState(emptyForm);

  const today = useMemo(() => formatDateTime(new Date()), []);

  const visibleUsers = useMemo(() => {
    return users.filter((user) => user.id !== profile?.id);
  }, [profile?.id, users]);

  const summary = useMemo(() => {
    return buildUserSummary(visibleUsers);
  }, [visibleUsers]);

  const hasActiveFilters = useMemo(() => {
    return (
      searchTerm.trim() !== "" ||
      statusFilter !== "ALL" ||
      roleFilter !== "ALL" ||
      facilityFilter !== "ALL"
    );
  }, [facilityFilter, roleFilter, searchTerm, statusFilter]);

  const handleResetFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
    setRoleFilter("ALL");
    setFacilityFilter("ALL");
  };

  const filteredUsers = useMemo(() => {
    return filterUsers(visibleUsers, {
      facilityFilter,
      roleFilter,
      searchTerm,
      statusFilter,
    });
  }, [facilityFilter, roleFilter, searchTerm, statusFilter, visibleUsers]);

  const {
    currentPage,
    paginatedRows: paginatedUsers,
    pageSize,
    setCurrentPage,
    totalCount,
    totalPages,
  } = usePaginatedRows(filteredUsers);

  const loadUsers = async () => {
    const cachedUsers = getSnapshot(STORAGE_KEYS.USERS, []);
    if (cachedUsers.length === 0) {
      setIsLoading(true);
    }
    setUserError("");

    try {
      const data = await getUserManagementData();
      if (data.users && (data.users.length > 0 || cachedUsers.length === 0)) {
        setUsers(data.users);
      }
      if (data.facilities && data.facilities.length > 0) {
        setFacilities(data.facilities);
      }
    } catch (error) {
      if (cachedUsers.length === 0) {
        setUserError(error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();

    // Subscribe to real-time changes on profiles table for smooth multi-user concurrency
    const channel = supabase
      .channel("realtime-user-management")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          loadUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const selectStatus = (nextStatus) => {
    setStatusFilter(nextStatus);
  };

  const openUserModal = (user) => {
    setSelectedUser(user);
    setFormValues({
      facility_id: user.facility_id || "",
      role: user.role,
      status: user.status,
    });
    setUserError("");
  };

  const closeUserModal = () => {
    if (isSaving) {
      return;
    }

    setSelectedUser(null);
    setFormValues(emptyForm);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
  };

  const updateUser = async (user, overrides = {}) => {
    if (!user) {
      return;
    }

    setIsSaving(true);
    setUserError("");

    const isModalEditingThisUser = selectedUser?.id === user.id;
    const targetFacilityId =
      overrides.facility_id !== undefined
        ? overrides.facility_id
        : isModalEditingThisUser
          ? formValues.facility_id
          : user.facility_id;
    const targetRole =
      overrides.role !== undefined
        ? overrides.role
        : isModalEditingThisUser
          ? formValues.role
          : user.role;
    const targetStatus =
      overrides.status !== undefined
        ? overrides.status
        : isModalEditingThisUser
          ? formValues.status
          : user.status;

    const payload = {
      facility_id: targetFacilityId || null,
      role: targetRole,
      status: targetStatus,
      updated_at: new Date().toISOString(),
    };

    if (payload.status === "ACTIVE" && user.status !== "ACTIVE") {
      payload.approved_by = profile?.id || null;
      payload.approved_at = new Date().toISOString();
    }

    const facilityObj = facilities.find((f) => f.id === payload.facility_id) || null;

    // Optimistically update local users state immediately
    setUsers((current) =>
      current.map((u) =>
        u.id === user.id
          ? {
              ...u,
              ...payload,
              facility: facilityObj
                ? { id: facilityObj.id, facility_name: facilityObj.facility_name, facility_code: facilityObj.facility_code }
                : (payload.facility_id ? u.facility : null),
            }
          : u
      )
    );

    try {
      await updateManagedUser({
        adminId: profile?.id,
        payload,
        user,
      });
    } catch (error) {
      setUserError(error.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    closeUserModal();
    loadUsers();
  };

  const handleQuickApprove = (user) => {
    if (!user?.facility_id) {
      openUserModal(user);
      setUserError("Please assign a facility to this user before approving their account.");
      return;
    }
    updateUser(user, { status: "ACTIVE" });
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <div className="space-y-4">
        {userError && !selectedUser ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {userError}
          </p>
        ) : null}

        <UserSummaryCards
          onSelectStatus={selectStatus}
          statusFilter={statusFilter}
          summary={summary}
        />

        <UserManagementToolbar
          facilities={facilities}
          facilityFilter={facilityFilter}
          hasActiveFilters={hasActiveFilters}
          onFacilityFilterChange={setFacilityFilter}
          onResetFilters={handleResetFilters}
          onRoleFilterChange={setRoleFilter}
          onSearchChange={setSearchTerm}
          roleFilter={roleFilter}
          searchTerm={searchTerm}
        />

        <AccountsView
          currentPage={currentPage}
          isLoading={isLoading}
          onPageChange={setCurrentPage}
          onQuickApprove={handleQuickApprove}
          onSelectUser={openUserModal}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          users={paginatedUsers}
        />
      </div>

      {selectedUser ? (
        <ManageAccountModal
          error={userError}
          facilities={facilities}
          formValues={formValues}
          isSaving={isSaving}
          onChange={handleFieldChange}
          onClose={closeUserModal}
          onSave={() => updateUser(selectedUser)}
          user={selectedUser}
        />
      ) : null}
    </AdminShell>
  );
}
