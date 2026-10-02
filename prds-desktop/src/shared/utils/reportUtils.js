/**
 * PRDS Report Utilities
 * Pure helper functions for calculations, aggregations, and chart data formatting.
 */

/**
 * Formats a currency value to Philippine Peso (PHP / ₱)
 */
export const formatPeso = (amount = 0) => {
  const validAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(validAmount);
};

/**
 * Formats date object to standard human readable string e.g. "September 26, 2026"
 */
export const formatReportDate = (dateInput) => {
  if (!dateInput) return "";
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
};

/**
 * Formats medicine item description combining generic name and dosage.
 * Avoids redundant repetition if generic_name already contains dosage.
 */
export const formatItemDescription = (genericName = "", dosage = "") => {
  const generic = (genericName || "").trim();
  const dose = (dosage || "").trim();
  if (!generic && !dose) return "Medicine";
  if (!dose) return generic;
  if (!generic) return dose;
  if (generic.toLowerCase().includes(dose.toLowerCase())) {
    return generic;
  }
  return `${generic} ${dose}`;
};

/**
 * Converts a date, timestamp string, or date-only string to YYYY-MM-DD reliably without timezone shift bugs.
 */
export const toDateKey = (dateInput) => {
  if (!dateInput) return "";
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    // Fast path: pure date string YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // If it has time component
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Normalizes request items from completed medicine requests
 */
export const extractCompletedRequestItems = (
  requestRows = [],
  targetDateKey = null,
  medicinesMap = null
) => {
  const flattened = [];

  requestRows.forEach((req) => {
    // Only completed requests count as dispensed stock deduction
    if (req.status !== "COMPLETED") return;

    const reqDateKey = toDateKey(
      req.approved_at || req.received_at || req.updated_at || req.request_date
    );
    if (targetDateKey && reqDateKey !== targetDateKey) return;

    const facilityName = (
      req.facility?.facility_name ||
      req.destination_facility_name ||
      "Barangay Health Center"
    ).toUpperCase();

    const items = req.items || [];
    items.forEach((item) => {
      const med =
        item.medicine ||
        (medicinesMap?.get ? medicinesMap.get(item.medicine_id) : null) ||
        {};
      const generic = (med.generic_name || item.generic_name || "").trim();
      const dosage = (med.dosage || item.dosage || "").trim();
      const desc = formatItemDescription(generic, dosage);
      const brand = (med.brand_name || item.brand_name || "-").trim().toUpperCase();
      const unit = (med.unit_of_measure || item.unit_of_measure || "UNIT").trim().toUpperCase();
      const qty = Number(item.quantity) || 0;
      const unitCost = Number(med.unit_cost ?? item.unit_cost ?? 0);

      flattened.push({
        id: item.id || `${req.id}-${item.medicine_id}`,
        requestId: req.id,
        facilityId: req.facility_id,
        facilityName,
        medicine: med,
        description: desc,
        generic_name: generic,
        dosage,
        brand,
        unit,
        quantity: qty,
        unitCost,
        totalCost: qty * unitCost,
        dateKey: reqDateKey,
        approvedAt:
          req.approved_at || req.received_at || req.updated_at || req.request_date,
      });
    });
  });

  return flattened;
};

/**
 * Calculates the 4 non-redundant Summary KPI Cards:
 * 1. Medicines Dispensed Today (Units: Walk-in + Completed Requests to Barangays)
 * 2. Total Medicine Cost (Sum of unit_cost * qty for today)
 * 3. Total Remaining Stock (Sum of unit_cost * qty for active inventory)
 * 4. Low Stock Warning (Count of medicines below threshold and names)
 */
export const calculateReportKpis = ({
  dispensingRows = [],
  requestRows = [],
  inventoryRows = [],
  selectedDate = new Date(),
  medicinesMap = null,
}) => {
  const targetDateKey = toDateKey(selectedDate);

  // Resolve medicines map for unit cost lookup fallback
  let resolvedMedsMap = medicinesMap;
  if (!resolvedMedsMap && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem("prds_snapshot_medicines");
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          resolvedMedsMap = new Map(list.map((m) => [String(m.id), m]));
        }
      }
    } catch {
      // ignore
    }
  }

  const getMedUnitCost = (item) => {
    let cost = Number(item.unit_cost ?? item.medicine?.unit_cost);
    if (!isNaN(cost) && cost > 0) return cost;

    const medId = String(item.medicine_id || item.medicine?.id || "");
    if (resolvedMedsMap && medId) {
      const found = resolvedMedsMap.get ? resolvedMedsMap.get(medId) : resolvedMedsMap[medId];
      if (found) {
        const foundCost = Number(found.unit_cost);
        if (!isNaN(foundCost) && foundCost > 0) return foundCost;
      }
    }
    return 0;
  };

  // 1. Walk-in dispensing on selected date
  const todaysWalkIns = dispensingRows.filter((row) => {
    if (row.voided_at) return false;
    const rowDate = toDateKey(row.dispense_date || row.created_at);
    return rowDate === targetDateKey;
  });

  const walkInUnits = todaysWalkIns.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  const walkInCost = todaysWalkIns.reduce((sum, r) => {
    const qty = Number(r.quantity) || 0;
    const unitCost = getMedUnitCost(r);
    return sum + qty * unitCost;
  }, 0);

  // 2. Completed medicine requests to Barangay Health Centers on selected date
  const todaysBhwItems = extractCompletedRequestItems(requestRows, targetDateKey, resolvedMedsMap);

  const bhwUnits = todaysBhwItems.reduce((sum, item) => sum + item.quantity, 0);
  const bhwCost = todaysBhwItems.reduce((sum, item) => sum + item.totalCost, 0);

  const totalDispensedToday = walkInUnits + bhwUnits;
  const totalCostToday = walkInCost + bhwCost;

  // 3. Current active inventory valuation & health
  let totalRemainingStockValue = 0;
  let lowStockCount = 0;
  let expiredCount = 0;
  const lowStockNames = [];
  const now = new Date();

  inventoryRows.forEach((item) => {
    const qty = Number(item.quantity) || 0;
    const threshold = Number(item.threshold) || 10;
    const unitCost = getMedUnitCost(item);
    const medId = String(item.medicine_id || item.medicine?.id || "");
    const medName =
      item.medicine?.generic_name ||
      (resolvedMedsMap && medId ? (resolvedMedsMap.get ? resolvedMedsMap.get(medId) : resolvedMedsMap[medId])?.generic_name : null) ||
      item.generic_name ||
      "Medicine";

    totalRemainingStockValue += qty * unitCost;

    if (qty <= threshold && qty > 0) {
      lowStockCount++;
      if (lowStockNames.length < 3 && !lowStockNames.includes(medName)) {
        lowStockNames.push(medName);
      }
    }

    if (item.expiration_date) {
      const exp = new Date(item.expiration_date);
      if (!isNaN(exp.getTime()) && exp < now) {
        expiredCount++;
      }
    }
  });

  return {
    dispensedToday: {
      totalUnits: totalDispensedToday,
      walkInUnits,
      bhwUnits,
    },
    totalMedicineCost: totalCostToday,
    totalRemainingStockValue,
    stockHealth: {
      hasData: inventoryRows.length > 0,
      totalItems: inventoryRows.length,
      lowStockCount,
      lowStockNames,
      expiredCount,
    },
  };
};

