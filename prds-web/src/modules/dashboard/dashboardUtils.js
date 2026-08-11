export const emptyStats = {
  medicineCatalog: 0,
  pendingRequests: 0,
  lowStock: 0,
  activeFacilities: 0,
  pendingApprovals: 0,
  transfersCompleted: 0,
  expiringSoon: 0,
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
  const cards = [
    {
      description: "Requests waiting for review and action.",
      key: "pendingRequests",
      label: "Pending Requests",
      tone: "orange",
      to: "/requests?status=pending",
      value: stats.pendingRequests,
    },
    {
      description: "Medicine batches at or below threshold.",
      key: "lowStock",
      label: "Low / Out-of-Stock",
      tone: "red",
      to: `${inventoryPath}?stock=low`,
      value: stats.lowStock,
    },
  ];

  if (config?.canReviewUsers) {
    cards.push({
      description: "New users waiting for administrator approval.",
      key: "pendingApprovals",
      label: "Pending Approvals",
      tone: "emerald",
      to: "/users",
      value: stats.pendingApprovals,
    });
  }

if (config?.role === "BHW") {
    cards.push({
      description: "Medicine batches expiring within 90 days.",
      key: "expiringSoon",
      label: "Expiring Soon",
      tone: "amber",
      to: inventoryPath,
      value: stats.expiringSoon,
    },
    {
      description: "Open your assigned facility inventory and request context.",
      key: "myFacility",
      label: "My Facility",
      tone: "blue",
      to: inventoryPath,
      value: stats.activeFacilities || 1,
    });

    return cards;
  }

  cards.push(
    {
      description: "Active facilities covered by the distribution system.",
      key: "activeFacilities",
      label: "Active Facilities",
      tone: "blue",
      to: "/facilities",
      value: stats.activeFacilities,
    },
    {
      description: "Medicine batches expiring within 90 days.",
      key: "expiringSoon",
      label: "Expiring Soon",
      tone: "amber",
      to: inventoryPath,
      value: stats.expiringSoon,
    },
    {
      description: "Completed stock transfers across facilities.",
      key: "transfersCompleted",
      label: "Transfers Completed",
      tone: "blue",
      to: "/transfers",
      value: stats.transfersCompleted,
    }
  );

  if (config?.role === "PHARMA_I") {
    cards.splice(cards.length - 1, 0, {
      description: "Catalog records available for inventory and requests.",
      key: "medicineCatalog",
      label: "Medicine Catalog",
      tone: "teal",
      to: "/medicines",
      value: stats.medicineCatalog,
    });
  }

  return cards;
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
