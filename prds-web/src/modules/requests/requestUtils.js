export const requestStatuses = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "COMPLETED", label: "Completed" },
];

export const requestSortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "priority", label: "Priority first" },
];

export const requestStatusLabels = {
  APPROVED: "Approved",
  COMPLETED: "Completed",
  PENDING: "Pending",
  REJECTED: "Rejected",
};

export const requestStatusTones = {
  APPROVED: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-orange-50 text-orange-700",
  REJECTED: "bg-red-50 text-red-700",
};

export const getRequestNumber = (requestId = "") => {
  return `#RQ-${requestId.slice(0, 8).toUpperCase() || "PENDING"}`;
};

export const formatRequestDate = (dateValue) => {
  if (!dateValue) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateValue));
};

export const getRequesterName = (request) => {
  return `${request.requester?.first_name || ""} ${request.requester?.last_name || ""}`.trim() || "Unknown requester";
};

export const getItemLabel = (item) => {
  const medicine = item.medicine;
  const name = medicine?.brand_name || medicine?.generic_name || "Unknown medicine";
  const dosage = medicine?.dosage ? ` ${medicine.dosage}` : "";

  return `${name}${dosage}`;
};

export const getRequestTotalQuantity = (request) => {
  return (request.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0);
};

export const getRequestPriority = (request) => {
  const totalQuantity = getRequestTotalQuantity(request);
  const itemCount = request.items?.length || 0;

  if (request.status === "PENDING" && (totalQuantity >= 500 || itemCount >= 3)) {
    return "HIGH";
  }

  if (request.status === "PENDING" && (totalQuantity >= 100 || itemCount >= 2)) {
    return "MEDIUM";
  }

  return "LOW";
};

export const getPriorityTone = (priority) => {
  if (priority === "HIGH") {
    return "bg-red-100 text-red-700";
  }

  if (priority === "MEDIUM") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-neutral-100 text-neutral-600";
};

export const getStockMap = (inventoryRows = []) => {
  return inventoryRows.reduce((stockMap, row) => {
    const key = `${row.facility_id}:${row.medicine_id}`;
    const currentQuantity = stockMap.get(key)?.quantity || 0;
    const currentThreshold = stockMap.get(key)?.threshold || 0;

    stockMap.set(key, {
      quantity: currentQuantity + Number(row.quantity || 0),
      threshold: Math.max(currentThreshold, Number(row.threshold || 0)),
    });

    return stockMap;
  }, new Map());
};

export const getItemStockStatus = (item, facilityId, stockMap) => {
  const stock = stockMap.get(`${facilityId}:${item.medicine_id}`);

  if (!stock) {
    return { label: "No stock record", tone: "text-neutral-500" };
  }

  if (stock.quantity <= 0) {
    return { label: "Out of stock", tone: "text-red-600" };
  }

  if (stock.quantity < Number(item.quantity || 0)) {
    return { label: `${stock.quantity} available`, tone: "text-orange-600" };
  }

  if (stock.quantity <= stock.threshold) {
    return { label: "Low stock", tone: "text-orange-600" };
  }

  return { label: "In stock", tone: "text-blue-600" };
};

export const getRequestSummary = (requests = []) => {
  return requests.reduce(
    (summary, request) => {
      summary.total += 1;
      summary.pending += request.status === "PENDING" ? 1 : 0;
      summary.inTransit += request.status === "APPROVED" ? 1 : 0;
      summary.completed += request.status === "COMPLETED" ? 1 : 0;
      return summary;
    },
    { completed: 0, inTransit: 0, pending: 0, total: 0 }
  );
};

export const getCompletedRequestQuantity = (requests = []) => {
  return requests
    .filter((request) => request.status === "COMPLETED")
    .reduce((total, request) => total + getRequestTotalQuantity(request), 0);
};

export const getFacilityRequestRating = (requests = []) => {
  if (requests.length === 0) {
    return 0;
  }

  const resolvedRequests = requests.filter((request) =>
    ["APPROVED", "COMPLETED"].includes(request.status)
  ).length;

  return Math.round((resolvedRequests / requests.length) * 1000) / 10;
};

export const matchesRequestFilters = (
  request,
  { facilityId = "ALL", keyword = "", status = "ALL" }
) => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const searchableText = [
    getRequestNumber(request.id),
    request.status,
    request.remarks,
    request.facility?.facility_name,
    request.facility?.facility_code,
    getRequesterName(request),
    ...(request.items || []).map(getItemLabel),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (normalizedKeyword && !searchableText.includes(normalizedKeyword)) {
    return false;
  }

  if (facilityId !== "ALL" && request.facility_id !== facilityId) {
    return false;
  }

  if (status !== "ALL" && request.status !== status) {
    return false;
  }

  return true;
};

export const sortRequests = (requests = [], sortMode = "newest") => {
  return [...requests].sort((first, second) => {
    if (sortMode === "oldest") {
      return new Date(first.request_date).getTime() - new Date(second.request_date).getTime();
    }

    if (sortMode === "priority") {
      const priorityWeight = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return (
        priorityWeight[getRequestPriority(first)] -
        priorityWeight[getRequestPriority(second)]
      );
    }

    return new Date(second.request_date).getTime() - new Date(first.request_date).getTime();
  });
};
