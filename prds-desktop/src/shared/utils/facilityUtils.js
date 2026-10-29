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
      barClass: "bg-[#4C9F80]",
      badgeClass: "bg-[#E2F3EC] text-[#226048] border border-[#4C9F80]/20",
      iconClass: "bg-[#E2F3EC] text-[#226048]",
      topBorderClass: "border-t-[#4C9F80]",
    },
    WATCH: {
      label: "Warning",
      barClass: "bg-[#34769B]",
      badgeClass: "bg-[#E3EEF5] text-[#1F4A66] border border-[#34769B]/25",
      iconClass: "bg-[#E3EEF5] text-[#1F4A66]",
      topBorderClass: "border-t-[#34769B]",
    },
    LOW: {
      label: "Low Stock",
      barClass: "bg-[#D9826B]",
      badgeClass: "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/25",
      iconClass: "bg-[#FBE9E3] text-[#8F3F2B]",
      topBorderClass: "border-t-[#D9826B]",
    },
    CRITICAL: {
      label: "Critical",
      barClass: "bg-[#D9826B]",
      badgeClass: "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/30",
      iconClass: "bg-[#FBE9E3] text-[#8F3F2B]",
      topBorderClass: "border-t-[#D9826B]",
    },
    NO_DATA: {
      label: "No stock data",
      barClass: "bg-[#CFDDE0]",
      badgeClass: "bg-[#E5EFF1] text-[#5B7077]",
      iconClass: "bg-[#E5EFF1] text-[#5B7077]",
      topBorderClass: "border-t-[#CFDDE0]",
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
    return { label: "Expired", badgeClass: "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/30" };
  }

  if (days <= 30) {
    return {
      label: days === 0 ? "Expires today" : `Exp. in ${days}d`,
      badgeClass: "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/25",
    };
  }

  if (days <= 90) {
    return { label: `Exp. in ${days}d`, badgeClass: "bg-[#E3EEF5] text-[#1F4A66] border border-[#34769B]/25" };
  }

  return null;
};

export const getMedicineName = (item) => {
  const genericName = item.medicine?.generic_name || "Medicine";
  const dosage = item.medicine?.dosage ? ` ${item.medicine.dosage}` : "";

  return `${genericName}${dosage}`.trim();
};

export const requestStatusMeta = {
  PENDING: "bg-[#FBE9E3] text-[#8F3F2B]",
  APPROVED: "bg-[#E2F3EC] text-[#226048]",
  COMPLETED: "bg-[#E2F3EC] text-[#226048]",
  REJECTED: "bg-[#FBE9E3] text-[#8F3F2B]",
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
      ? null
      : Math.round(
          inventoryRows.reduce((sum, item) => sum + getStockPercent(item), 0) /
            inventoryRows.length
        );

  const stockHealth =
    inventoryRows.length === 0
      ? "NO_DATA"
      : stockCounts.CRITICAL > 0
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

export const isChoFacility = (facility) => {
  if (!facility) return false;
  const code = (facility.facility_code || "").toUpperCase();
  const type = (facility.facility_type || "").toUpperCase();
  const name = (facility.facility_name || "").toLowerCase();
  return (
    code === "CHO-NAGA" ||
    code === "CHO" ||
    type === "CHO" ||
    type === "MAIN_HEALTH_CENTER" ||
    name.includes("city health office") ||
    name.includes("central health office")
  );
};
