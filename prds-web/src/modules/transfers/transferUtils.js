export const transferStatuses = [
  { value: "ALL", label: "All transfers" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "READY_FOR_PICKUP", label: "Ready for Pickup" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REJECTED", label: "Rejected" },
];

export const transferSortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

export const transferActionTabs = [
  { value: "ACTIVE", label: "Active" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "READY_FOR_PICKUP", label: "Ready for Pickup" },
  { value: "HISTORY", label: "History" },
];

export const transferQueueStatusOptions = transferActionTabs.filter(
  (tab) => tab.value !== "HISTORY"
);

export const transferHistoryTabs = [
  { value: "HISTORY", label: "All history" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REJECTED", label: "Rejected" },
];

export const transferStatusLabels = {
  APPROVED: "Approved",
  COMPLETED: "Completed",
  PENDING: "Pending",
  READY_FOR_PICKUP: "Ready for Pickup",
  REJECTED: "Rejected",
};

export const transferStatusTones = {
  APPROVED: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-orange-50 text-orange-700",
  READY_FOR_PICKUP: "bg-teal-50 text-teal-700",
  REJECTED: "bg-red-50 text-red-700",
};

export const formatTransferNumber = (transferId = "") => {
  return `#TR-${transferId.slice(0, 8).toUpperCase() || "PENDING"}`;
};

export const formatTransferDate = (dateValue) => {
  if (!dateValue) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateValue));
};

export const getTransferMedicineFullLabel = (medicine = {}) => {
  const genericName = medicine.generic_name || "No generic name";
  const brandName = medicine.brand_name || "Generic";
  const unit = medicine.unit_of_measure || "No unit";
  const dosage = medicine.dosage || "No dosage";

  return `${genericName} - ${dosage} - ${brandName} - ${unit}`;
};

export const getTransferItemLabel = (item = {}) => {
  const medicine = item.medicine || {};
  const name = medicine.brand_name || medicine.generic_name || "Unknown medicine";
  const dosage = medicine.dosage ? ` ${medicine.dosage}` : "";

  return `${name}${dosage}`;
};

export const getTransferTotalQuantity = (transfer = {}) => {
  return (transfer.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0);
};

export const getTransferSummary = (transfers = []) => {
  return transfers.reduce(
    (summary, transfer) => {
      summary.total += 1;
      summary.pending += transfer.status === "PENDING" ? 1 : 0;
      summary.approved += transfer.status === "APPROVED" ? 1 : 0;
      summary.readyForPickup += transfer.status === "READY_FOR_PICKUP" ? 1 : 0;
      summary.completed += transfer.status === "COMPLETED" ? 1 : 0;
      summary.rejected += transfer.status === "REJECTED" ? 1 : 0;
      return summary;
    },
    { approved: 0, completed: 0, pending: 0, readyForPickup: 0, rejected: 0, total: 0 }
  );
};

export const getActiveTransferStatusFilter = (statusView = "ACTIVE") => {
  if (statusView === "ACTIVE") {
    return ["PENDING", "APPROVED", "READY_FOR_PICKUP"];
  }

  if (statusView === "HISTORY") {
    return ["COMPLETED", "REJECTED"];
  }

  return [statusView];
};

export const getTransferActionTabStatus = (statusView = "ACTIVE") => {
  const allowedStatuses = new Set([
    "ACTIVE",
    "PENDING",
    "APPROVED",
    "READY_FOR_PICKUP",
    "HISTORY",
    "COMPLETED",
    "REJECTED",
  ]);

  return allowedStatuses.has(statusView) ? statusView : "ACTIVE";
};

export const matchesTransferFilters = (
  transfer = {},
  {
    destinationFacilityId = "ALL",
    keyword = "",
    medicineId = "ALL",
    sourceFacilityId = "ALL",
    status = "ALL",
  } = {}
) => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const searchableText = [
    formatTransferNumber(transfer.id),
    transfer.status,
    transfer.remarks,
    transfer.source?.facility_name,
    transfer.source?.facility_code,
    transfer.destination?.facility_name,
    transfer.destination?.facility_code,
    ...(transfer.items || []).map(getTransferItemLabel),
    ...(transfer.items || []).map((item) => getTransferMedicineFullLabel(item.medicine || {})),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (normalizedKeyword && !searchableText.includes(normalizedKeyword)) {
    return false;
  }

  if (sourceFacilityId !== "ALL" && transfer.source_facility_id !== sourceFacilityId) {
    return false;
  }

  if (
    destinationFacilityId !== "ALL" &&
    transfer.destination_facility_id !== destinationFacilityId
  ) {
    return false;
  }

  if (status !== "ALL" && transfer.status !== status) {
    const statusList = Array.isArray(status) ? status : [status];

    if (!statusList.includes(transfer.status)) {
      return false;
    }
  }

  if (
    medicineId !== "ALL" &&
    !(transfer.items || []).some((item) => item.medicine_id === medicineId)
  ) {
    return false;
  }

  return true;
};

