import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";

const roleOptions = [
  { value: "PHARMA_II", label: "Pharmacist II" },
  { value: "PHARMA_I", label: "Pharmacist I" },
  { value: "BHW", label: "Barangay Health Worker" },
];

const statusOptions = [
  { value: "PENDING", label: "Pending" },
  { value: "ACTIVE", label: "Active" },
  { value: "DEACTIVATED", label: "Deactivated" },
];

const emptyForm = {
  role: "BHW",
  facility_id: "",
  status: "PENDING",
};

const formatDateTime = (date) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatDate = (dateString) => {
  if (!dateString) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dateString));
};

const getRoleLabel = (role) => {
  return roleOptions.find((option) => option.value === role)?.label || role;
};

const getStatusLabel = (status) => {
  return statusOptions.find((option) => option.value === status)?.label || status;
};

const getStatusClass = (status) => {
  const classes = {
    PENDING: "bg-amber-100 text-amber-700",
    ACTIVE: "bg-emerald-100 text-emerald-700",
    DEACTIVATED: "bg-neutral-100 text-neutral-600",
  };

  return classes[status] || classes.PENDING;
};

const getInitials = (user) => {
  const firstInitial = user?.first_name?.[0] || "U";
  const lastInitial = user?.last_name?.[0] || "M";

  return `${firstInitial}${lastInitial}`.toUpperCase();
};

