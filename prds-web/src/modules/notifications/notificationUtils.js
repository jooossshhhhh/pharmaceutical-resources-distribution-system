export const notificationCategories = [
  { value: "all", label: "All Notifications" },
  { value: "self", label: "My Notifications" },
  { value: "facility", label: "Facility Notifications" },
  { value: "low_stock", label: "Low Stock" },
  { value: "requests", label: "Requests" },
  { value: "transfers", label: "Transfers" },
  { value: "system", label: "System" },
];

export const notificationReadFilters = [
  { value: "all", label: "All statuses" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

export const notificationDateModes = [
  { value: "all", label: "All Dates" },
  { value: "specific", label: "Specific Date" },
  { value: "range", label: "Date Range" },
];

const facilityKeywords = [
  "stock",
  "inventory",
  "request",
  "transfer",
  "dispens",
  "medicine",
  "expir",
  "facility",
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

export const getNotificationCategory = (notification) => {
  const searchableText = `${notification.title || ""} ${notification.message || ""}`.toLowerCase();

  if (
    searchableText.includes("low stock") ||
    searchableText.includes("critical") ||
    searchableText.includes("expir")
  ) {
    return "low_stock";
  }

  if (searchableText.includes("request")) {
    return "requests";
  }

  if (searchableText.includes("transfer")) {
    return "transfers";
  }

  return "system";
};

export const isFacilityNotification = (notification) => {
  const searchableText = `${notification.title || ""} ${notification.message || ""}`.toLowerCase();

  return Boolean(notification.recipient_facility_id) &&
    facilityKeywords.some((keyword) => searchableText.includes(keyword));
};

export const getVisibleNotifications = (notifications = [], profile) => {
  if (!profile?.id) {
    return [];
  }

  if (profile.role === "PHARMA_II") {
    return notifications;
  }

  if (profile.role === "PHARMA_I") {
    return notifications.filter((notification) => {
      return notification.user_id === profile.id || isFacilityNotification(notification);
    });
  }

  return notifications.filter((notification) => {
    return (
      notification.user_id === profile.id ||
      (isFacilityNotification(notification) &&
        notification.recipient_facility_id === profile.facility_id)
    );
  });
};

export const matchesNotificationFilters = (
  notification,
  {
    category,
    currentUserId,
    dateMode = "all",
    endDate = "",
    facilityId,
    keyword,
    readFilter,
    roleFilter,
    specificDate = "",
    startDate = "",
  }
) => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const searchableText = [
    notification.title,
    notification.message,
    notification.recipient_first_name,
    notification.recipient_last_name,
    notification.recipient_email,
    notification.recipient_phone_number,
    notification.facility_name,
    notification.facility_code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (normalizedKeyword && !searchableText.includes(normalizedKeyword)) {
    return false;
  }

  if (category === "self" && notification.user_id !== currentUserId) {
    return false;
  }

  if (category === "facility" && !isFacilityNotification(notification)) {
    return false;
  }

  if (
    !["all", "self", "facility"].includes(category) &&
    getNotificationCategory(notification) !== category
  ) {
    return false;
  }

  if (readFilter === "read" && !notification.is_read) {
    return false;
  }

  if (readFilter === "unread" && notification.is_read) {
    return false;
  }

  if (roleFilter !== "ALL" && notification.recipient_role !== roleFilter) {
    return false;
  }

  if (facilityId !== "ALL" && notification.recipient_facility_id !== facilityId) {
    return false;
  }

  return matchesNotificationDateFilter(notification, {
    dateMode,
    endDate,
    specificDate,
    startDate,
  });
};

export const matchesNotificationDateFilter = (
  notification,
  { dateMode = "all", endDate = "", specificDate = "", startDate = "" }
) => {
  if (dateMode === "all") {
    return true;
  }

  const notificationDate = getLocalDateString(notification.created_at);

  if (!notificationDate) {
    return false;
  }

  if (dateMode === "specific") {
    return !specificDate || notificationDate === specificDate;
  }

  if (dateMode === "range") {
    return (
      (!startDate || notificationDate >= startDate) &&
      (!endDate || notificationDate <= endDate)
    );
  }

  return true;
};

export const getNotificationPanelLabel = ({
  category,
  categoryOptions = notificationCategories,
  dateMode = "all",
  endDate = "",
  facilities = [],
  facilityId,
  readFilter,
  readOptions = notificationReadFilters,
  roleFilter,
  roleOptions = [],
  specificDate = "",
  startDate = "",
}) => {
  const parts = [];
  const selectedCategory = categoryOptions.find((option) => option.value === category);
  const selectedReadFilter = readOptions.find((option) => option.value === readFilter);
  const selectedRole = roleOptions.find((option) => option.value === roleFilter);
  const selectedFacility = facilities.find((facility) => facility.id === facilityId);

  parts.push(selectedCategory?.label || "Notifications");

  if (selectedReadFilter && selectedReadFilter.value !== "all") {
    parts.push(selectedReadFilter.label);
  }

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