export const getMedicineAvailabilityOptions = (availabilityRows = [], keyword = "") => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const medicineMap = new Map();

  availabilityRows.forEach((row) => {
    const searchableText = [
      row.generic_name,
      row.brand_name,
      row.unit_of_measure,
      row.dosage,
      row.source_facility_name,
      row.source_facility_code,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (normalizedKeyword && !searchableText.includes(normalizedKeyword)) {
      return;
    }

    if (!medicineMap.has(row.medicine_id)) {
      medicineMap.set(row.medicine_id, {
        brand_name: row.brand_name,
        dosage: row.dosage,
        generic_name: row.generic_name,
        medicine_id: row.medicine_id,
        sources: [],
        unit_of_measure: row.unit_of_measure,
      });
    }

    medicineMap.get(row.medicine_id).sources.push(row);
  });

  return [...medicineMap.values()]
    .map((medicine) => ({
      ...medicine,
      sources: medicine.sources
        .filter((source) => Number(source.available_quantity || 0) > 0)
        .sort(
          (first, second) =>
            Number(second.available_quantity || 0) - Number(first.available_quantity || 0) ||
            (first.source_facility_name || "").localeCompare(second.source_facility_name || "")
        ),
    }))
    .filter((medicine) => medicine.sources.length > 0)
    .sort((first, second) =>
      (first.brand_name || first.generic_name || "").localeCompare(
        second.brand_name || second.generic_name || ""
      )
    );
};

export const sortTransfers = (transfers = [], sortMode = "newest") => {
  return [...transfers].sort((first, second) => {
    const firstTime = new Date(first.created_at || first.transfer_date || 0).getTime();
    const secondTime = new Date(second.created_at || second.transfer_date || 0).getTime();

    if (sortMode === "oldest") {
      return firstTime - secondTime;
    }

    return secondTime - firstTime;
  });
};

export const filterOutgoingTransfers = (transfers = [], facilityId = "") => {
  return transfers.filter((transfer) => transfer.destination_facility_id === facilityId);
};

export const filterIncomingTransfers = (transfers = [], facilityId = "") => {
  return transfers.filter((transfer) => transfer.source_facility_id === facilityId);
};

export const buildFefoInventoryRows = (rows = []) => {
  return [...rows].sort((first, second) => {
    const expiryComparison = (first.expiration_date || "").localeCompare(
      second.expiration_date || ""
    );

    if (expiryComparison !== 0) {
      return expiryComparison;
    }

    return (first.date_received || "").localeCompare(second.date_received || "");
  });
};

export const getTransferAvailabilityMap = (availabilityRows = []) => {
  return availabilityRows.reduce((availabilityMap, row) => {
    availabilityMap.set(`${row.source_facility_id}:${row.medicine_id}`, {
      availableQuantity: Number(row.available_quantity || 0),
      physicalQuantity: Number(row.physical_quantity || 0),
      reservedQuantity: Number(row.reserved_quantity || 0),
    });

    return availabilityMap;
  }, new Map());
};

export const validateTransferAvailability = (
  items = [],
  availabilityMap = new Map(),
  sourceFacilityId = ""
) => {
  for (const item of items) {
    const availability = availabilityMap.get(`${sourceFacilityId}:${item.medicine_id}`);
    const requestedQuantity = Number(item.quantity || 0);

    if (!item.medicine_id) {
      return "Select a medicine before submitting the transfer.";
    }

    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
      return "Transfer quantities must be positive whole numbers.";
    }

    if (!availability || availability.availableQuantity <= 0) {
      return "This medicine is not currently available from the selected source.";
    }

    if (requestedQuantity > availability.availableQuantity) {
      return `Requested quantity exceeds the ${availability.availableQuantity.toLocaleString()} units currently available from the selected source.`;
    }
  }

  return "";
};

