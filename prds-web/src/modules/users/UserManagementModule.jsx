import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import FacilityRequestsPanel from "./components/FacilityRequestsPanel";
import UserAccountsTable from "./components/UserAccountsTable";
import UserManagementModal from "./components/UserManagementModal";
import UserManagementToolbar from "./components/UserManagementToolbar";
import UserSummaryCards from "./components/UserSummaryCards";
import {
  buildUserSummary,
  filterFacilityRequests,
  filterUsers,
  formatDateTime,
} from "./userManagementUtils";
import {
  getUserManagementData,
  reviewFacilityChangeRequest,
  updateManagedUser,
} from "./UserManagementService";

const emptyForm = {
  facility_id: "",
  role: "BHW",
  status: "PENDING",
};

export default function UserManagementModule() {
  const { profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [facilityRequests, setFacilityRequests] = useState([]);
  const [activeView, setActiveView] = useState("accounts");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [userError, setUserError] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [formValues, setFormValues] = useState(emptyForm);

  const today = useMemo(() => formatDateTime(new Date()), []);

  const visibleUsers = useMemo(() => {
    return users.filter((user) => user.id !== profile?.id);
  }, [profile?.id, users]);

  const pendingFacilityRequests = useMemo(() => {
    return facilityRequests.filter((request) => request.status === "PENDING");
  }, [facilityRequests]);

  const summary = useMemo(() => {
    return buildUserSummary(visibleUsers, facilityRequests);
  }, [facilityRequests, visibleUsers]);

  const filteredUsers = useMemo(() => {
    return filterUsers(visibleUsers, {
      roleFilter,
      searchTerm,
      statusFilter,
    });
  }, [roleFilter, searchTerm, statusFilter, visibleUsers]);

  const filteredFacilityRequests = useMemo(() => {
    return filterFacilityRequests(facilityRequests, searchTerm);
  }, [facilityRequests, searchTerm]);

  const loadUsers = async () => {
    setIsLoading(true);
    setUserError("");

    try {
      const data = await getUserManagementData();
      setUsers(data.users);
      setFacilities(data.facilities);
      setFacilityRequests(data.facilityRequests);
    } catch (error) {
      setUserError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const selectStatus = (nextStatus) => {
    setActiveView("accounts");
    setStatusFilter(nextStatus);
  };

  const showFacilityRequests = () => {
    setActiveView("requests");
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

    const payload = {
      facility_id: (overrides.facility_id ?? formValues.facility_id) || null,
      role: overrides.role ?? formValues.role,
      status: overrides.status ?? formValues.status,
      updated_at: new Date().toISOString(),
    };

    if (payload.status === "ACTIVE" && user.status !== "ACTIVE") {
      payload.approved_by = profile?.id || null;
      payload.approved_at = new Date().toISOString();
    }

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
    await loadUsers();
  };

  const handleReviewFacilityRequest = async (request, status) => {
    setIsSaving(true);
    setUserError("");

    try {
      await reviewFacilityChangeRequest({
        requestId: request.id,
        status,
      });
      await loadUsers();
    } catch (error) {
      setUserError(error.message);
    } finally {
      setIsSaving(false);
    }
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
          activeView={activeView}
          onSelectRequests={showFacilityRequests}
          onSelectStatus={selectStatus}
          statusFilter={statusFilter}
          summary={summary}
        />

        <UserManagementToolbar
          activeView={activeView}
          onRoleFilterChange={setRoleFilter}
          onSearchChange={setSearchTerm}
          onViewChange={setActiveView}
          pendingRequests={pendingFacilityRequests.length}
          roleFilter={roleFilter}
          searchTerm={searchTerm}
        />

        {activeView === "accounts" ? (
          <UserAccountsTable
            isLoading={isLoading}
            onSelectUser={openUserModal}
            users={filteredUsers}
          />
        ) : (
          <FacilityRequestsPanel
            isLoading={isLoading}
            isSaving={isSaving}
            onReview={handleReviewFacilityRequest}
            requests={filteredFacilityRequests}
          />
        )}
      </div>

      {selectedUser ? (
        <UserManagementModal
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
