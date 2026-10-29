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
 * Builds an index of inventory items for fast O(1) unit cost and batch resolution.
 * Indexes by:
 * - id: inventory item id
 * - batch: uppercase batch_number / lot_number
 * - medId: medicine_id (stores inventory item with positive unit_cost if available)
 */
export const createInventoryIndex = (inventoryRows = []) => {
  const byId = new Map();
  const byBatch = new Map();
  const byMedId = new Map();

  let rows = Array.isArray(inventoryRows) ? inventoryRows : [];
  if (rows.length === 0 && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem("prds_snapshot_inventory");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          rows = parsed;
        }
      }
    } catch {}
  }

  rows.forEach((inv) => {
    if (!inv) return;
    const invId = inv.id ? String(inv.id) : "";
    if (invId) {
      byId.set(invId, inv);
    }
    const batch = (inv.batch_number || inv.lot_number || inv.lot_no || inv.lot || "").trim().toUpperCase();
    if (batch) {
      byBatch.set(batch, inv);
    }
    const medId = String(inv.medicine_id || inv.medicine?.id || "");
    if (medId) {
      const cost = Number(inv.unit_cost ?? inv.medicine?.unit_cost ?? 0);
      const existing = byMedId.get(medId);
      if (!existing || (cost > 0 && Number(existing.unit_cost ?? 0) <= 0)) {
        byMedId.set(medId, inv);
      }
    }
  });

  return { byId, byBatch, byMedId };
};

/**
 * Resolves unit cost for an item (dispensing row, request item, program medicine, or inventory row)
 * using waterfall priority:
 * 1. item.unit_cost_at_dispense (if > 0)
 * 2. item.total_cost_at_dispense / item.quantity (if > 0 and quantity > 0)
 * 3. item.unit_cost (if > 0)
 * 4. item.batch?.unit_cost or item.inventory?.unit_cost (if > 0)
 * 5. item.medicine?.unit_cost (if > 0)
 * 6. Matching inventory row from inventoryIndex / inventoryRows:
 *    - by inventory_id (item.inventory_id || item.batch?.id)
 *    - by batch_number (item.batch_number || item.lot_no || item.batch?.batch_number)
 *    - by medicine_id (item.medicine_id || item.medicine?.id)
 * 7. Matching medicine row from medicinesMap / localStorage snapshot
 * 8. Fallback to 0
 */
export const resolveItemUnitCost = (
  item,
  { inventoryIndex = null, inventoryRows = null, medicinesMap = null } = {}
) => {
  if (!item) return 0;

  // 1. Stored unit_cost_at_dispense
  const atDispense = Number(item.unit_cost_at_dispense);
  if (Number.isFinite(atDispense) && atDispense > 0) return atDispense;

  // 2. Stored total_cost_at_dispense
  const totalAtDispense = Number(item.total_cost_at_dispense);
  const qty = Number(item.quantity) || 0;
  if (Number.isFinite(totalAtDispense) && totalAtDispense > 0 && qty > 0) {
    return totalAtDispense / qty;
  }

  // 3. Direct unit_cost
  const directCost = Number(item.unit_cost);
  if (Number.isFinite(directCost) && directCost > 0) return directCost;

  // 4. Joined batch or inventory object
  const batchCost = Number(item.batch?.unit_cost ?? item.inventory?.unit_cost);
  if (Number.isFinite(batchCost) && batchCost > 0) return batchCost;

  // 5. Attached medicine object unit_cost
  const medCost = Number(item.medicine?.unit_cost);
  if (Number.isFinite(medCost) && medCost > 0) return medCost;

  // 6. Resolve from inventory index / rows
  const index = inventoryIndex || (inventoryRows ? createInventoryIndex(inventoryRows) : null);
  if (index) {
    // 6a. Match by inventory_id
    const invId = String(item.inventory_id || item.batch?.id || "");
    if (invId && index.byId?.has(invId)) {
      const invMatch = index.byId.get(invId);
      const invCost = Number(invMatch.unit_cost ?? invMatch.medicine?.unit_cost);
      if (Number.isFinite(invCost) && invCost > 0) return invCost;
    }

    // 6b. Match by batch_number / lot
    const batchKey = (item.batch_number || item.lot_no || item.batch?.batch_number || "").trim().toUpperCase();
    if (batchKey && index.byBatch?.has(batchKey)) {
      const invMatch = index.byBatch.get(batchKey);
      const invCost = Number(invMatch.unit_cost ?? invMatch.medicine?.unit_cost);
      if (Number.isFinite(invCost) && invCost > 0) return invCost;
    }

    // 6c. Match by medicine_id
    const medId = String(item.medicine_id || item.medicine?.id || "");
    if (medId && index.byMedId?.has(medId)) {
      const invMatch = index.byMedId.get(medId);
      const invCost = Number(invMatch.unit_cost ?? invMatch.medicine?.unit_cost);
      if (Number.isFinite(invCost) && invCost > 0) return invCost;
    }
  }

  // 7. Resolve from medicinesMap or snapshot
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

  const medId = String(item.medicine_id || item.medicine?.id || "");
  if (resolvedMedsMap && medId) {
    const found = resolvedMedsMap.get ? resolvedMedsMap.get(medId) : resolvedMedsMap[medId];
    if (found) {
      const foundCost = Number(found.unit_cost);
      if (Number.isFinite(foundCost) && foundCost > 0) return foundCost;
    }
  }

  return 0;
};

