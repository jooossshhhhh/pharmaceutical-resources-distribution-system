export const facilityTypeLabels = {
  CHO: "City Health Office",
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

export const formatFacilityName = (name) => {
  if (!name || typeof name !== "string") {
    return name || "";
  }
  return name.replace(/Central Health Office/gi, "City Health Office");
};