/**
 * Aggregates top dispensed medicines for the selected date (Horizontal Bar Chart)
 */
export const aggregateTopMedicines = ({
  dispensingRows = [],
  requestRows = [],
  selectedDate = new Date(),
  limit = 5,
  medicinesMap = null,
}) => {
  const targetDateKey = toDateKey(selectedDate);
  const map = new Map();

  let resolvedMedsMap = medicinesMap;
  if (!resolvedMedsMap && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem("prds_snapshot_medicines");
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          resolvedMedsMap = new Map(list.map((m) => [String(m.id), m]));
        }
      }
    } catch {}
  }

  const getMedUnitCost = (r) => {
    let cost = Number(r.unit_cost ?? r.medicine?.unit_cost);
    if (!isNaN(cost) && cost > 0) return cost;
    const medId = String(r.medicine_id || r.medicine?.id || "");
    if (resolvedMedsMap && medId) {
      const found = resolvedMedsMap.get ? resolvedMedsMap.get(medId) : resolvedMedsMap[medId];
      if (found) {
        const foundCost = Number(found.unit_cost);
        if (!isNaN(foundCost) && foundCost > 0) return foundCost;
      }
    }
    return 0;
  };

  // Combine walk-ins
  dispensingRows.forEach((r) => {
    if (r.voided_at) return false;
    if (toDateKey(r.dispense_date || r.created_at) !== targetDateKey) return;
    const med = r.medicine || {};
    const name = med.generic_name
      ? `${med.generic_name}${med.dosage ? ` ${med.dosage}` : ""}`
      : r.generic_name || "Unknown Medicine";
    const qty = Number(r.quantity) || 0;
    const unitCost = getMedUnitCost(r);

    const existing = map.get(name) || { name, quantity: 0, cost: 0, brand: med.brand_name || "" };
    existing.quantity += qty;
    existing.cost += qty * unitCost;
    map.set(name, existing);
  });

  // Combine completed request items
  const bhwItems = extractCompletedRequestItems(requestRows, targetDateKey, resolvedMedsMap);
  bhwItems.forEach((item) => {
    const med = item.medicine || {};
    const name = med.generic_name
      ? `${med.generic_name}${med.dosage ? ` ${med.dosage}` : ""}`
      : "Unknown Medicine";

    const existing = map.get(name) || { name, quantity: 0, cost: 0, brand: med.brand_name || "" };
    existing.quantity += item.quantity;
    existing.cost += item.totalCost;
    map.set(name, existing);
  });

  return Array.from(map.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      label: `${item.name} (${item.quantity} units - ${formatPeso(item.cost)})`,
    }));
};

