export const facilityTypeLabels = {
  CHO: "Central Health Office",
  HEALTH_CENTER: "Health Center",
};

export const formatFacilityType = (type) => {
  return facilityTypeLabels[type] || type;
};

export const formatStatus = (status) => {
  if (typeof status !== "string" || !status.trim()) {
    return "Unknown";
  }

  const normalized = status.trim();
  return normalized.charAt(0) + normalized.slice(1).toLowerCase();
};