/**
 * Normalizes request items from completed medicine requests
 */
export const extractCompletedRequestItems = (
  requestRows = [],
  targetDateKey = null,
  medicinesMap = null,
  inventoryIndex = null
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
      const unitCost = resolveItemUnitCost(item, { inventoryIndex, medicinesMap });

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
  const inventoryIndex = createInventoryIndex(inventoryRows);

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

  // 1. Walk-in dispensing on selected date
  const todaysWalkIns = dispensingRows.filter((row) => {
    if (row.voided_at) return false;
    const rowDate = toDateKey(row.dispense_date || row.created_at);
    return rowDate === targetDateKey;
  });

  const walkInUnits = todaysWalkIns.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  const walkInCost = todaysWalkIns.reduce((sum, r) => {
    const qty = Number(r.quantity) || 0;
    const unitCost = resolveItemUnitCost(r, { inventoryIndex, medicinesMap: resolvedMedsMap });
    return sum + qty * unitCost;
  }, 0);

  // 2. Completed medicine requests to Barangay Health Centers on selected date
  const todaysBhwItems = extractCompletedRequestItems(requestRows, targetDateKey, resolvedMedsMap, inventoryIndex);

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
    const unitCost = resolveItemUnitCost(item, { inventoryIndex, medicinesMap: resolvedMedsMap });
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
  inventoryRows = [],
  selectedDate = new Date(),
  limit = 5,
  medicinesMap = null,
}) => {
  const targetDateKey = toDateKey(selectedDate);
  const inventoryIndex = createInventoryIndex(inventoryRows);
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
    } catch { }
  }

  // Combine walk-ins
  dispensingRows.forEach((r) => {
    if (r.voided_at) return false;
    if (toDateKey(r.dispense_date || r.created_at) !== targetDateKey) return;
    const med = r.medicine || {};
    const name = med.generic_name
      ? `${med.generic_name}${med.dosage ? ` ${med.dosage}` : ""}`
      : r.generic_name || "Unknown Medicine";
    const qty = Number(r.quantity) || 0;
    const unitCost = resolveItemUnitCost(r, { inventoryIndex, medicinesMap: resolvedMedsMap });

    const existing = map.get(name) || { name, quantity: 0, cost: 0, brand: med.brand_name || "" };
    existing.quantity += qty;
    existing.cost += qty * unitCost;
    map.set(name, existing);
  });

  // Combine completed request items
  const bhwItems = extractCompletedRequestItems(requestRows, targetDateKey, resolvedMedsMap, inventoryIndex);
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

  const PALETTE = ["#1F4E5A", "#34769B", "#4C9F80", "#D9826B", "#286575", "#5B7077", "#2D7A5D"];

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
  inventoryRows = [],
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1, // 1-indexed (1-12)
  medicinesMap = null,
}) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyMap = new Map();
  const inventoryIndex = createInventoryIndex(inventoryRows);

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
    } catch { }
  }

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
    const unitCost = resolveItemUnitCost(r, { inventoryIndex, medicinesMap: resolvedMedsMap });
    current.units += qty;
    current.cost += qty * unitCost;
    dailyMap.set(d, current);
  });

  // Add completed requests
  const allCompletedItems = extractCompletedRequestItems(requestRows, null, resolvedMedsMap, inventoryIndex);
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