export const getDuplicateTransferMedicineIds = (items = []) => {
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

export const buildFefoTransferAllocations = (transferItems = [], batches = []) => {
  const batchesByMedicine = batches.reduce((batchMap, batch) => {
    const medicineBatches = batchMap.get(batch.medicine_id) || [];
    medicineBatches.push(batch);
    batchMap.set(batch.medicine_id, medicineBatches);
    return batchMap;
  }, new Map());

  batchesByMedicine.forEach((medicineBatches) => {
    medicineBatches.sort((first, second) => {
      const expiryComparison = (first.expiration_date || "").localeCompare(
        second.expiration_date || ""
      );

      if (expiryComparison !== 0) {
        return expiryComparison;
      }

      return (first.batch_number || "").localeCompare(second.batch_number || "");
    });
  });

  return transferItems.flatMap((item) => {
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
          source_inventory_id: batch.id,
          transfer_item_id: item.id,
          quantity: allocatedQuantity,
        });
        remainingQuantity -= allocatedQuantity;
      }
    }

    return allocations;
  });
};

export const getTransferAllocationValidationError = (
  transferItems = [],
  batches = [],
  allocations = []
) => {
  const transferItemsById = new Map(transferItems.map((item) => [item.id, item]));
  const batchesById = new Map(batches.map((batch) => [batch.id, batch]));
  const allocatedByItem = new Map();
  const allocatedByBatch = new Map();

  for (const allocation of allocations) {
    const item = transferItemsById.get(allocation.transfer_item_id);
    const batch = batchesById.get(allocation.source_inventory_id);
    const quantity = Number(allocation.quantity || 0);

    if (!item || !batch) {
      return "Every allocation must use a valid transfer item and source batch.";
    }

    if (quantity <= 0 || !Number.isInteger(quantity)) {
      return "Batch allocation quantities must be positive whole numbers.";
    }

    if (batch.medicine_id !== item.medicine_id) {
      return "Selected source batch does not match the transfer medicine.";
    }

    allocatedByItem.set(item.id, (allocatedByItem.get(item.id) || 0) + quantity);
    allocatedByBatch.set(batch.id, (allocatedByBatch.get(batch.id) || 0) + quantity);
  }

  for (const batch of batches) {
    if ((allocatedByBatch.get(batch.id) || 0) > Number(batch.quantity || 0)) {
      return "Batch allocation exceeds the selected source stock quantity.";
    }
  }

  for (const item of transferItems) {
    const requestedQuantity = Number(item.quantity || 0);

    if ((allocatedByItem.get(item.id) || 0) !== requestedQuantity) {
      return `Allocate exactly ${requestedQuantity.toLocaleString()} units for this transfer item before releasing.`;
    }
  }

  return "";
};

export const getTransferTrackingSteps = (transfer = {}) => {
  const status = transfer.status || "PENDING";
  const approvedStatuses = ["APPROVED", "READY_FOR_PICKUP", "COMPLETED"];
  const readyStatuses = ["READY_FOR_PICKUP", "COMPLETED"];

  return [
    {
      detail: formatTransferDate(transfer.created_at),
      key: "requested",
      label: "Requested",
      state: "complete",
    },
    {
      detail: transfer.approved_at ? formatTransferDate(transfer.approved_at) : "CHO review",
      key: "approved",
      label: "CHO Approved",
      state: approvedStatuses.includes(status)
        ? "complete"
        : status === "REJECTED"
          ? "rejected"
          : "current",
    },
    {
      detail: transfer.transfer_date ? formatTransferDate(transfer.transfer_date) : "Source allocation",
      key: "ready",
      label: "Ready for Pickup",
      state: readyStatuses.includes(status)
        ? "complete"
        : status === "APPROVED"
          ? "current"
          : status === "REJECTED"
            ? "rejected"
            : "pending",
    },
    {
      detail: transfer.received_at ? formatTransferDate(transfer.received_at) : "Awaiting receipt",
      key: "received",
      label: "Received",
      state:
        status === "COMPLETED"
          ? "complete"
          : status === "READY_FOR_PICKUP"
            ? "current"
            : "pending",
    },
  ];
};

export const buildTransfersCsv = (transfers = []) => {
  const escapeCell = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const header = [
    "Transfer Number",
    "Date",
    "Source",
    "Destination",
    "Status",
    "Items",
    "Total Quantity",
    "Remarks",
  ];
  const rows = transfers.map((transfer) => [
    formatTransferNumber(transfer.id),
    formatTransferDate(transfer.created_at),
    transfer.source?.facility_name || "",
    transfer.destination?.facility_name || "",
    transfer.status,
    (transfer.items || []).map(getTransferItemLabel).join("; "),
    getTransferTotalQuantity(transfer),
    transfer.remarks || "",
  ]);

  return [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
};
