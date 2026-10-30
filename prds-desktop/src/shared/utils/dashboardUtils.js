import { formatFacilityName } from "./facilityFormat.js";

export const emptyStats = {
  stockedBatches: 0,
  dispensedThisMonth: 0,
  activePatients: 0,
  pendingRequests: 0,
  criticalStock: 0,
  lowStock: 0,
  pendingApprovals: 0,
};

export const getDashboardRoleConfig = ({ role, facilityName = "", facilityCode = "" } = {}) => {
  const normalizedFacilityName = formatFacilityName(facilityName).trim();

  if (role === "BHW") {
    return {
      role,
      canReviewUsers: false,
      coverageLabel: "Assigned Facility Coverage",
      requestLabel: "My Facility Requests",
      scopeLabel: normalizedFacilityName
        ? `${normalizedFacilityName} facility view`
        : "Assigned facility view",
      subtitle:
        facilityCode || "Monitor requests, stock risks, and forecast trends for your assigned facility.",
      title: normalizedFacilityName || "Facility Dashboard",
    };
  }

  if (role === "PHARMA_I") {
    return {
      role,
      canReviewUsers: false,
      coverageLabel: "City of Naga Health Center Coverage",
      requestLabel: "CHO Request Queue",
      scopeLabel: "CHO operations monitoring",
      subtitle:
        facilityCode || "Track medicine requests, facility stock health, and distribution activity.",
      title: normalizedFacilityName || "City Health Office - City of Naga",
    };
  }

  return {
    role: "PHARMA_II",
    canReviewUsers: true,
    coverageLabel: "City of Naga Health Center Coverage",
    requestLabel: "System Request Queue",
    scopeLabel: null,
    subtitle:
      facilityCode || "Review requests, approvals, stock risks, forecasting, and facility activity.",
    title: normalizedFacilityName || "City Health Office - City of Naga",
  };
};

export const getDashboardStatCards = ({ config, inventoryPath, stats }) => {
  const facilityLabel = config?.role === "BHW" ? "at your facility" : "across facilities";
  return [
    { key: "stockedBatches", label: "Stocked Batches", description: `Inventory batches with stock ${facilityLabel}.`, tone: "blue", to: inventoryPath, value: stats.stockedBatches },
    { key: "dispensedThisMonth", label: "Dispensed This Month", description: `Valid dispensing quantity this month ${facilityLabel}.`, tone: "teal", to: "/dispensing", value: stats.dispensedThisMonth },
    { key: "activePatients", label: "Active Patients", description: `Patients not archived ${facilityLabel}.`, tone: "emerald", to: "/patients", value: stats.activePatients },
    { key: "pendingRequests", label: config?.role === "BHW" ? "My Pending Requests" : "Pending Requests", description: "Requests waiting for review or action.", tone: "orange", to: "/requests?status=pending", value: stats.pendingRequests },
    { key: "criticalStock", label: "Critical Medicines", description: `Medicines at critical stockout level ${facilityLabel}.`, tone: "red", to: inventoryPath, value: stats.criticalStock },
    { key: "lowStock", label: "Low Stock Medicines", description: `Medicines below reorder threshold ${facilityLabel}.`, tone: "orange", to: inventoryPath, value: stats.lowStock },
  ];
};

export const getDashboardLayoutGroups = (cards = []) => {
  return {
    summaryCards: cards.slice(0, 6),
    overflowCards: cards.slice(6),
  };
};

export const formatNumber = (value) => {
  return new Intl.NumberFormat("en-US").format(value || 0);
};

export const formatDateTime = (date) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export const getInitials = (profile) => {
  const firstInitial = profile?.first_name?.[0] || "P";
  const lastInitial = profile?.last_name?.[0] || "A";

  return `${firstInitial}${lastInitial}`.toUpperCase();
};

export const getRelativeTime = (dateString) => {
  if (!dateString) {
    return "";
  }

  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return `${Math.round(diffHours / 24)}d ago`;
};

export const getStockStatus = (item) => {
  const quantity = Number(item.quantity || 0);
  const threshold = Number(item.threshold || 0);

  if (quantity === 0 || quantity <= Math.max(1, Math.floor(threshold * 0.25))) {
    return "CRITICAL";
  }

  if (quantity <= threshold) {
    return "LOW";
  }

  if (quantity <= threshold * 1.5) {
    return "WATCH";
  }

  return "HEALTHY";
};

