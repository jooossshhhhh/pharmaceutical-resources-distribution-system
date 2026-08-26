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

export const moduleAccess = {
  "/users": ["PHARMA_II"],
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
  return items.filter((item) => {
    if (item.roles?.length) {
      return item.roles.includes(role);
    }

    return canAccessModule(role, item.path);
  });
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

export const filterFacilityRequests = (requests, searchTerm = "") => {
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
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return !normalizedSearch || searchableText.includes(normalizedSearch);
  });
};
