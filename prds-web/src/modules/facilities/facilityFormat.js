export const facilityTypeLabels = {
  CHO: "Central Health Office",
  HEALTH_CENTER: "Health Center",
};

export const formatFacilityType = (type) => {
  return facilityTypeLabels[type] || type;
};

export const formatStatus = (status) => {
  return status?.charAt(0) + status?.slice(1).toLowerCase();
};
