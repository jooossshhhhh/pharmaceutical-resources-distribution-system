export const activityCategories = [
  { value: "all", label: "All Activity" },
  { value: "self", label: "My Activity" },
  { value: "inventory", label: "Inventory Updates" },
  { value: "profile", label: "Profile Changes", adminOnly: true },
];

export const activityDateModes = [
  { value: "all", label: "All Dates" },
  { value: "specific", label: "Specific Date" },
  { value: "range", label: "Date Range" },
];

const getLocalDateString = (dateValue) => {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

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
  {
    category,
    currentUserId,
    dateMode = "all",
    endDate = "",
    facilityId,
    keyword,
    selfOnly,
    specificDate = "",
    startDate = "",
  }
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

  if (!matchesActivityLogDateFilter(log, {
    dateMode,
    endDate,
    specificDate,
    startDate,
  })) {
    return false;
  }

  return true;
};

export const matchesActivityLogDateFilter = (
  log,
  { dateMode = "all", endDate = "", specificDate = "", startDate = "" }
) => {
  if (dateMode === "all") {
    return true;
  }

  const logDate = getLocalDateString(log.created_at);

  if (!logDate) {
    return false;
  }

  if (dateMode === "specific") {
    return !specificDate || logDate === specificDate;
  }

  if (dateMode === "range") {
    return (!startDate || logDate >= startDate) && (!endDate || logDate <= endDate);
  }

  return true;
};

export const getActivityLogPanelLabel = ({
  category,
  categoryOptions = activityCategories,
  facilityId,
  facilities = [],
  dateMode = "all",
  endDate = "",
  roleFilter,
  roleOptions = [],
  specificDate = "",
  startDate = "",
}) => {
  const parts = [];
  const selectedCategory = categoryOptions.find((option) => option.value === category);
  const selectedRole = roleOptions.find((option) => option.value === roleFilter);
  const selectedFacility = facilities.find((facility) => facility.id === facilityId);

  parts.push(selectedCategory?.label || "Activity Logs");

  if (selectedRole && selectedRole.value !== "ALL") {
    parts.push(selectedRole.label);
  }

  if (selectedFacility) {
    parts.push(selectedFacility.facility_name);
  }

  if (dateMode === "specific" && specificDate) {
    parts.push(specificDate);
  }

  if (dateMode === "range" && (startDate || endDate)) {
    parts.push(`${startDate || "Start"} to ${endDate || "Today"}`);
  }

  return parts.join(" - ");
};
