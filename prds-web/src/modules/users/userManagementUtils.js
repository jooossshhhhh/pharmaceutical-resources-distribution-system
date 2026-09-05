export const USER_ACCOUNT_LOG_MODULE = "User Account";

export const roleOptions = [
  { value: "PHARMA_II", label: "Pharmacist II" },
  { value: "PHARMA_I", label: "Pharmacist I" },
  { value: "BHW", label: "Barangay Health Worker" },
];

export const statusOptions = [
  { value: "PENDING", label: "Pending" },
  { value: "ACTIVE", label: "Active" },
  { value: "DEACTIVATED", label: "Deactivated" },
];

export const userManagementSubmodules = [
  {
    description: "Review user accounts, roles, status, and facility assignment.",
    id: "accounts",
    label: "Accounts",
    path: "/users/accounts",
  },
  {
    description: "Review facility reassignment requests from profile settings.",
    id: "change-requests",
    label: "Facility Changes",
    path: "/users/change-requests",
  },
];

export const moduleAccess = {
  "/users": ["PHARMA_II"],
  "/users/accounts": ["PHARMA_II"],
  "/users/change-requests": ["PHARMA_II"],
  "/suppliers": ["PHARMA_II"],
  "/facilities": ["PHARMA_I", "PHARMA_II"],
};

export const canAccessModule = (role, path) => {
  const allowedRoles = moduleAccess[path];

  if (!allowedRoles) {
    return true;
  }

  return allowedRoles.includes(role);
};

export const getAllowedNavItems = (items, role) => {
  return items
    .map((item) => ({
      ...item,
      children: item.children?.filter((child) => {
        if (child.roles?.length) {
          return child.roles.includes(role);
        }

        return canAccessModule(role, child.path);
      }),
    }))
    .filter((item) => {
    if (item.roles?.length) {
      return item.roles.includes(role);
    }

    return canAccessModule(role, item.path);
  });
};

export const getUserManagementViewFromPath = (pathname = "") => {
  return pathname.startsWith("/users/change-requests") ? "change-requests" : "accounts";
};

export const getUserManagementPathForView = (view) => {
  return userManagementSubmodules.find((submodule) => submodule.id === view)?.path || "/users/accounts";
};

export const formatDateTime = (date) => {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date instanceof Date ? date : new Date(date));
};

export const formatDate = (dateString) => {
  if (!dateString) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dateString));
};

export const toDateInputValue = (dateString) => {
  if (!dateString) {
    return "";
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const getRoleLabel = (role) => {
  return roleOptions.find((option) => option.value === role)?.label || role || "Unassigned";
};

export const getStatusLabel = (status) => {
  return statusOptions.find((option) => option.value === status)?.label || status || "Pending";
};

export const getRequestStatusLabel = (status) => {
  const labels = {
    APPROVED: "Approved",
    CANCELLED: "Cancelled",
    PENDING: "Pending",
    REJECTED: "Rejected",
  };

  return labels[status] || status || "Pending";
};

export const formatFacilityLabel = (facility) => {
  if (!facility) {
    return "No facility";
  }

  return `${facility.facility_name}${facility.facility_code ? ` (${facility.facility_code})` : ""}`;
};

export const getInitials = (user) => {
  const firstInitial = user?.first_name?.[0] || "U";
  const lastInitial = user?.last_name?.[0] || "M";

  return `${firstInitial}${lastInitial}`.toUpperCase();
};

export const getFullName = (user) => {
  return `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "Unnamed user";
};

export const isPhoneDerivedEmail = (email, phoneNumber) => {
  if (!email || !phoneNumber) {
    return false;
  }

  const [localPart] = email.split("@");
  return localPart?.replace(/\D/g, "") === phoneNumber.replace(/\D/g, "");
};

export const getDisplayEmail = (user) => {
  return isPhoneDerivedEmail(user?.email, user?.phone_number) ? "" : user?.email || "";
};

export const getDisplayPhone = (user) => {
  return user?.phone_number || "";
};

export const buildUserSummary = (users, facilityRequests = []) => {
  return users.reduce(
    (counts, user) => {
      counts.total += 1;
      counts.pending += user.status === "PENDING" ? 1 : 0;
      counts.active += user.status === "ACTIVE" ? 1 : 0;
      counts.deactivated += user.status === "DEACTIVATED" ? 1 : 0;
      return counts;
    },
    {
      active: 0,
      deactivated: 0,
      facilityRequests: facilityRequests.filter((request) => request.status === "PENDING").length,
      pending: 0,
      total: 0,
    }
  );
};

export const filterUsers = (users, { roleFilter = "ALL", searchTerm = "", statusFilter = "ALL" } = {}) => {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  return users.filter((user) => {
    const searchableText = [
      getFullName(user),
      getDisplayEmail(user),
      getDisplayPhone(user),
      getRoleLabel(user.role),
      getStatusLabel(user.status),
      user.facility?.facility_name,
      user.facility?.facility_code,
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
};

export const filterFacilityRequests = (requests, searchTermOrOptions = "") => {
  const searchTerm =
    typeof searchTermOrOptions === "string" ? searchTermOrOptions : searchTermOrOptions.searchTerm || "";
  const dateFilter = typeof searchTermOrOptions === "string" ? "" : searchTermOrOptions.dateFilter || "";
  const statusFilter = typeof searchTermOrOptions === "string" ? "ALL" : searchTermOrOptions.statusFilter || "ALL";
  const normalizedSearch = searchTerm.trim().toLowerCase();

  return requests.filter((request) => {
    const searchableText = [
      getFullName(request.profile),
      request.current_facility?.facility_name,
      request.current_facility?.facility_code,
      request.requested_facility?.facility_name,
      request.requested_facility?.facility_code,
      request.reason,
      request.status,
      formatDate(request.created_at),
      formatDateTime(request.created_at),
      toDateInputValue(request.created_at),
      formatDate(request.reviewed_at),
      formatDateTime(request.reviewed_at),
      toDateInputValue(request.reviewed_at),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesDate =
      !dateFilter ||
      toDateInputValue(request.created_at) === dateFilter ||
      toDateInputValue(request.reviewed_at) === dateFilter;

    return (
      (!normalizedSearch || searchableText.includes(normalizedSearch)) &&
      (statusFilter === "ALL" || request.status === statusFilter) &&
      matchesDate
    );
  });
};