export const getDashboardInventoryMetrics = (inventoryRows = []) => {
  const metrics = { stockedBatches: 0, criticalStock: 0, lowStock: 0 };
  const medicineTotals = new Map();
  let hasFacilityMedicineKeys = false;

  for (const row of inventoryRows) {
    const quantity = Number(row.quantity || 0);
    if (quantity > 0) metrics.stockedBatches += 1;

    if (row.facility_id && row.medicine_id) {
      hasFacilityMedicineKeys = true;
      const key = `${row.facility_id}:${row.medicine_id}`;
      const current = medicineTotals.get(key) || { quantity: 0, threshold: 0 };
      medicineTotals.set(key, {
        quantity: current.quantity + quantity,
        threshold: Math.max(current.threshold, Number(row.threshold || 0)),
      });
    } else {
      const status = getStockStatus(row);
      if (status === "CRITICAL") metrics.criticalStock += 1;
      if (status === "LOW") metrics.lowStock += 1;
    }
  }

  if (hasFacilityMedicineKeys) {
    for (const med of medicineTotals.values()) {
      const status = getStockStatus(med);
      if (status === "CRITICAL") metrics.criticalStock += 1;
      if (status === "LOW") metrics.lowStock += 1;
    }
  }

  return metrics;
};

export const getDashboardStockAlertRows = (inventoryData = []) => {
  const riskRank = { CRITICAL: 0, LOW: 1 };
  const medMap = new Map();

  for (const row of inventoryData || []) {
    const key = `${row.facility_id || "global"}:${row.medicine_id || row.id}`;
    const existing = medMap.get(key);
    const rowQty = Number(row.quantity || 0);
    const rowThreshold = Number(row.threshold || 0);

    if (!existing) {
      medMap.set(key, {
        ...row,
        totalQuantity: rowQty,
        maxThreshold: rowThreshold,
        batches: [row],
      });
    } else {
      existing.totalQuantity += rowQty;
      existing.maxThreshold = Math.max(existing.maxThreshold, rowThreshold);
      existing.batches.push(row);
    }
  }

  return Array.from(medMap.values())
    .map((entry) => {
      const status = getStockStatus({
        quantity: entry.totalQuantity,
        threshold: entry.maxThreshold,
      });
      const batchLabel =
        entry.batches.length > 1
          ? `${entry.batches.length} batches`
          : entry.batches[0]?.batch_number || "-";

      return {
        ...entry,
        quantity: entry.totalQuantity,
        threshold: entry.maxThreshold,
        riskStatus: status,
        batch_number: batchLabel,
      };
    })
    .filter((row) => ["CRITICAL", "LOW"].includes(row.riskStatus))
    .sort(
      (first, second) =>
        riskRank[first.riskStatus] - riskRank[second.riskStatus] ||
        Number(first.quantity || 0) - Number(second.quantity || 0)
    )
    .slice(0, 5);
};

export const countActivePatients = (patientRows = []) =>
  patientRows.filter((patient) => !patient.archived_at).length;

export const getMonthlyDispensedQuantity = (
  dispensingRows = [],
  requestRowsOrNow = new Date(),
  maybeNow = new Date()
) => {
  let requestRows = [];
  let now = new Date();

  if (requestRowsOrNow instanceof Date) {
    now = requestRowsOrNow;
  } else if (Array.isArray(requestRowsOrNow)) {
    requestRows = requestRowsOrNow;
    now = maybeNow instanceof Date ? maybeNow : new Date();
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const walkInTotal = dispensingRows.reduce((sum, row) => {
    const rawDate = row.dispense_date || row.created_at;
    if (!rawDate) return sum;
    const date = new Date(rawDate);
    if (
      Number.isNaN(date.getTime()) ||
      date < monthStart ||
      date >= nextMonthStart ||
      row.voided_at ||
      row.record_type === "HISTORY_ONLY"
    ) return sum;
    return sum + Number(row.quantity || 0);
  }, 0);

  const requestTotal = requestRows.reduce((sum, req) => {
    if (req.status !== "COMPLETED") return sum;
    const rawDate = req.approved_at || req.received_at || req.updated_at || req.request_date;
    if (!rawDate) return sum;
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime()) || date < monthStart || date >= nextMonthStart) return sum;
    const items = req.items || [];
    const itemsSum = items.reduce((iSum, item) => iSum + Number(item.quantity || 0), 0);
    return sum + itemsSum;
  }, 0);

  return walkInTotal + requestTotal;
};