/**
 * Aggregates monthly dispensing distribution across the 3 primary channels:
 * 1. Medicine Requests (Barangay Health Stations / Facilities)
 * 2. Walk-in in the CHO (Direct Patient Dispensing)
 * 3. Other Programs (Special Area Allocations & Health Missions)
 */
export const aggregateMonthlyDispensingDistribution = ({
  dispensingRows = [],
  requestRows = [],
  otherProgramsRows = [],
  inventoryRows = [],
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  medicinesMap = null,
}) => {
  const targetMonthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const inventoryIndex = createInventoryIndex(inventoryRows);

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
    } catch { }
  }

  // 1. Walk-in in the CHO
  let walkInUnits = 0;
  let walkInCost = 0;
  dispensingRows.forEach((r) => {
    if (r.voided_at) return;
    const dateKey = toDateKey(r.dispense_date || r.created_at);
    if (!dateKey.startsWith(targetMonthPrefix)) return;
    const qty = Number(r.quantity) || 0;
    const unitCost = resolveItemUnitCost(r, { inventoryIndex, medicinesMap: resolvedMedsMap });
    walkInUnits += qty;
    walkInCost += qty * unitCost;
  });

  // 2. Medicine Requests (Barangays)
  let requestUnits = 0;
  let requestCost = 0;
  requestRows.forEach((req) => {
    if (req.status !== "COMPLETED") return;
    const dateKey = toDateKey(
      req.approved_at || req.received_at || req.updated_at || req.request_date
    );
    if (!dateKey.startsWith(targetMonthPrefix)) return;
    const items = req.items || [];
    items.forEach((item) => {
      const qty = Number(item.quantity) || 0;
      const unitCost = resolveItemUnitCost(item, { inventoryIndex, medicinesMap: resolvedMedsMap });
      requestUnits += qty;
      requestCost += qty * unitCost;
    });
  });

  // 3. Other Programs
  let otherProgramUnits = 0;
  let otherProgramCost = 0;
  otherProgramsRows.forEach((prog) => {
    if (prog.status === "CANCELLED") return;
    const dateKey = toDateKey(
      prog.program_date || prog.completed_at || prog.created_at
    );
    if (!dateKey.startsWith(targetMonthPrefix)) return;
    const meds = prog.medicines || [];
    meds.forEach((m) => {
      const qty = Number(m.quantity_used || m.quantity) || 0;
      const unitCost = resolveItemUnitCost(m, { inventoryIndex, medicinesMap: resolvedMedsMap });
      otherProgramUnits += qty;
      otherProgramCost += qty * unitCost;
    });
  });

  const totalUnits = walkInUnits + requestUnits + otherProgramUnits;
  const totalCost = walkInCost + requestCost + otherProgramCost;

  const channels = [
    {
      id: "requests",
      name: "Medicine Requests",
      description: "Barangay Health Stations",
      units: requestUnits,
      cost: requestCost,
      percentage: totalUnits > 0 ? Number(((requestUnits / totalUnits) * 100).toFixed(1)) : 0,
      color: "#1F4E5A", // PRDS Deep Clinical Teal
    },
    {
      id: "walk_in",
      name: "Walk-in",
      description: "CHO Pharmacy Dispensing",
      units: walkInUnits,
      cost: walkInCost,
      percentage: totalUnits > 0 ? Number(((walkInUnits / totalUnits) * 100).toFixed(1)) : 0,
      color: "#34769B", // PRDS Caring Sky Blue
    },
    {
      id: "other_programs",
      name: "Other Programs",
      description: "Special Allocations & Missions",
      units: otherProgramUnits,
      cost: otherProgramCost,
      percentage: totalUnits > 0 ? Number(((otherProgramUnits / totalUnits) * 100).toFixed(1)) : 0,
      color: "#4C9F80", // PRDS Healing Mint
    },
  ];

  return {
    channels,
    totalUnits,
    totalCost,
  };
};

/**
 * Aggregates dispensing volume and cost by hour of day for the selected date.
 * Focuses on dispensary operating hours (8:00 AM to 5:00 PM) while dynamically
 * including any outside-hours transactions if recorded.
 */
