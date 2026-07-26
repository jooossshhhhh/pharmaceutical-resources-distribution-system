export const activityCategories = [
  { value: "all", label: "All Activity" },
  { value: "self", label: "My Activity" },
  { value: "inventory", label: "Inventory Updates" },
  { value: "profile", label: "Profile Changes", adminOnly: true },
];

export const getAllowedActivityLogRoleFilters = (role) => {
  return activityCategories.filter((filter) => {
    return !filter.adminOnly || role === "PHARMA_II";
  });
};

export const getVisibleActivityLogs = (logs = [], profile) => {
  if (!profile?.id) {
    return [];
  }

  if (profile.role === "PHARMA_II") {
    return logs;
  }

  if (profile.role === "PHARMA_I") {
    return logs.filter((log) => {
      return log.user_id === profile.id || log.user?.role === "BHW";
    });
  }

  return logs.filter((log) => log.user_id === profile.id);
};

export const matchesActivityLogFilters = (
  log,
  { category, currentUserId, facilityId, keyword, selfOnly }
) => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const searchableText = [
    log.action,
    log.module,
    log.details,
    log.user?.first_name,
    log.user?.last_name,
    log.user?.email,
    log.user?.phone_number,
    log.user?.facility?.facility_name,
    log.user?.facility?.facility_code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (normalizedKeyword && !searchableText.includes(normalizedKeyword)) {
    return false;
  }

  if (selfOnly && log.user_id !== currentUserId) {
    return false;
  }

  if (category === "self" && log.user_id !== currentUserId) {
    return false;
  }

  if (category === "inventory" && log.module !== "Inventory") {
    return false;
  }

  if (category === "profile" && log.module !== "User Account") {
    return false;
  }

  if (facilityId !== "ALL" && log.user?.facility_id !== facilityId) {
    return false;
  }

  return true;
};