const stockStatusRank = {
  CRITICAL: 3,
  LOW: 2,
  WATCH: 1,
  HEALTHY: 0,
};

export const buildFacilityStockStatus = (inventoryRows) => {
  const facilityMeds = new Map();
  let hasFacilityMedicineKeys = false;

  for (const row of inventoryRows || []) {
    const facilityId = row.facility_id;
    if (!facilityId) continue;
    if (row.medicine_id) {
      hasFacilityMedicineKeys = true;
      const key = `${facilityId}:${row.medicine_id}`;
      const current = facilityMeds.get(key) || { facilityId, quantity: 0, threshold: 0 };
      facilityMeds.set(key, {
        facilityId,
        quantity: current.quantity + Number(row.quantity || 0),
        threshold: Math.max(current.threshold, Number(row.threshold || 0)),
      });
    }
  }

  if (hasFacilityMedicineKeys) {
    const statusByFacility = {};
    for (const med of facilityMeds.values()) {
      const currentRank = statusByFacility[med.facilityId]
        ? stockStatusRank[statusByFacility[med.facilityId]]
        : -1;
      const medStatus = getStockStatus(med);
      const medRank = stockStatusRank[medStatus];

      if (medRank > currentRank) {
        statusByFacility[med.facilityId] = medStatus;
      }
    }
    return statusByFacility;
  }

  return (inventoryRows || []).reduce((statusByFacility, row) => {
    const facilityId = row.facility_id;
    if (!facilityId) {
      return statusByFacility;
    }

    const currentRank = statusByFacility[facilityId]
      ? stockStatusRank[statusByFacility[facilityId]]
      : -1;
    const rowRank = stockStatusRank[getStockStatus(row)];

    if (rowRank > currentRank) {
      statusByFacility[facilityId] = getStockStatus(row);
    }

    return statusByFacility;
  }, {});
};

export const buildFacilityDemand = (forecastRows) => {
  return (forecastRows || []).reduce((demandByFacility, row) => {
    const facilityId = row.facility_id;
    if (!facilityId) {
      return demandByFacility;
    }

    demandByFacility[facilityId] =
      (demandByFacility[facilityId] || 0) + Number(row.predicted_quantity || 0);

    return demandByFacility;
  }, {});
};

export const getFacilityStockTone = (status) => {
  const toneMap = {
    CRITICAL: { color: "#D9826B", className: "bg-[#faedf0] text-[#D9826B] border border-[#D9826B]/25" },
    LOW: { color: "#dc8939", className: "bg-[#fdf3e9] text-[#965315] border border-[#dc8939]/25" },
    WATCH: { color: "#f3f029", className: "bg-[#fefee6] text-[#716006] border border-[#f3f029]/60" },
    HEALTHY: { color: "#4C9F80", className: "bg-[#E8F5F1] text-[#2D7A5D] border border-[#4C9F80]/25" },
  };

  return toneMap[status] || toneMap.HEALTHY;
};

export const formatRole = (role) => {
  const roleLabels = {
    PHARMA_I: "Pharmacist",
    PHARMA_II: "Pharmacist II",
    BHW: "Barangay Health Worker",
  };

  return roleLabels[role] || "Staff";
};

export const groupDispensingByMonth = (rows = []) => {
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });

  return rows.reduce((summary, row) => {
    if (!row?.month) {
      return summary;
    }

    const label = monthFormatter.format(new Date(row.month));
    summary[label] = (summary[label] || 0) + Number(row.total_dispensed || 0);
    return summary;
  }, {});
};