export const aggregateHourlyDispensingFlow = ({
  dispensingRows = [],
  requestRows = [],
  inventoryRows = [],
  selectedDate = new Date(),
  medicinesMap = null,
}) => {
  const targetDateKey = toDateKey(selectedDate);
  const inventoryIndex = createInventoryIndex(inventoryRows);
  const hourlySlots = {};

  // Standard dispensary working hours: 8 AM to 5 PM (8 to 17)
  for (let h = 8; h <= 17; h++) {
    hourlySlots[h] = {
      hour: h,
      label: h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`,
      units: 0,
      walkInUnits: 0,
      bhwUnits: 0,
      cost: 0,
      transactions: 0,
    };
  }

  // 1. Process Walk-ins
  dispensingRows.forEach((row) => {
    if (row.voided_at) return;
    const rawTime = row.dispense_date || row.created_at;
    if (!rawTime) return;
    if (toDateKey(rawTime) !== targetDateKey) return;

    const d = new Date(rawTime);
    if (isNaN(d.getTime())) return;
    const hour = d.getHours();

    if (!hourlySlots[hour]) {
      hourlySlots[hour] = {
        hour,
        label: hour === 0 ? "12 AM" : hour === 12 ? "12 PM" : hour < 12 ? `${hour} AM` : `${hour - 12} PM`,
        units: 0,
        walkInUnits: 0,
        bhwUnits: 0,
        cost: 0,
        transactions: 0,
      };
    }

    const qty = Number(row.quantity) || 0;
    const unitCost = resolveItemUnitCost(row, { inventoryIndex, medicinesMap });
    hourlySlots[hour].units += qty;
    hourlySlots[hour].walkInUnits += qty;
    hourlySlots[hour].cost += qty * unitCost;
    hourlySlots[hour].transactions += 1;
  });

  // 2. Process Completed Barangay Requests
  requestRows.forEach((req) => {
    if (req.status !== "COMPLETED") return;
    const rawTime = req.approved_at || req.received_at || req.updated_at || req.request_date;
    if (!rawTime) return;
    if (toDateKey(rawTime) !== targetDateKey) return;

    const d = new Date(rawTime);
    if (isNaN(d.getTime())) return;
    const hour = d.getHours();

    if (!hourlySlots[hour]) {
      hourlySlots[hour] = {
        hour,
        label: hour === 0 ? "12 AM" : hour === 12 ? "12 PM" : hour < 12 ? `${hour} AM` : `${hour - 12} PM`,
        units: 0,
        walkInUnits: 0,
        bhwUnits: 0,
        cost: 0,
        transactions: 0,
      };
    }

    const items = req.items || [];
    items.forEach((item) => {
      const qty = Number(item.quantity) || 0;
      const unitCost = resolveItemUnitCost(item, { inventoryIndex, medicinesMap });
      hourlySlots[hour].units += qty;
      hourlySlots[hour].bhwUnits += qty;
      hourlySlots[hour].cost += qty * unitCost;
    });
    hourlySlots[hour].transactions += 1;
  });

  // Convert to sorted array
  const sortedHours = Object.keys(hourlySlots)
    .map(Number)
    .sort((a, b) => a - b);

  const hoursData = sortedHours.map((h) => ({
    ...hourlySlots[h],
    cost: Number(hourlySlots[h].cost.toFixed(2)),
  }));

  const totalUnits = hoursData.reduce((sum, h) => sum + h.units, 0);
  const totalCost = hoursData.reduce((sum, h) => sum + h.cost, 0);

  // Identify peak hour
  let peakHour = null;
  let maxUnits = 0;
  hoursData.forEach((h) => {
    if (h.units > maxUnits) {
      maxUnits = h.units;
      peakHour = h;
    }
  });

  return {
    hours: hoursData,
    totalUnits,
    totalCost,
    peakHour: maxUnits > 0 ? peakHour : null,
  };
};

/**
 * Extracts and formats all dispensing and allocation transactions for the selected date.
 * Returns a sorted array (newest to oldest) suitable for on-screen table viewing and search.
 */
export const getDailyDispensingTransactions = ({
  dispensingRows = [],
  requestRows = [],
  inventoryRows = [],
  selectedDate = new Date(),
  medicinesMap = null,
}) => {
  const targetDateKey = toDateKey(selectedDate);
  const inventoryIndex = createInventoryIndex(inventoryRows);
  const transactions = [];

  const formatTime = (dateInput) => {
    if (!dateInput) return "--:--";
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "--:--";
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  };

  // 1. Walk-in rows
  dispensingRows.forEach((row) => {
    if (row.voided_at) return;
    const rawTime = row.dispense_date || row.created_at;
    if (!rawTime) return;
    if (toDateKey(rawTime) !== targetDateKey) return;

    const p = row.patient || {};
    const patientName = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Walk-in Patient";
    const patientCode = p.patient_code || "";
    const med = row.medicine || {};
    const generic = (med.generic_name || row.generic_name || "").trim();
    const dosage = (med.dosage || row.dosage || "").trim();
    const brand = (med.brand_name || row.brand_name || "").trim();
    const desc = formatItemDescription(generic, dosage);
    const qty = Number(row.quantity) || 0;
    const unitCost = resolveItemUnitCost(row, { inventoryIndex, medicinesMap });
    const doctor = row.prescribed_by?.trim() || "Attending Physician";
    const dispenser = row.dispenser
      ? [row.dispenser.first_name, row.dispenser.last_name].filter(Boolean).join(" ")
      : row.manual_dispensed_by || "CHO Pharmacist";

    transactions.push({
      id: `walkin-${row.id}`,
      rawTime,
      timeFormatted: formatTime(rawTime),
      channel: "Walk-in",
      channelType: "walk_in",
      recipient: patientName,
      recipientSub: patientCode,
      medicineName: desc,
      brandName: brand,
      quantity: qty,
      unit: med.unit_of_measure || row.unit_of_measure || "units",
      unitCost,
      totalCost: qty * unitCost,
      prescribedBy: doctor,
      dispensedBy: dispenser,
      batchNumber: row.batch?.batch_number || "-",
      facility: "CHO Pharmacy",
    });
  });

  // 2. Completed Barangay Requisition rows
  requestRows.forEach((req) => {
    if (req.status !== "COMPLETED") return;
    const rawTime = req.approved_at || req.received_at || req.updated_at || req.request_date;
    if (!rawTime) return;
    if (toDateKey(rawTime) !== targetDateKey) return;

    const facilityName = (
      req.facility?.facility_name ||
      req.destination_facility_name ||
      "Barangay Health Station"
    ).toUpperCase();

    const items = req.items || [];
    items.forEach((item, idx) => {
      const med =
        item.medicine ||
        (medicinesMap?.get ? medicinesMap.get(item.medicine_id) : null) ||
        {};
      const generic = (med.generic_name || item.generic_name || "").trim();
      const dosage = (med.dosage || item.dosage || "").trim();
      const brand = (med.brand_name || item.brand_name || "").trim();
      const desc = formatItemDescription(generic, dosage);
      const qty = Number(item.quantity) || 0;
      const unitCost = resolveItemUnitCost(item, { inventoryIndex, medicinesMap });

      const reqNumber = req.request_number || (req.id ? `RQ-${String(req.id).slice(0, 8).toUpperCase()}` : "RIS Request");
      const requesterName = req.requester
        ? [req.requester.first_name, req.requester.last_name].filter(Boolean).join(" ")
        : req.manual_requested_by || "Requisition Slip";
      const approverName = req.approver
        ? [req.approver.first_name, req.approver.last_name].filter(Boolean).join(" ")
        : "CHO Pharmacist";

      transactions.push({
        id: `bhw-${req.id}-${item.id || idx}`,
        rawTime,
        timeFormatted: formatTime(rawTime),
        channel: "Barangay Request",
        channelType: "requests",
        recipient: facilityName,
        recipientSub: reqNumber,
        medicineName: desc,
        brandName: brand,
        quantity: qty,
        unit: med.unit_of_measure || item.unit_of_measure || "units",
        unitCost,
        totalCost: qty * unitCost,
        prescribedBy: requesterName || "Requisition Slip",
        dispensedBy: approverName || "CHO Supply Center",
        requestedBy: requesterName || "Requisition Slip",
        releasedBy: approverName || "CHO Supply Center",
        batchNumber: "Warehouse Batch",
        facility: facilityName,
      });
    });
  });

  // Sort newest first
  transactions.sort((a, b) => {
    const timeA = new Date(a.rawTime).getTime() || 0;
    const timeB = new Date(b.rawTime).getTime() || 0;
    return timeB - timeA;
  });

  return transactions;
};
