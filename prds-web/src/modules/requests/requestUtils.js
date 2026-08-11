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

export const dateRangeOptions = [
  { value: "ALL", label: "All time" },
  { value: "7D", label: "Last 7 days" },
  { value: "30D", label: "Last 30 days" },
  { value: "90D", label: "Last 90 days" },
  { value: "MONTH", label: "This month" },
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

export const getRelativeTime = (dateValue) => {
  if (!dateValue) {
    return "";
  }

  const elapsedMs = Date.now() - new Date(dateValue).getTime();
  const minutes = Math.floor(elapsedMs / 60000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 30) {
    return `${days}d ago`;
  }

  const months = Math.floor(days / 30);

  if (months < 12) {
    return `${months}mo ago`;
  }

  return `${Math.floor(months / 12)}y ago`;
};

export const isRequestWithinDateRange = (request = {}, rangeKey = "ALL") => {
  if (rangeKey === "ALL" || !request.request_date) {
    return true;
  }

  const date = new Date(request.request_date);
  const now = new Date();

  if (rangeKey === "MONTH") {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }

  const days = Number(rangeKey.replace("D", "")) || 0;
  const cutoff = now.getTime() - days * 86400000;

  return date.getTime() >= cutoff;
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

export const getMedicineFullLabel = (medicine = {}) => {
  const genericName = medicine.generic_name || "No generic name";
  const brandName = medicine.brand_name || "Generic";
  const unit = medicine.unit_of_measure || "No unit";
  const dosage = medicine.dosage || "No dosage";

  return `${genericName} - ${brandName} - ${unit} - ${dosage}`;
};

export const getRequestItemFullLabel = (item = {}) => {
  return getMedicineFullLabel(item.medicine || {});
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

export const getChoAvailabilityMap = (medicines = []) => {
  return medicines.reduce((availabilityMap, medicine) => {
    availabilityMap.set(medicine.id, {
      availableQuantity: Number(medicine.available_quantity || 0),
      physicalQuantity: Number(medicine.physical_quantity || 0),
      reservedQuantity: Number(medicine.reserved_quantity || 0),
    });

    return availabilityMap;
  }, new Map());
};

export const validateChoRequestAvailability = (items = [], availabilityMap = new Map()) => {
  for (const item of items) {
    const availability = availabilityMap.get(item.medicine_id);
    const requestedQuantity = Number(item.quantity || 0);

    if (!availability || availability.availableQuantity <= 0) {
      return "This medicine is not currently available at CHO.";
    }

    if (requestedQuantity > availability.availableQuantity) {
      return `Requested quantity exceeds the ${availability.availableQuantity.toLocaleString()} units currently available at CHO.`;
    }
  }

  return "";
};

export const buildFefoBatchAllocations = (requestItems = [], batches = []) => {
  const batchesByMedicine = batches.reduce((batchMap, batch) => {
    const medicineBatches = batchMap.get(batch.medicine_id) || [];
    medicineBatches.push(batch);
    batchMap.set(batch.medicine_id, medicineBatches);
    return batchMap;
  }, new Map());

  batchesByMedicine.forEach((medicineBatches) => {
    medicineBatches.sort((first, second) => {
      const firstExpiry = first.expiration_date || "";
      const secondExpiry = second.expiration_date || "";
      const expiryComparison = firstExpiry.localeCompare(secondExpiry);

      if (expiryComparison !== 0) {
        return expiryComparison;
      }

      return (first.batch_number || "").localeCompare(second.batch_number || "");
    });
  });

  return requestItems.flatMap((item) => {
    let remainingQuantity = Number(item.quantity || 0);
    const medicineBatches = batchesByMedicine.get(item.medicine_id) || [];
    const allocations = [];

    for (const batch of medicineBatches) {
      if (remainingQuantity <= 0) {
        break;
      }

      const allocatedQuantity = Math.min(remainingQuantity, Number(batch.quantity || 0));

      if (allocatedQuantity > 0) {
        allocations.push({
          request_item_id: item.id,
          source_inventory_id: batch.id,
          quantity: allocatedQuantity,
        });
        remainingQuantity -= allocatedQuantity;
      }
    }

    return allocations;
  });
};

export const getAllocationValidationError = (
  requestItems = [],
  batches = [],
  allocations = []
) => {
  const requestItemsById = new Map(requestItems.map((item) => [item.id, item]));
  const batchesById = new Map(batches.map((batch) => [batch.id, batch]));
  const allocatedByItem = new Map();
  const allocatedByBatch = new Map();

  for (const allocation of allocations) {
    const item = requestItemsById.get(allocation.request_item_id);
    const batch = batchesById.get(allocation.source_inventory_id);
    const quantity = Number(allocation.quantity || 0);

    if (!item || !batch) {
      return "Every allocation must use a valid request item and CHO batch.";
    }

    if (quantity <= 0 || !Number.isInteger(quantity)) {
      return "Batch allocation quantities must be positive whole numbers.";
    }

    if (batch.medicine_id !== item.medicine_id) {
      return "Selected CHO batch does not match the requested medicine.";
    }

    allocatedByItem.set(item.id, (allocatedByItem.get(item.id) || 0) + quantity);
    allocatedByBatch.set(batch.id, (allocatedByBatch.get(batch.id) || 0) + quantity);
  }

  for (const batch of batches) {
    if ((allocatedByBatch.get(batch.id) || 0) > Number(batch.quantity || 0)) {
      return "Batch allocation exceeds the selected CHO stock quantity.";
    }
  }

  for (const item of requestItems) {
    const requestedQuantity = Number(item.quantity || 0);

    if ((allocatedByItem.get(item.id) || 0) !== requestedQuantity) {
      return `Allocate exactly ${requestedQuantity.toLocaleString()} units for this request item before approving.`;
    }
  }

  return "";
};

export const getLowStockRequestItems = (
  facilityId,
  stockMap = new Map(),
  availabilityMap = new Map()
) => {
  const prefix = `${facilityId}:`;

  return [...stockMap.entries()]
    .filter(([key, stock]) => key.startsWith(prefix) && stock.quantity <= stock.threshold)
    .map(([key, stock]) => {
      const medicineId = key.slice(prefix.length);
      const availableQuantity = availabilityMap.get(medicineId)?.availableQuantity || 0;
      const suggestedQuantity = Math.max(Math.ceil(stock.threshold * 2), 1);

      return {
        availableQuantity,
        medicine_id: medicineId,
        quantity: String(Math.min(suggestedQuantity, availableQuantity)),
      };
    })
    .filter((item) => item.availableQuantity > 0)
    .map(({ medicine_id, quantity }) => ({ medicine_id, quantity }));
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

export const getDuplicateRequestMedicineIds = (items = []) => {
  const seenMedicineIds = new Set();
  const duplicateMedicineIds = new Set();

  items.forEach((item) => {
    if (!item.medicine_id) {
      return;
    }

    if (seenMedicineIds.has(item.medicine_id)) {
      duplicateMedicineIds.add(item.medicine_id);
      return;
    }

    seenMedicineIds.add(item.medicine_id);
  });

  return [...duplicateMedicineIds];
};

export const getRequestTrackingSteps = (request = {}) => {
  const status = request.status || "PENDING";
  const approvedLikeStatuses = ["APPROVED", "COMPLETED"];

  return [
    {
      detail: formatRequestDate(request.request_date),
      key: "requested",
      label: "Requested",
      state: "complete",
    },
    {
      detail: request.approved_at ? formatRequestDate(request.approved_at) : "CHO review",
      key: "approved",
      label: "Approved",
      state: approvedLikeStatuses.includes(status)
        ? "complete"
        : status === "REJECTED"
          ? "rejected"
          : "current",
    },
    {
      detail: status === "COMPLETED" ? "Released to facility" : "Awaiting release",
      key: "in_transit",
      label: "For Release",
      state:
        status === "COMPLETED"
          ? "complete"
          : status === "APPROVED"
            ? "current"
            : "pending",
    },
    {
      detail: request.received_at ? formatRequestDate(request.received_at) : "Pending",
      key: "received",
      label: "Received",
      state: status === "COMPLETED" ? "complete" : "pending",
    },
  ];
};

export const requestContainsMedicine = (request = {}, medicineId = "") => {
  if (!medicineId || medicineId === "ALL") {
    return true;
  }

  return (request.items || []).some((item) => item.medicine_id === medicineId);
};

export const normalizeRequestErrorMessage = (message = "") => {
  if (message.includes("request_item_unique_medicine")) {
    return "Each medicine can appear only once per request. Update the existing quantity instead.";
  }

  return message;
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

export const getAverageApprovalTimeLabel = (requests = []) => {
  const timings = requests
    .filter((request) =>
      ["APPROVED", "COMPLETED"].includes(request.status) && request.approved_at
    )
    .map(
      (request) =>
        (new Date(request.approved_at).getTime() - new Date(request.request_date).getTime()) /
        86400000
    );

  if (timings.length === 0) {
    return "—";
  }

  const average = timings.reduce((total, timing) => total + timing, 0) / timings.length;

  if (average < 1) {
    return `${Math.max(Math.round(average * 24), 1)} hours`;
  }

  return `${average.toFixed(1)} days`;
};

export const buildRequestsCsv = (requests = []) => {
  const escapeCell = (value) => {
    const text = String(value ?? "");

    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const header = ["Request Number", "Date", "Status", "Items", "Total Quantity", "Remarks"];
  const rows = requests.map((request) => [
    getRequestNumber(request.id),
    formatRequestDate(request.request_date),
    request.status,
    (request.items || []).map(getItemLabel).join("; "),
    getRequestTotalQuantity(request),
    request.remarks || "",
  ]);

  return [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
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