export const compileDashboardSnapshot = ({
  inventory = [],
  facilities = [],
  patients = [],
  requests = [],
  dispensing = [],
  forecasting = [],
  users = [],
  facilityId = null,
  role = null,
} = {}) => {
  const isBhw = role === "BHW";
  const now = new Date();
  const formatLocalDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const scopedFacilities = isBhw && facilityId
    ? facilities.filter((f) => f.id === facilityId)
    : facilities;

  const inventoryData = isBhw && facilityId
    ? inventory.filter((item) => item.facility_id === facilityId)
    : inventory;

  const inventoryMetrics = getDashboardInventoryMetrics(inventoryData);
  const stockedRows = inventoryData.filter((row) => Number(row.quantity || 0) > 0);
  const expiringCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90);
  const todayDate = formatLocalDate(now);
  const cutoffDate = formatLocalDate(expiringCutoff);

  const expiringRows = stockedRows
    .filter((row) => row.expiration_date >= todayDate && row.expiration_date <= cutoffDate)
    .slice(0, 5);

  const stockAlertRows = getDashboardStockAlertRows(inventoryData);

  const scopedRequests = isBhw && facilityId
    ? requests.filter((r) => r.facility_id === facilityId)
    : requests;

  const defaultRequestStatus = { APPROVED: 0, PENDING: 0, DISPENSED: 0, REJECTED: 0 };
  const statusSummary = scopedRequests.reduce(
    (summary, row) => {
      const status = row.status === "COMPLETED" ? "DISPENSED" : row.status;
      if (summary[status] !== undefined) {
        summary[status] += 1;
      }
      return summary;
    },
    { ...defaultRequestStatus }
  );

  const recentRequests = scopedRequests.slice(0, 5).map((request) => {
    const firstItem = request.items?.[0];
    const medicine = firstItem?.medicine;
    const medicineLabel = medicine
      ? `${medicine.generic_name || "Medicine"} ${medicine.dosage || ""}`.trim()
      : "Medicine request";
    return {
      date: request.request_date ? new Date(request.request_date).toISOString().slice(0, 10) : "",
      facility: request.facility?.facility_name || "Facility not assigned",
      id: request.id,
      shortId: request.id ? String(request.id).slice(0, 8).toUpperCase() : "",
      itemCount: request.items?.length || 0,
      medicine: request.items?.length > 1 ? `${medicineLabel} + ${request.items.length - 1} more` : medicineLabel,
      quantity: request.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0,
      status: request.status,
    };
  });

  const scopedDispensing = isBhw && facilityId
    ? dispensing.filter((d) => d.facility_id === facilityId)
    : dispensing;

  const validDispensing = scopedDispensing.filter((d) => !d.voided_at && d.record_type !== "HISTORY_ONLY");

  const chartMonthRows = new Map();
  for (const row of validDispensing) {
    if (!row.dispense_date) continue;
    const date = new Date(row.dispense_date);
    if (Number.isNaN(date.getTime())) continue;
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
    chartMonthRows.set(month, (chartMonthRows.get(month) || 0) + Number(row.quantity || 0));
  }
  const dispensingRows = [...chartMonthRows].map(([month, total_dispensed]) => ({ month, total_dispensed }));

  const scopedPatients = isBhw && facilityId
    ? patients.filter((p) => p.facility_id === facilityId && !p.archived_at)
    : patients.filter((p) => !p.archived_at);

  const pendingRequestsCount = scopedRequests.filter((r) => r.status === "PENDING").length;
  const pendingApprovalsCount = users.filter((u) => u.status === "PENDING").length;

  const compiledStats = {
    ...inventoryMetrics,
    dispensedThisMonth: getMonthlyDispensedQuantity(validDispensing, scopedRequests, now),
    activePatients: scopedPatients.length,
    pendingRequests: pendingRequestsCount,
    pendingApprovals: pendingApprovalsCount,
  };

  const scopedForecast = isBhw && facilityId
    ? forecasting.filter((fc) => fc.facility_id === facilityId)
    : forecasting;

  return {
    stats: compiledStats,
    facilities: scopedFacilities,
    forecastRows: scopedForecast,
    stockAlertRows,
    expiringRows,
    dispensingRows,
    rawDispensing: validDispensing,
    allRequests: scopedRequests,
    requestStatus: statusSummary,
    stockStatusByFacility: buildFacilityStockStatus(inventoryData),
    inventoryRows: inventoryData,
    demandByFacility: buildFacilityDemand(scopedForecast),
    recentRequests,
    facilityId,
    refreshedAt: new Date().toISOString(),
  };
};