/**
 * Aggregates distribution across CHO and Barangay Health Centers (Donut Chart)
 */
export const aggregateFacilityDistribution = ({
  dispensingRows = [],
  requestRows = [],
  selectedDate = new Date(),
}) => {
  const targetDateKey = toDateKey(selectedDate);
  const facilityCounts = new Map();

  // 1. In-house walk-ins belong to "Pharmacy Dispensing (CHO)"
  let choWalkInUnits = 0;
  dispensingRows.forEach((r) => {
    if (r.voided_at) return;
    if (toDateKey(r.dispense_date || r.created_at) !== targetDateKey) return;
    choWalkInUnits += Number(r.quantity) || 0;
  });

  if (choWalkInUnits > 0) {
    facilityCounts.set("Pharmacy Dispensing (CHO)", choWalkInUnits);
  }

  // 2. Completed requests to Barangay Health Centers
  const bhwItems = extractCompletedRequestItems(requestRows, targetDateKey);
  bhwItems.forEach((item) => {
    const name = item.facilityName || "Barangay Health Center";
    facilityCounts.set(name, (facilityCounts.get(name) || 0) + item.quantity);
  });

  const total = Array.from(facilityCounts.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  const PALETTE = ["#00a36c", "#6be9c2", "#3b82f6", "#8b5cf6", "#f59e0b", "#06b6d4", "#ec4899"];

  return Array.from(facilityCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], index) => ({
      name,
      value,
      percentage: Math.round((value / total) * 100),
      color: PALETTE[index % PALETTE.length],
    }));
};

/**
 * Aggregates daily dispensing trend across the selected month (Area Trend Line Chart)
 */
export const aggregateDailyDispensingTrend = ({
  dispensingRows = [],
  requestRows = [],
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1, // 1-indexed (1-12)
  medicinesMap = null,
}) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyMap = new Map();

  let resolvedMedsMap = medicinesMap;
  if (!resolvedMedsMap && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem("prds_snapshot_medicines");
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          resolvedMedsMap = new Map(list.map((m) => [String(m.id), m]));
        }
      }
    } catch {}
  }

  const getMedUnitCost = (r) => {
    let cost = Number(r.unit_cost ?? r.medicine?.unit_cost);
    if (!isNaN(cost) && cost > 0) return cost;
    const medId = String(r.medicine_id || r.medicine?.id || "");
    if (resolvedMedsMap && medId) {
      const found = resolvedMedsMap.get ? resolvedMedsMap.get(medId) : resolvedMedsMap[medId];
      if (found) {
        const foundCost = Number(found.unit_cost);
        if (!isNaN(foundCost) && foundCost > 0) return foundCost;
      }
    }
    return 0;
  };

  for (let d = 1; d <= daysInMonth; d++) {
    dailyMap.set(d, { day: d, units: 0, cost: 0 });
  }

  const isMatchingMonth = (dateInput) => {
    if (!dateInput) return false;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return false;
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  };

  // Add dispensing
  dispensingRows.forEach((r) => {
    if (r.voided_at) return;
    const rawDate = r.dispense_date || r.created_at;
    if (!isMatchingMonth(rawDate)) return;
    const d = new Date(rawDate).getDate();
    const current = dailyMap.get(d) || { day: d, units: 0, cost: 0 };
    const qty = Number(r.quantity) || 0;
    const unitCost = getMedUnitCost(r);
    current.units += qty;
    current.cost += qty * unitCost;
    dailyMap.set(d, current);
  });

  // Add completed requests
  const allCompletedItems = extractCompletedRequestItems(requestRows, null, resolvedMedsMap);
  allCompletedItems.forEach((item) => {
    if (!isMatchingMonth(item.approvedAt)) return;
    const d = new Date(item.approvedAt).getDate();
    const current = dailyMap.get(d) || { day: d, units: 0, cost: 0 };
    current.units += item.quantity;
    current.cost += item.totalCost;
    dailyMap.set(d, current);
  });

  return Array.from(dailyMap.values()).map((item) => ({
    ...item,
    formattedDay: `${item.day}`,
  }));
};
