import { formatFacilityType, formatStatus } from "./facilityFormat.js";

export const formatDateTime = (date) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export const formatDate = (dateString) => {
  if (!dateString) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dateString));
};

export const formatNumber = (value) => {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
};

export const formatCurrency = (value) => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
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

export const getStockPercent = (item) => {
  const quantity = Number(item.quantity || 0);
  const threshold = Number(item.threshold || 1);
  const target = Math.max(threshold * 2, quantity, 1);

  return Math.max(3, Math.min(100, Math.round((quantity / target) * 100)));
};

export const getHealthMeta = (health) => {
  const meta = {
    HEALTHY: {
      label: "Healthy",
      barClass: "bg-emerald-500",
      badgeClass: "bg-emerald-100 text-emerald-700",
      iconClass: "bg-emerald-100 text-emerald-700",
      topBorderClass: "border-t-emerald-500",
    },
    WATCH: {
      label: "Warning",
      barClass: "bg-amber-500",
      badgeClass: "bg-amber-100 text-amber-700",
      iconClass: "bg-amber-100 text-amber-700",
      topBorderClass: "border-t-amber-500",
    },
    LOW: {
      label: "Low Stock",
      barClass: "bg-orange-500",
      badgeClass: "bg-orange-100 text-orange-700",
      iconClass: "bg-orange-100 text-orange-700",
      topBorderClass: "border-t-orange-500",
    },
    CRITICAL: {
      label: "Critical",
      barClass: "bg-red-500",
      badgeClass: "bg-red-100 text-red-700",
      iconClass: "bg-red-100 text-red-700",
      topBorderClass: "border-t-red-500",
    },
  };

  return meta[health] || meta.WATCH;
};

export const getExpiryMeta = (expirationDate) => {
  if (!expirationDate) {
    return null;
  }

  const days = Math.ceil((new Date(expirationDate).getTime() - Date.now()) / 86400000);

  if (days < 0) {
    return { label: "Expired", badgeClass: "bg-red-100 text-red-700" };
  }

  if (days <= 30) {
    return {
      label: days === 0 ? "Expires today" : `Exp. in ${days}d`,
      badgeClass: "bg-red-100 text-red-700",
    };
  }

  if (days <= 90) {
    return { label: `Exp. in ${days}d`, badgeClass: "bg-amber-100 text-amber-700" };
  }

  return null;
};

export const getMedicineName = (item) => {
  const genericName = item.medicine?.generic_name || "Medicine";
  const dosage = item.medicine?.dosage ? ` ${item.medicine.dosage}` : "";

  return `${genericName}${dosage}`.trim();
};

export const requestStatusMeta = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  REJECTED: "bg-red-100 text-red-700",
};

export const getRequestStatusMeta = (status) => {
  return {
    label: formatStatus(status),
    badgeClass: requestStatusMeta[status] || "bg-neutral-100 text-neutral-600",
  };
};

export const buildFacilityView = (facility, related) => {
  const inventoryRows = related.inventory.filter((item) => item.facility_id === facility.id);
  const requestRows = related.requests.filter((request) => request.facility_id === facility.id);
  const patientCount = related.patients.filter((patient) => patient.facility_id === facility.id).length;
  const forecastRows = related.forecasts.filter((forecast) => forecast.facility_id === facility.id);

  const stockCounts = inventoryRows.reduce(
    (counts, item) => {
      const status = getStockStatus(item);
      counts[status] += 1;
      counts.totalQuantity += Number(item.quantity || 0);
      counts.totalValue += Number(item.quantity || 0) * Number(item.medicine?.unit_cost || 0);
      return counts;
    },
    { HEALTHY: 0, WATCH: 0, LOW: 0, CRITICAL: 0, totalQuantity: 0, totalValue: 0 }
  );

  const healthPercent =
    inventoryRows.length === 0
      ? 0
      : Math.round(
          inventoryRows.reduce((sum, item) => sum + getStockPercent(item), 0) /
            inventoryRows.length
        );

  const stockHealth =
    stockCounts.CRITICAL > 0
      ? "CRITICAL"
      : stockCounts.LOW > 0
        ? "LOW"
        : healthPercent < 60
          ? "WATCH"
          : "HEALTHY";

  const completedRequests = requestRows.filter(
    (request) => request.status === "COMPLETED" || request.status === "APPROVED"
  ).length;
  const pendingRequests = requestRows.filter((request) => request.status === "PENDING").length;
  const distributionRate =
    requestRows.length === 0 ? 0 : Math.round((completedRequests / requestRows.length) * 100);
  const forecastTotal = forecastRows.reduce(
    (sum, forecast) => sum + Number(forecast.predicted_quantity || 0),
    0
  );

  return {
    ...facility,
    inventoryRows,
    requestRows,
    patientCount,
    forecastRows,
    stockCounts,
    healthPercent,
    stockHealth,
    distributionRate,
    pendingRequests,
    forecastTotal,
  };
};

export const filterFacilities = (facilities, { searchTerm = "", stockFilter = "ALL" } = {}) => {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  return facilities.filter((facility) => {
    const healthMeta = getHealthMeta(facility.stockHealth);
    const searchableText = [
      facility.facility_name,
      facility.facility_code,
      facility.address,
      formatFacilityType(facility.facility_type),
      formatStatus(facility.status),
      healthMeta.label,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
    const matchesStock = stockFilter === "ALL" || facility.stockHealth === stockFilter;

    return matchesSearch && matchesStock;
  });
};

export const sortFacilities = (facilities, sortDirection = "ASC") => {
  return [...facilities].sort((firstFacility, secondFacility) => {
    const comparison = firstFacility.facility_name.localeCompare(
      secondFacility.facility_name,
      undefined,
      { sensitivity: "base" }
    );

    return sortDirection === "ASC" ? comparison : -comparison;
  });
};
