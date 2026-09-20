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