const getFullName = (user) => {
  return `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "Unnamed user";
};

const isPhoneDerivedEmail = (email, phoneNumber) => {
  if (!email || !phoneNumber) {
    return false;
  }

  const [localPart] = email.split("@");
  return localPart?.replace(/\D/g, "") === phoneNumber.replace(/\D/g, "");
};

const getDisplayEmail = (user) => {
  return isPhoneDerivedEmail(user?.email, user?.phone_number) ? "" : user?.email || "";
};

const getDisplayPhone = (user) => {
  return user?.phone_number || "";
};

export default function UserManagementModule() {
  const { profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [facilities, setFacilities] = useState([]);
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

  const summary = useMemo(() => {
    return visibleUsers.reduce(
      (counts, user) => {
        counts.total += 1;
        counts.pending += user.status === "PENDING" ? 1 : 0;
        counts.active += user.status === "ACTIVE" ? 1 : 0;
        counts.deactivated += user.status === "DEACTIVATED" ? 1 : 0;
        return counts;
      },
      { total: 0, pending: 0, active: 0, deactivated: 0 }
    );
  }, [visibleUsers]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return visibleUsers.filter((user) => {
      const searchableText = [
        getFullName(user),
        getDisplayEmail(user),
        getDisplayPhone(user),
        getRoleLabel(user.role),
        getStatusLabel(user.status),
        user.facility?.facility_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedSearch || searchableText.includes(normalizedSearch)) &&
        (statusFilter === "ALL" || user.status === statusFilter) &&
        (roleFilter === "ALL" || user.role === roleFilter)
      );
    });
  }, [roleFilter, searchTerm, statusFilter, visibleUsers]);

  const loadUsers = async () => {
    setIsLoading(true);
    setUserError("");

    const [profilesResult, facilitiesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          `
          id,
          first_name,
          last_name,
          email,
          phone_number,
          role,
          facility_id,
          status,
          approved_by,
          approved_at,
          created_at,
          updated_at,
          facility:facilities(id, facility_name, facility_code)
        `
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("facilities")
        .select("id, facility_name, facility_code")
        .eq("status", "ACTIVE")
        .order("facility_name", { ascending: true }),
    ]);

    const firstError = profilesResult.error || facilitiesResult.error;

    if (firstError) {
      setUserError(firstError.message);
      setIsLoading(false);
      return;
    }

    setUsers(profilesResult.data || []);
    setFacilities(facilitiesResult.data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadUsers();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const openUserModal = (user) => {
    setSelectedUser(user);
    setFormValues({
      role: user.role,
      facility_id: user.facility_id || "",
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
      role: overrides.role ?? formValues.role,
      facility_id: (overrides.facility_id ?? formValues.facility_id) || null,
      status: overrides.status ?? formValues.status,
      updated_at: new Date().toISOString(),
    };

    if (payload.status === "ACTIVE" && user.status !== "ACTIVE") {
      payload.approved_by = profile?.id || null;
      payload.approved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", user.id);

    if (error) {
      setUserError(error.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    closeUserModal();
    await loadUsers();
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {userError && !selectedUser && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {userError}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total Users" value={summary.total} tone="emerald" active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")} />
        <SummaryCard label="Pending Approval" value={summary.pending} tone="amber" active={statusFilter === "PENDING"} onClick={() => setStatusFilter("PENDING")} />
        <SummaryCard label="Active" value={summary.active} tone="blue" active={statusFilter === "ACTIVE"} onClick={() => setStatusFilter("ACTIVE")} />
        <SummaryCard label="Deactivated" value={summary.deactivated} tone="neutral" active={statusFilter === "DEACTIVATED"} onClick={() => setStatusFilter("DEACTIVATED")} />
      </section>

      <section className="mt-5 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[1fr_220px]">
          <label className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search user name, email, phone, role, or facility..."
              className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <SelectFilter value={roleFilter} onChange={setRoleFilter} options={roleOptions} allLabel="All roles" />
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-4">
          <div>
            <h2 className="text-base font-black text-black">User Accounts</h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-black uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center text-sm font-bold text-neutral-500">
                    Loading user accounts...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center text-sm font-bold text-neutral-500">
                    No users match the current filters.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    tabIndex={0}
                    onClick={() => openUserModal(user)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openUserModal(user);
                      }
                    }}
                    className="cursor-pointer transition hover:bg-emerald-50/60 focus:bg-emerald-50/80 focus:outline-none"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700">
                          {getInitials(user)}
                        </span>
                        <div>
                          <p className="font-black text-black">{getFullName(user)}</p>
                          <p className="text-xs font-semibold text-neutral-500">
                            ID: {user.id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="min-h-5 font-semibold text-neutral-700">{getDisplayEmail(user)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="min-h-5 font-semibold text-neutral-700">{getDisplayPhone(user)}</p>
                    </td>
                    <td className="px-4 py-4 font-semibold text-neutral-700">
                      {getRoleLabel(user.role)}
                    </td>
                    <td className="px-4 py-4 font-semibold text-neutral-700">
                      {user.facility?.facility_name || "No facility assigned"}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${getStatusClass(user.status)}`}>
                        {getStatusLabel(user.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium text-neutral-500">
                      {formatDate(user.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedUser && (
        <UserModal
          user={selectedUser}
          formValues={formValues}
          facilities={facilities}
          isSaving={isSaving}
          error={userError}
          onClose={closeUserModal}
          onChange={handleFieldChange}
          onSave={() => updateUser(selectedUser)}
        />
      )}
    </AdminShell>
  );
}

function UserModal({ user, formValues, facilities, isSaving, error, onClose, onChange, onSave }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl shadow-neutral-900/20">
        <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-4">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white">
              {getInitials(user)}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                User Profile
              </p>
              <h3 className="mt-1 truncate text-xl font-black text-black">{getFullName(user)}</h3>
              <p className="text-sm font-medium text-neutral-600">
                {getDisplayEmail(user) || getDisplayPhone(user)}
              </p>
            </div>
          </div>
        </div>

        <div className="prds-modal-scrollbar flex-1 overflow-y-auto bg-[#f8faf7] p-5">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField label="First Name" value={user.first_name} />
            <ReadOnlyField label="Last Name" value={user.last_name} />
            <ReadOnlyField label="Email" value={getDisplayEmail(user)} emptyLabel="" />
            <ReadOnlyField label="Phone" value={getDisplayPhone(user)} emptyLabel="" />
            <ReadOnlyField label="Approved At" value={formatDate(user.approved_at)} />
            <ReadOnlyField label="Last Updated" value={formatDate(user.updated_at)} />
          </div>

          <div className="mt-4 grid gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2">
            <SelectField label="Role" name="role" value={formValues.role} onChange={onChange} options={roleOptions} />
            <SelectField label="Status" name="status" value={formValues.status} onChange={onChange} options={statusOptions} />
            <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600 sm:col-span-2">
              Facility
              <select
                name="facility_id"
                value={formValues.facility_id}
                onChange={onChange}
                className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">No facility assigned</option>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.facility_name} ({facility.facility_code})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-100 bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-neutral-100 px-6 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="h-10 rounded-lg bg-emerald-600 px-6 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone, active, onClick }) {
  const toneClasses = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    neutral: "bg-neutral-50 text-neutral-700",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        active ? "border-emerald-400 ring-2 ring-emerald-100" : "border-neutral-200"
      }`}
    >
      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
        <UserIcon />
      </span>
      <p className="mt-4 text-3xl font-black text-black">{value}</p>
      <p className="text-xs font-black uppercase tracking-wide text-neutral-500">{label}</p>
    </button>
  );
}

function ReadOnlyField({ label, value, emptyLabel = "Not set" }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-neutral-100">
      <p className="text-xs font-black uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 min-h-5 break-words text-sm font-semibold text-black">{value || emptyLabel}</p>
    </div>
  );
}

function SelectField({ label, options, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600">
      {label}
      <select
        {...props}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SelectFilter({ value, onChange, options, allLabel }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-bold text-neutral-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
    >
      <option value="ALL">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <circle cx="10" cy="8" r="4" />
      <path d="M3 21a7 7 0 0 1 14 0" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  );
}
