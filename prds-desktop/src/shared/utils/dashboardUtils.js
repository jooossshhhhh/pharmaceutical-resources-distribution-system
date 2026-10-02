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
  if (role === "BHW") {
    return {
      role,
      canReviewUsers: false,
      coverageLabel: "Assigned Facility Coverage",
      requestLabel: "My Facility Requests",
      scopeLabel: facilityName
        ? `${facilityName} facility view`
        : "Assigned facility view",
      subtitle:
        facilityCode || "Monitor requests, stock risks, and forecast trends for your assigned facility.",
      title: facilityName || "Facility Dashboard",
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
      title: facilityName || "CHO Operations",
    };
  }

  return {
    role: "PHARMA_II",
    canReviewUsers: true,
    coverageLabel: "City of Naga Health Center Coverage",
    requestLabel: "System Request Queue",
    scopeLabel: "System-wide CHO oversight",
    subtitle:
      facilityCode || "Review requests, approvals, stock risks, forecasting, and facility activity.",
    title: facilityName || "Admin Overview",
  };
};

export const getDashboardStatCards = ({ config, inventoryPath, stats }) => {
  const facilityLabel = config?.role === "BHW" ? "at your facility" : "across facilities";
  return [
    { key: "stockedBatches", label: "Stocked Batches", description: `Inventory batches with stock ${facilityLabel}.`, tone: "blue", to: inventoryPath, value: stats.stockedBatches },
    { key: "dispensedThisMonth", label: "Dispensed This Month", description: `Valid dispensing quantity this month ${facilityLabel}.`, tone: "teal", to: "/dispensing", value: stats.dispensedThisMonth },
    { key: "activePatients", label: "Active Patients", description: `Patients not archived ${facilityLabel}.`, tone: "emerald", to: "/patients", value: stats.activePatients },
    { key: "pendingRequests", label: config?.role === "BHW" ? "My Pending Requests" : "Pending Requests", description: "Requests waiting for review or action.", tone: "orange", to: "/requests?status=pending", value: stats.pendingRequests },
    { key: "criticalStock", label: "Critical Stock", description: "Batches at immediate-restock level.", tone: "red", to: inventoryPath, value: stats.criticalStock },
    { key: "lowStock", label: "Low Stock", description: "Batches below their configured threshold.", tone: "orange", to: inventoryPath, value: stats.lowStock },
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
  for (const row of inventoryRows) {
    const quantity = Number(row.quantity || 0);
    if (quantity > 0) metrics.stockedBatches += 1;
    const status = getStockStatus(row);
    if (status === "CRITICAL") metrics.criticalStock += 1;
    if (status === "LOW") metrics.lowStock += 1;
  }
  return metrics;
};

export const countActivePatients = (patientRows = []) =>
  patientRows.filter((patient) => !patient.archived_at).length;

export const getMonthlyDispensedQuantity = (dispensingRows = [], now = new Date()) => {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return dispensingRows.reduce((sum, row) => {
    const date = new Date(row.dispense_date);
    if (
      !row.dispense_date || Number.isNaN(date.getTime()) ||
      date < monthStart || date >= nextMonthStart || row.voided_at ||
      row.record_type === "HISTORY_ONLY"
    ) return sum;
    return sum + Number(row.quantity || 0);
  }, 0);
};

const stockStatusRank = {
  CRITICAL: 3,
  LOW: 2,
  WATCH: 1,
  HEALTHY: 0,
};

export const buildFacilityStockStatus = (inventoryRows) => {
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
    CRITICAL: { color: "#ef4444", className: "bg-red-100 text-red-700" },
    LOW: { color: "#f97316", className: "bg-orange-100 text-orange-700" },
    WATCH: { color: "#f59e0b", className: "bg-amber-100 text-amber-700" },
    HEALTHY: { color: "#00a36c", className: "bg-emerald-100 text-emerald-700" },
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

  const riskRank = { CRITICAL: 0, LOW: 1 };
  const stockAlertRows = inventoryData
    .filter((row) => ["CRITICAL", "LOW"].includes(getStockStatus(row)))
    .sort((first, second) =>
      riskRank[getStockStatus(first)] - riskRank[getStockStatus(second)] ||
      Number(first.quantity || 0) - Number(second.quantity || 0)
    )
    .slice(0, 5);

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
    dispensedThisMonth: getMonthlyDispensedQuantity(validDispensing, now),
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
    requestStatus: statusSummary,
    stockStatusByFacility: buildFacilityStockStatus(inventoryData),
    inventoryRows: inventoryData,
    demandByFacility: buildFacilityDemand(scopedForecast),
    recentRequests,
    facilityId,
    refreshedAt: new Date().toISOString(),
  };
};
