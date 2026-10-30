/**
 * PRDS Stock Returns Service
 * Handles returned medicine stock from Barangay Health Centers as a separate
 * ledger from supplier procurement inventory.
 * 
 * Uses simplified, user-friendly terminology: "Return ID" and "Confirm".
 */

import { supabase } from "../client/supabase.js";
import { getSqliteDb, isTauriEnvironment } from "../database/sqliteClient.js";
import { getSnapshot, saveSnapshot, STORAGE_KEYS } from "../database/snapshotStore.js";
import { enqueueMutation } from "../sync/outboxQueue.js";
import { isChoFacility } from "../../shared/utils/facilityUtils.js";
import { isLotExpired, formatReturnId } from "../../shared/utils/inventoryUtils.js";

export { formatReturnId };

export const RETURN_REASON_OPTIONS = [
  { value: "PROGRAM_ENDED", label: "Program Ended", tone: "bg-blue-100 text-blue-700" },
  { value: "EXCESS_STOCK", label: "Excess Stock / Overstocked", tone: "bg-emerald-100 text-emerald-700" },
  { value: "NEARING_EXPIRY", label: "Nearing Expiration", tone: "bg-amber-100 text-amber-700" },
  { value: "REALLOCATION", label: "Reallocation / Recall", tone: "bg-purple-100 text-purple-700" },
  { value: "COLD_CHAIN_ALERT", label: "Temperature Alert / Storage Issue", tone: "bg-rose-100 text-rose-700" },
  { value: "DAMAGED_TRANSIT", label: "Damaged in Transit / Defective", tone: "bg-red-100 text-red-700" },
  { value: "OTHER", label: "Other Routine Return", tone: "bg-slate-100 text-slate-700" },
];

export const RETURN_STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "CONFIRMED", label: "Confirmed", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { value: "CANCELLED", label: "Cancelled", tone: "bg-rose-100 text-rose-800 border-rose-200" },
];

const isOnline = () => typeof navigator === "undefined" ? true : navigator.onLine;

const hasActiveAuthSession = async () => {
  if (!isOnline()) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data?.session?.access_token);
  } catch {
    return false;
  }
};

const createId = () =>
  globalThis.crypto?.randomUUID?.() || `ret_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const normalizeLotNo = (value = "") => String(value || "").trim().toUpperCase();

const toPositiveInt = (value, fallback = 0) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toMoneyNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const getReturnReasonLabel = (reason) => {
  const found = RETURN_REASON_OPTIONS.find((opt) => opt.value === reason);
  return found ? found.label : (reason || "Routine Return");
};

export const getReturnReasonTone = (reason) => {
  const found = RETURN_REASON_OPTIONS.find((opt) => opt.value === reason);
  return found ? found.tone : "bg-slate-100 text-slate-700";
};

export const getReturnStatusBadge = (status) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "CONFIRMED" || normalized === "VERIFIED" || normalized === "RECEIVED") {
    return { value: "CONFIRMED", label: "Confirmed", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  }
  if (normalized === "CANCELLED") {
    return { value: "CANCELLED", label: "Cancelled", tone: "bg-rose-100 text-rose-800 border-rose-200" };
  }
  if (normalized === "PENDING") {
    return { value: "PENDING", label: "Pending", tone: "bg-amber-100 text-amber-800 border-amber-200" };
  }
  return { value: status || "PENDING", label: status || "Pending", tone: "bg-slate-100 text-slate-700 border-slate-200" };
};

/**
 * Generates a clean, compact Return ID matching system-wide standards (e.g. RET-HGKO2601).
 */
export const generateReturnId = (_facilityCode = "BHW") => {
  const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase().padEnd(8, "0");
  return `RET-${randomSuffix}`;
};

// Backward-compatible alias
export const generateReturnSlipNo = generateReturnId;

/**
 * Normalizes brand name by stripping placeholder words like "generic", "none", "n/a", etc.
 */
export const formatBrandName = (brand) => {
  if (!brand) return "";
  const trimmed = String(brand).trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === "generic" ||
    lower === "generic (no brand)" ||
    lower === "none" ||
    lower === "n/a" ||
    lower === "—" ||
    lower === "-"
  ) {
    return "";
  }
  return trimmed;
};

/**
 * Resolves complete and accurate medicine metadata (generic name, brand, dosage, unit of measure, costing)
 * for a stock return item with fallbacks to medicines catalogue and inventory batches.
 */
export function resolveStockReturnMedicineInfo(item, { medicinesMap, medicines = [], inventory = [] } = {}) {
  if (!item) {
    return {
      genericName: "Medicine Item",
      dosage: "",
      brand: "",
      unit: "units",
      itemQty: 0,
      itemCost: 0,
      itemTotal: 0,
    };
  }

  // 1. Direct or Map Lookup from medicinesMap
  let med =
    item.medicine ||
    (item.medicine_id && medicinesMap?.get ? medicinesMap.get(item.medicine_id) : null) ||
    (item.medicine_name && medicinesMap?.get ? medicinesMap.get(item.medicine_name.toLowerCase().trim()) : null);

  // 2. Partial / Substring Match across medicines list
  if (!med && item.medicine_name && Array.isArray(medicines)) {
    const cleanName = item.medicine_name.toLowerCase().trim();
    for (const m of medicines) {
      const gName = (m.generic_name || "").toLowerCase().trim();
      if (gName && (gName.includes(cleanName) || cleanName.includes(gName))) {
        med = m;
        break;
      }
    }
  }

  // 3. Fallback to matching batch in inventory by lot_no
  const lotQuery = item.lot_no || item.batch_number;
  let invBatch = null;
  if (lotQuery && Array.isArray(inventory) && inventory.length > 0) {
    invBatch = inventory.find(
      (b) => (b.lot_no && b.lot_no === lotQuery) || (b.batch_number && b.batch_number === lotQuery)
    );
    if (!med && invBatch?.medicine_id && medicinesMap?.get) {
      med = medicinesMap.get(invBatch.medicine_id) || null;
    }
  }

  // 4. Resolve Generic Name
  const genericName =
    item.medicine_name ||
    item.medicine?.generic_name ||
    med?.generic_name ||
    invBatch?.generic_name ||
    invBatch?.medicine_name ||
    "Medicine Item";

  // 5. Resolve Dosage
  let dosage =
    item.dosage ||
    item.medicine?.dosage ||
    med?.dosage ||
    invBatch?.dosage ||
    "";

  if (!dosage) {
    const dosageMatch = (item.medicine_name || genericName).match(
      /\b(\d+(?:\.\d+)?\s*(?:mg|g|ml|mcg|iu|%)(?:\s*\/\s*\d*(?:\.\d+)?\s*(?:mg|g|ml|mcg|iu|%)?)?)\b/i
    );
    if (dosageMatch) {
      dosage = dosageMatch[0].trim();
    }
  }

  // 6. Resolve Brand
  const brand =
    formatBrandName(item.brand_name) ||
    formatBrandName(item.medicine?.brand_name) ||
    formatBrandName(med?.brand_name) ||
    formatBrandName(invBatch?.brand_name) ||
    "";

  // 7. Resolve Packaging Unit
  const unit =
    item.unit_of_measure ||
    item.packaging_unit ||
    item.medicine?.unit_of_measure ||
    med?.unit_of_measure ||
    invBatch?.unit_of_measure ||
    invBatch?.packaging_unit ||
    "units";

  const itemQty = parseInt(item.quantity, 10) || 0;

  const rawCost = parseFloat(item.unit_cost);
  const itemCost =
    !isNaN(rawCost) && rawCost > 0
      ? rawCost
      : med?.unit_cost != null && !isNaN(parseFloat(med.unit_cost))
      ? parseFloat(med.unit_cost)
      : invBatch?.unit_cost != null && !isNaN(parseFloat(invBatch.unit_cost))
      ? parseFloat(invBatch.unit_cost)
      : 0;

  const itemTotal = itemQty * itemCost;

  return {
    genericName,
    dosage,
    brand,
    unit,
    itemQty,
    itemCost,
    itemTotal,
  };
}

export function buildStockReturnPayload({
  formValues = {},
  medicine = null,
  userProfile = null,
  facilityCode = "",
  nowIso = new Date().toISOString(),
} = {}) {
  const isBhw = userProfile?.role === "BHW";
  const facilityId = isBhw ? userProfile?.facility_id : formValues.facility_id;
  const lotNo = normalizeLotNo(formValues.lot_no || formValues.batch_number);
  const quantity = toPositiveInt(formValues.quantity);
  const medicineName =
    formValues.medicine_name || medicine?.generic_name || medicine?.medicine_name || "";
  const brandName = formValues.brand_name || medicine?.brand_name || "";
  const dosage = formValues.dosage || medicine?.dosage || null;
  const unitOfMeasure =
    formValues.unit_of_measure || formValues.packaging_unit || medicine?.unit_of_measure || medicine?.packaging_unit || null;

  if (!facilityId) {
    throw new Error("Returning Barangay Health Center is required.");
  }
  if (!lotNo) {
    throw new Error("Lot number is required.");
  }
  if (!formValues.medicine_id && !medicineName) {
    throw new Error("Medicine name is required.");
  }
  if (quantity <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }
  if (!formValues.expiration_date) {
    throw new Error("Expiration date is required.");
  }

  const returnId =
    formValues.return_id ||
    formValues.return_slip_no ||
    generateReturnId(facilityCode || (isBhw ? "BHW" : "CHO"));

  const isCho = userProfile?.role === "PHARMA_I" || userProfile?.role === "PHARMA_II";
  const rawStatus = formValues.status ? String(formValues.status).toUpperCase() : "";
  const status = rawStatus || (isCho ? "CONFIRMED" : "PENDING");
  const isConfirmed = status === "CONFIRMED" || status === "VERIFIED";

  return {
    id: formValues.id || createId(),
    return_id: returnId,
    facility_id: facilityId,
    source_inventory_id: formValues.source_inventory_id || null,
    medicine_id: formValues.medicine_id || medicine?.id || null,
    medicine_name: medicineName,
    brand_name: brandName,
    dosage,
    unit_of_measure: unitOfMeasure,
    lot_no: lotNo,
    quantity,
    unit_cost: toMoneyNumber(formValues.unit_cost),
    expiration_date: formValues.expiration_date,
    reason: formValues.reason || formValues.return_reason || "EXCESS_STOCK",
    status: isConfirmed ? "CONFIRMED" : "PENDING",
    remarks: formValues.remarks || null,
    submitted_by_id: formValues.submitted_by_id || userProfile?.id || null,
    submitted_at: formValues.submitted_at || nowIso,
    confirmed_by_id: isConfirmed ? (formValues.confirmed_by_id || userProfile?.id || null) : null,
    confirmed_at: isConfirmed ? (formValues.confirmed_at || nowIso) : null,
    created_at: formValues.created_at || nowIso,
    updated_at: nowIso,
  };
}

export function flattenStockReturnRows(rows = []) {
  const flattened = [];

  for (const row of rows || []) {
    if (!row) continue;

    const rawReturnId =
      row.return_id ||
      row.return_slip_no ||
      (row.id ? (String(row.id).startsWith("ret") ? row.id : `RET-${String(row.id).slice(0, 8).toUpperCase()}`) : "-");

    const returnId = formatReturnId(rawReturnId);

    if (Array.isArray(row.items) && row.items.length > 0) {
      for (const item of row.items) {
        flattened.push({
          id: item.id,
          return_id: returnId,
          return_slip_no: returnId,
          lot_no: item.lot_no || item.batch_number || "",
          medicine_id: item.medicine_id || null,
          medicine_name: item.medicine_name || item.medicine?.generic_name || "",
          brand_name: item.brand_name || item.medicine?.brand_name || "",
          dosage: item.dosage || item.medicine?.dosage || null,
          unit_of_measure: item.unit_of_measure || item.packaging_unit || item.medicine?.unit_of_measure || item.medicine?.packaging_unit || null,
          quantity: toPositiveInt(item.quantity),
          unit_cost: toMoneyNumber(item.unit_cost),
          expiration_date: item.expiration_date || "",
          reason: item.reason || row.reason || row.return_reason || "OTHER",
          facility_id: row.facility_id || row.source_facility_id || "",
          facility: row.facility || row.source_facility || null,
          status: row.status || "PENDING",
        });
      }
      continue;
    }

    const medicine = row.medicine || {};
    flattened.push({
      ...row,
      return_id: returnId,
      return_slip_no: returnId,
      lot_no: row.lot_no || row.batch_number || "",
      medicine_name: row.medicine_name || medicine.generic_name || "",
      brand_name: row.brand_name || medicine.brand_name || "",
      dosage: row.dosage || medicine.dosage || null,
      unit_of_measure: row.unit_of_measure || row.packaging_unit || medicine.unit_of_measure || medicine.packaging_unit || null,
      quantity: toPositiveInt(row.quantity),
      unit_cost: toMoneyNumber(row.unit_cost),
      expiration_date: row.expiration_date || "",
      reason: row.reason || row.return_reason || "OTHER",
      facility_id: row.facility_id || row.source_facility_id || "",
      facility: row.facility || row.source_facility || null,
      status: row.status || "PENDING",
    });
  }

  return flattened;
}

/**
 * Deducts returned stock from the source facility's inventory ledger.
 * Updates local cache, SQLite, and Supabase.
 */
export async function deductFacilityStockForReturn({
  facilityId,
  medicineId,
  lotNo,
  sourceInventoryId = null,
  quantity = 0,
}) {
  if (!facilityId || quantity <= 0) return false;

  const currentInventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
  let targetRow = null;

  if (sourceInventoryId) {
    targetRow = currentInventory.find((item) => item.id === sourceInventoryId);
  }
  if (!targetRow) {
    const cleanLot = normalizeLotNo(lotNo);
    targetRow = currentInventory.find(
      (item) =>
        item.facility_id === facilityId &&
        normalizeLotNo(item.batch_number || item.lot_no) === cleanLot &&
        (!medicineId || item.medicine_id === medicineId)
    );
  }

  if (targetRow) {
    const currentQty = parseInt(targetRow.quantity, 10) || 0;
    const newQty = Math.max(0, currentQty - quantity);
    const nowIso = new Date().toISOString();

    // 1. Update snapshot
    const updatedInventory = currentInventory.map((item) =>
      item.id === targetRow.id ? { ...item, quantity: newQty, updated_at: nowIso } : item
    );
    saveSnapshot(STORAGE_KEYS.INVENTORY, updatedInventory);

    // 2. Update local SQLite if Tauri
    if (isTauriEnvironment()) {
      try {
        const db = await getSqliteDb();
        await db.execute(
          "UPDATE inventory SET quantity = ?, updated_at = ? WHERE id = ?",
          [newQty, nowIso, targetRow.id]
        );
      } catch (err) {
        console.warn("[stockReturnsService] SQLite inventory deduct error:", err);
      }
    }

    // 3. Update Supabase if online
    if (isOnline()) {
      try {
        await supabase
          .from("inventory")
          .update({ quantity: newQty, updated_at: nowIso })
          .eq("id", targetRow.id);
      } catch (cloudErr) {
        console.warn("[stockReturnsService] Remote inventory deduct error, enqueuing:", cloudErr);
        await enqueueMutation({
          mutationType: "UPDATE",
          target: "inventory",
          payload: { id: targetRow.id, quantity: newQty, updated_at: nowIso },
        });
      }
    } else {
      await enqueueMutation({
        mutationType: "UPDATE",
        target: "inventory",
        payload: { id: targetRow.id, quantity: newQty, updated_at: nowIso },
      });
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("prds:inventory-changed", {
          detail: { inventoryId: targetRow.id, newQuantity: newQty },
        })
      );
    }

    return true;
  }

  return false;
}

export async function fetchStockReturns(filters = {}) {
  let returnsData = [];

  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      const rows = await db.select(
        `SELECT sr.id,
                sr.return_id,
                sr.facility_id,
                sr.source_inventory_id,
                sr.medicine_id,
                sr.medicine_name,
                sr.brand_name,
                sr.dosage,
                sr.unit_of_measure,
                sr.lot_no,
                sr.quantity,
                sr.unit_cost,
                sr.expiration_date,
                sr.reason,
                sr.status,
                sr.remarks,
                sr.submitted_by_id,
                sr.submitted_at,
                sr.confirmed_by_id,
                sr.confirmed_at,
                sr.created_at,
                sr.updated_at,
                sr.is_synced,
                sr.data_json,
                f.facility_name as facility_name,
                f.facility_code as facility_code
         FROM stock_returns sr
         LEFT JOIN facilities f ON sr.facility_id = f.id
         ORDER BY sr.submitted_at DESC, sr.created_at DESC`
      );

      if (Array.isArray(rows) && rows.length > 0) {
        returnsData = rows.map((row) => ({
          ...row,
          return_id: formatReturnId(row.return_id),
          return_slip_no: formatReturnId(row.return_id || row.return_slip_no),
          facility: {
            id: row.facility_id,
            facility_name: row.facility_name || "Barangay Health Center",
            facility_code: row.facility_code || "BHW",
          },
        }));
        saveSnapshot(STORAGE_KEYS.STOCK_RETURNS, returnsData);

        // Normalize SQLite records in background if any had the legacy long format
        const legacy = rows.filter((r) => r.return_id && String(r.return_id).length > 12);
        if (legacy.length > 0) {
          getSqliteDb().then((db) => {
            legacy.forEach((leg) => {
              const shortId = formatReturnId(leg.return_id);
              if (shortId && shortId !== leg.return_id) {
                db.execute("UPDATE stock_returns SET return_id = ? WHERE id = ?", [shortId, leg.id]).catch(() => {});
                db.execute("UPDATE inventory SET po_number = ? WHERE po_number = ?", [shortId, leg.return_id]).catch(() => {});
              }
            });
          }).catch(() => {});
        }
      }
    } catch (sqliteErr) {
      console.warn("[stockReturnsService] SQLite read fallback:", sqliteErr);
    }
  }

  if (await hasActiveAuthSession()) {
    try {
      const result = await supabase
        .from("stock_returns")
        .select(`
          id,
          return_id,
          facility_id,
          source_inventory_id,
          medicine_id,
          medicine_name,
          brand_name,
          dosage,
          unit_of_measure,
          lot_no,
          quantity,
          unit_cost,
          expiration_date,
          reason,
          status,
          remarks,
          submitted_by_id,
          submitted_at,
          confirmed_by_id,
          confirmed_at,
          created_at,
          updated_at,
          facility:facilities!stock_returns_facility_id_fkey(id, facility_name, facility_code)
        `)
        .order("submitted_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (!result.error && Array.isArray(result.data)) {
        returnsData = flattenStockReturnRows(result.data);
        saveSnapshot(STORAGE_KEYS.STOCK_RETURNS, returnsData);
      }
    } catch (cloudErr) {
      console.warn("[stockReturnsService] Remote Supabase fetch skipped:", cloudErr);
    }
  }

  if (!returnsData || returnsData.length === 0) {
    returnsData = flattenStockReturnRows(getSnapshot(STORAGE_KEYS.STOCK_RETURNS) || []);
  } else {
    returnsData = flattenStockReturnRows(returnsData);
  }

  let filtered = [...returnsData];

  if (filters.facilityId && filters.facilityId !== "ALL") {
    filtered = filtered.filter((row) => row.facility_id === filters.facilityId);
  }

  if (filters.status && filters.status !== "ALL") {
    filtered = filtered.filter((row) => (row.status || "PENDING").toUpperCase() === filters.status.toUpperCase());
  }

  if (filters.reason && filters.reason !== "ALL") {
    filtered = filtered.filter((row) => row.reason === filters.reason);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    filtered = filtered.filter((row) => {
      const searchable = [
        row.id,
        row.return_id,
        row.return_slip_no,
        row.lot_no,
        row.medicine_name,
        row.brand_name,
        row.dosage,
        row.unit_of_measure,
        row.reason,
        row.facility?.facility_name,
        row.facility?.facility_code,
      ].filter(Boolean).join(" ").toLowerCase();
      return searchable.includes(q);
    });
  }

  return filtered;
}

export async function createStockReturn({
  stockReturnData = null,
  returnData = {},
  items = [],
  medicine = null,
  userProfile,
} = {}) {
  const isBhw = userProfile?.role === "BHW";
  const facilityCode = stockReturnData?.facility_code || returnData?.facility_code || (isBhw ? "BHW" : "CHO");
  const sharedReturnId =
    stockReturnData?.return_id ||
    stockReturnData?.return_slip_no ||
    returnData?.return_id ||
    generateReturnId(facilityCode);

  const sharedReason = stockReturnData?.reason || returnData?.reason || "EXCESS_STOCK";
  const sharedRemarks = stockReturnData?.remarks || returnData?.remarks || null;
  const sharedFacilityId = isBhw
    ? userProfile?.facility_id
    : (stockReturnData?.facility_id || returnData?.facility_id);

  // Collect all items to process
  const rawItems = (Array.isArray(stockReturnData?.items) && stockReturnData.items.length > 0)
    ? stockReturnData.items
    : (Array.isArray(items) && items.length > 0)
    ? items
    : [stockReturnData || returnData];

  const createdPayloads = [];

  for (const item of rawItems) {
    if (!item) continue;

    let resolvedCost = toMoneyNumber(item.unit_cost);
    if (resolvedCost <= 0) {
      const currentInventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
      let invBatch = item.source_inventory_id
        ? currentInventory.find((inv) => inv.id === item.source_inventory_id)
        : null;
      if (!invBatch) {
        const cleanLot = normalizeLotNo(item.lot_no || item.batch_number);
        invBatch = currentInventory.find(
          (inv) =>
            inv.facility_id === sharedFacilityId &&
            normalizeLotNo(inv.batch_number || inv.lot_no) === cleanLot
        );
      }
      if (invBatch?.unit_cost && toMoneyNumber(invBatch.unit_cost) > 0) {
        resolvedCost = toMoneyNumber(invBatch.unit_cost);
      } else if (isTauriEnvironment() && (item.source_inventory_id || item.lot_no || item.batch_number)) {
        try {
          const db = await getSqliteDb();
          const cleanLot = normalizeLotNo(item.lot_no || item.batch_number);
          const rows = await db.select(
            "SELECT unit_cost FROM inventory WHERE id = ? OR (facility_id = ? AND UPPER(batch_number) = ?) LIMIT 1",
            [item.source_inventory_id || "", sharedFacilityId || "", cleanLot]
          );
          if (rows?.[0]?.unit_cost && toMoneyNumber(rows[0].unit_cost) > 0) {
            resolvedCost = toMoneyNumber(rows[0].unit_cost);
          }
        } catch {}
      }
      if (resolvedCost <= 0 && (await hasActiveAuthSession()) && (item.source_inventory_id || item.lot_no || item.batch_number)) {
        try {
          const cleanLot = normalizeLotNo(item.lot_no || item.batch_number);
          let q = supabase.from("inventory").select("unit_cost");
          if (item.source_inventory_id) {
            q = q.eq("id", item.source_inventory_id);
          } else {
            q = q.eq("facility_id", sharedFacilityId).ilike("batch_number", cleanLot);
          }
          const { data: invRows } = await q.limit(1);
          if (invRows?.[0]?.unit_cost && toMoneyNumber(invRows[0].unit_cost) > 0) {
            resolvedCost = toMoneyNumber(invRows[0].unit_cost);
          }
        } catch {}
      }
    }

    const formValues = {
      ...(stockReturnData || returnData),
      ...item,
      unit_cost: resolvedCost,
      return_id: sharedReturnId,
      facility_id: sharedFacilityId,
      reason: item.reason || sharedReason,
      remarks: item.remarks || sharedRemarks,
      lot_no: item.lot_no || item.batch_number,
      medicine_name: item.medicine_name,
      brand_name: item.brand_name,
      dosage: item.dosage,
      unit_of_measure: item.unit_of_measure,
    };

    const payload = buildStockReturnPayload({
      formValues,
      medicine: medicine || item.medicine,
      userProfile,
      facilityCode,
    });

    // 1. Automatically deduct stock from source facility inventory
    await deductFacilityStockForReturn({
      facilityId: payload.facility_id,
      medicineId: payload.medicine_id,
      lotNo: payload.lot_no,
      sourceInventoryId: payload.source_inventory_id,
      quantity: payload.quantity,
    });

    // 2. Persist to SQLite if Tauri
    if (isTauriEnvironment()) {
      try {
        const db = await getSqliteDb();
        await db.execute(
          `INSERT OR REPLACE INTO stock_returns (
            id, return_id, facility_id, source_inventory_id, medicine_id, medicine_name, brand_name,
            dosage, unit_of_measure, lot_no, quantity, unit_cost, expiration_date, reason, status, remarks,
            submitted_by_id, submitted_at, confirmed_by_id, confirmed_at, created_at, updated_at, is_synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            payload.id,
            payload.return_id,
            payload.facility_id,
            payload.source_inventory_id || null,
            payload.medicine_id,
            payload.medicine_name,
            payload.brand_name,
            payload.dosage,
            payload.unit_of_measure,
            payload.lot_no,
            payload.quantity,
            payload.unit_cost,
            payload.expiration_date,
            payload.reason,
            payload.status,
            payload.remarks || null,
            payload.submitted_by_id,
            payload.submitted_at,
            payload.confirmed_by_id,
            payload.confirmed_at,
            payload.created_at,
            payload.updated_at,
            isOnline() ? 1 : 0,
          ]
        );
      } catch (localWriteErr) {
        console.warn("[stockReturnsService] SQLite write error:", localWriteErr);
      }
    }

    // 3. Persist to Supabase if online and authenticated
    if (await hasActiveAuthSession()) {
      try {
        const { error } = await supabase.from("stock_returns").insert(payload);
        if (error) throw error;
      } catch (cloudErr) {
        console.warn("[stockReturnsService] Supabase insert failed, enqueuing to outbox:", cloudErr);
        await enqueueMutation({ mutationType: "INSERT", target: "stock_returns", payload });
      }
    } else {
      await enqueueMutation({ mutationType: "INSERT", target: "stock_returns", payload });
    }

    createdPayloads.push(payload);
  }

  // 4. Activity log for return batch
  if (createdPayloads.length > 0) {
    const totalUnits = createdPayloads.reduce((sum, p) => sum + p.quantity, 0);
    const itemSummary = createdPayloads
      .map((p) => `${p.quantity}x ${p.medicine_name || "medicine"} (Lot: ${p.lot_no})`)
      .join(", ");
    const primaryStatus = createdPayloads[0].status;

    if (isOnline()) {
      try {
        await supabase.from("activity_logs").insert({
          user_id: userProfile?.id,
          action: primaryStatus === "CONFIRMED" ? "Stock Return Confirmed" : "Stock Return Submitted",
          module: "Stock Returns",
          details: `Return ${sharedReturnId}: ${totalUnits} total unit(s) [${itemSummary}]. Reason: ${getReturnReasonLabel(sharedReason)}`,
        });
      } catch {}
    }

    const currentSnapshot = flattenStockReturnRows(getSnapshot(STORAGE_KEYS.STOCK_RETURNS) || []);
    const newIds = new Set(createdPayloads.map((p) => p.id));
    saveSnapshot(STORAGE_KEYS.STOCK_RETURNS, [
      ...createdPayloads,
      ...currentSnapshot.filter((row) => !newIds.has(row.id)),
    ]);
    // 5. Notify CHO Pharmacists when a BHW submits a return
    if (isBhw && isOnline()) {
      try {
        const { data: choProfiles } = await supabase
          .from("profiles")
          .select("id")
          .in("role", ["PHARMA_II", "PHARMA_I"])
          .eq("status", "ACTIVE");

        if (Array.isArray(choProfiles) && choProfiles.length > 0) {
          const originStation = userProfile?.facility_name || "Barangay Health Center";
          const notifications = choProfiles.map((cp) => ({
            user_id: cp.id,
            title: "New Stock Return Submitted",
            message: `${originStation} submitted return ${sharedReturnId} for ${totalUnits} unit(s) (${itemSummary}). Reason: ${getReturnReasonLabel(sharedReason)}.`,
            created_at: new Date().toISOString(),
          }));
          await supabase.from("notifications").insert(notifications);
        }
      } catch (notifErr) {
        console.warn("[stockReturnsService] CHO notification dispatch skipped:", notifErr);
      }
    }
  }

  return createdPayloads.length === 1 ? createdPayloads[0] : createdPayloads;
}

/**
 * Confirms receipt and acceptance of a stock return by CHO.
 * Re-integrates returned stock into CHO inventory under the return lot number.
 * If unexpired: places as ACTIVE so it is available for walk-in dispensing and other programs.
 * If expired: places as EXPIRED for condemnation protocol.
 */
export async function confirmStockReturn(returnId, confirmedByUserId = null) {
  const nowIso = new Date().toISOString();
  const updatePayload = {
    id: returnId,
    status: "CONFIRMED",
    confirmed_by_id: confirmedByUserId,
    confirmed_at: nowIso,
    updated_at: nowIso,
  };

  // 1. Update stock return record in SQLite
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute(
        `UPDATE stock_returns
         SET status = 'CONFIRMED',
             confirmed_by_id = ?, confirmed_at = ?,
             updated_at = ?
         WHERE id = ?`,
        [confirmedByUserId, nowIso, nowIso, returnId]
      );
    } catch (err) {
      console.warn("[stockReturnsService] SQLite confirm error:", err);
    }
  }

  // 2. Update stock return record in Supabase or Outbox
  if (await hasActiveAuthSession()) {
    try {
      const { error } = await supabase
        .from("stock_returns")
        .update({
          status: "CONFIRMED",
          confirmed_by_id: confirmedByUserId,
          confirmed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", returnId);
      if (error) throw error;
    } catch {
      await enqueueMutation({ mutationType: "UPDATE", target: "stock_returns", payload: updatePayload });
    }
  } else {
    await enqueueMutation({ mutationType: "UPDATE", target: "stock_returns", payload: updatePayload });
  }

  const currentSnapshot = flattenStockReturnRows(getSnapshot(STORAGE_KEYS.STOCK_RETURNS) || []);
  let returnRecord = currentSnapshot.find((row) => row.id === returnId || row.return_id === returnId || row.return_slip_no === returnId) || null;

  if (!returnRecord && isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      const rows = await db.select(
        `SELECT sr.*, f.facility_name, f.facility_code
         FROM stock_returns sr
         LEFT JOIN facilities f ON sr.facility_id = f.id
         WHERE sr.id = ? OR sr.return_id = ?`,
        [returnId, returnId]
      );
      if (Array.isArray(rows) && rows.length > 0) {
        returnRecord = {
          ...rows[0],
          facility: {
            id: rows[0].facility_id,
            facility_name: rows[0].facility_name || "Barangay Health Center",
            facility_code: rows[0].facility_code || "BHW",
          },
        };
      }
    } catch (sqliteFindErr) {
      console.warn("[stockReturnsService] SQLite fallback lookup error:", sqliteFindErr);
    }
  }

  saveSnapshot(
    STORAGE_KEYS.STOCK_RETURNS,
    currentSnapshot.map((row) => (row.id === returnId || row.return_id === returnId ? { ...row, ...updatePayload } : row))
  );

  // 3. Put returned medicine into CHO inventory under its Lot Number
  if (returnRecord) {
    try {
      let facilities = getSnapshot(STORAGE_KEYS.FACILITIES, []);
      if ((!facilities || facilities.length === 0) && isTauriEnvironment()) {
        try {
          const db = await getSqliteDb();
          facilities = await db.select("SELECT * FROM facilities");
        } catch {}
      }

      const choFacility =
        facilities.find((f) => isChoFacility(f)) ||
        facilities.find(
          (f) =>
            f.facility_code === "CHO-NAGA" ||
            f.facility_type === "CHO" ||
            (f.facility_name && f.facility_name.includes("City Health Office"))
        ) || {
          id: "0b7e2eaa-1072-4fb1-8e14-d6fb46097aad",
          facility_name: "City Health Office - City of Naga",
          facility_code: "CHO-NAGA",
        };

      const choFacilityId = choFacility?.id;

      if (choFacilityId) {
        const currentInventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
        const cleanLot = normalizeLotNo(returnRecord.lot_no);
        const isExpired = isLotExpired({ expiration_date: returnRecord.expiration_date });
        const originStationName = returnRecord.facility?.facility_name || "Barangay Health Center";

        let medicines = getSnapshot(STORAGE_KEYS.MEDICINES, []);
        if ((!medicines || medicines.length === 0) && isTauriEnvironment()) {
          try {
            const db = await getSqliteDb();
            medicines = await db.select("SELECT * FROM medicines");
          } catch {}
        }
        const matchedMed = medicines.find(
          (m) =>
            m.id === returnRecord.medicine_id ||
            (returnRecord.medicine_name &&
              m.generic_name?.toLowerCase().trim() === returnRecord.medicine_name.toLowerCase().trim())
        );
        const resolvedMedicineId = returnRecord.medicine_id || matchedMed?.id || null;

        // Check if an existing return lot entry already exists at CHO
        const existingLot = currentInventory.find(
          (item) =>
            item.facility_id === choFacilityId &&
            normalizeLotNo(item.batch_number || item.lot_no) === cleanLot &&
            (!resolvedMedicineId || item.medicine_id === resolvedMedicineId) &&
            (item.intake_type === "RETURN" || (typeof item.po_number === "string" && item.po_number.startsWith("RET-")) || item.id === `inv_ret_${returnRecord.id}`)
        );

        let targetLot = null;
        let isUpdate = false;

        const existingBatch = currentInventory.find(
          (it) =>
            normalizeLotNo(it.batch_number || it.lot_no) === cleanLot ||
            (resolvedMedicineId && it.medicine_id === resolvedMedicineId)
        );
        const resolvedCost =
          toMoneyNumber(returnRecord.unit_cost) > 0
            ? toMoneyNumber(returnRecord.unit_cost)
            : existingBatch?.unit_cost > 0
            ? Number(existingBatch.unit_cost)
            : matchedMed?.unit_cost > 0
            ? Number(matchedMed.unit_cost)
            : 0;

        if (existingLot) {
          isUpdate = true;
          const currentQty = parseInt(existingLot.quantity, 10) || 0;
          const returnQty = parseInt(returnRecord.quantity, 10) || 0;
          targetLot = {
            ...existingLot,
            medicine_id: resolvedMedicineId || existingLot.medicine_id,
            quantity: currentQty + returnQty,
            unit_cost: resolvedCost > 0 ? resolvedCost : existingLot.unit_cost,
            updated_at: nowIso,
          };
        } else {
          const invId = `inv_ret_${returnRecord.id || Date.now()}`;

          targetLot = {
            id: invId,
            facility_id: choFacilityId,
            medicine_id: resolvedMedicineId,
            quantity: parseInt(returnRecord.quantity, 10) || 0,
            batch_number: returnRecord.lot_no,
            po_number: returnRecord.return_id,
            unit_cost: resolvedCost,
            date_received: returnRecord.confirmed_at ? returnRecord.confirmed_at.slice(0, 10) : nowIso.slice(0, 10),
            expiration_date: returnRecord.expiration_date,
            origin_facility_id: returnRecord.facility_id || null,
            origin_facility: returnRecord.facility || {
              id: returnRecord.facility_id,
              facility_name: originStationName,
            },
            intake_type: "RETURN",
            return_reason: returnRecord.reason || null,
            status: isExpired ? "EXPIRED" : "ACTIVE",
            brand_name: returnRecord.brand_name || matchedMed?.brand_name || null,
            supplier_name: `Returned from ${originStationName}`,
            facility: choFacility,
            medicine: matchedMed || {
              id: resolvedMedicineId,
              generic_name: returnRecord.medicine_name,
              dosage: returnRecord.dosage,
              unit_of_measure: returnRecord.unit_of_measure,
            },
            created_at: nowIso,
            updated_at: nowIso,
          };
        }

        // Update local snapshot
        const updatedInventory = isUpdate
          ? currentInventory.map((item) => (item.id === targetLot.id ? targetLot : item))
          : [targetLot, ...currentInventory.filter((item) => item.id !== targetLot.id)];
        saveSnapshot(STORAGE_KEYS.INVENTORY, updatedInventory);

        // Update SQLite
        if (isTauriEnvironment()) {
          try {
            const db = await getSqliteDb();
            await db.execute(
              `INSERT OR REPLACE INTO inventory (
                id, facility_id, medicine_id, quantity, batch_number, po_number,
                unit_cost, date_received, expiration_date, origin_facility_id, intake_type,
                return_reason, status, brand_name, supplier_name, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                targetLot.id,
                targetLot.facility_id,
                targetLot.medicine_id,
                targetLot.quantity,
                targetLot.batch_number,
                targetLot.po_number,
                targetLot.unit_cost,
                targetLot.date_received,
                targetLot.expiration_date,
                targetLot.origin_facility_id,
                targetLot.intake_type,
                targetLot.return_reason,
                targetLot.status,
                targetLot.brand_name,
                targetLot.supplier_name,
                nowIso,
              ]
            );
          } catch (sqliteInvErr) {
            console.warn("[stockReturnsService] SQLite inventory return insert error:", sqliteInvErr);
          }
        }

        // Update Supabase
        const { facility, medicine, origin_facility, threshold, ...dbLot } = targetLot;
        if (isOnline()) {
          try {
            await supabase.from("inventory").upsert(dbLot);
          } catch (cloudInvErr) {
            console.warn("[stockReturnsService] Remote inventory return upsert failed, enqueuing:", cloudInvErr);
            await enqueueMutation({
              mutationType: isUpdate ? "UPDATE" : "INSERT",
              target: "inventory",
              payload: dbLot,
            });
          }
        } else {
          await enqueueMutation({
            mutationType: isUpdate ? "UPDATE" : "INSERT",
            target: "inventory",
            payload: dbLot,
          });
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("prds:inventory-changed", {
              detail: { inventoryId: targetLot.id, action: "RETURN_CONFIRMED" },
            })
          );
          window.dispatchEvent(
            new CustomEvent("prds:stock-returns-changed", {
              detail: { returnId, status: "CONFIRMED" },
            })
          );
        }
      }
    } catch (invErr) {
      console.warn("[stockReturnsService] Failed to place return stock into inventory:", invErr);
    }

    // 4. Send confirmation notification to submitting BHW
    if (returnRecord.submitted_by_id && isOnline()) {
      try {
        await supabase.from("notifications").insert({
          user_id: returnRecord.submitted_by_id,
          title: "Stock Return Confirmed",
          message: `Your stock return (${returnRecord.return_id} - Lot ${returnRecord.lot_no}: ${returnRecord.medicine_name}) has been verified and received into CHO inventory.`,
          created_at: nowIso,
        });
      } catch (notifErr) {
        console.warn("[stockReturnsService] Confirmation notification skipped:", notifErr);
      }
    }
  }

  return true;
}

// Backward-compatible alias
export const verifyStockReturn = confirmStockReturn;

export function calculateStockReturnKpis(returns = []) {
  const rows = flattenStockReturnRows(returns);
  const totalReturns = rows.length;
  let totalUnitsReturned = 0;
  let confirmedCount = 0;
  let pendingConfirmationCount = 0;
  let activeThisMonth = 0;

  const currentMonthPrefix = new Date().toISOString().slice(0, 7);
  const stationCounts = new Map();

  for (const row of rows) {
    if (row.status === "CONFIRMED" || row.status === "VERIFIED") {
      confirmedCount++;
    } else if (row.status === "PENDING" || !row.status) {
      pendingConfirmationCount++;
    }
    const activityDate = row.submitted_at || row.created_at || row.return_date;
    if (activityDate && String(activityDate).startsWith(currentMonthPrefix)) activeThisMonth++;

    const stationName = row.facility?.facility_name || "Unknown Facility";
    stationCounts.set(stationName, (stationCounts.get(stationName) || 0) + 1);
    totalUnitsReturned += toPositiveInt(row.quantity);
  }

  const topStations = Array.from(stationCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalReturns,
    totalUnitsReturned,
    confirmedCount,
    pendingConfirmationCount,
    verifiedCount: confirmedCount, // backward compat
    pendingVerificationCount: pendingConfirmationCount, // backward compat
    activeThisMonth,
    topStations,
  };
}

/**
 * Reconciles confirmed stock returns with the local/active inventory ledger.
 * Ensures that any returned medicine batches confirmed by CHO Pharmacist
 * appear under Returned Stock for their corresponding medicine entry.
 */
export async function reconcileConfirmedReturnsIntoInventory(
  currentInventory = [],
  { facilities = [], medicines = [], stockReturns = [] } = {}
) {
  try {
    let resolvedFacilities = facilities.length > 0 ? facilities : getSnapshot(STORAGE_KEYS.FACILITIES, []);
    let resolvedMedicines = medicines.length > 0 ? medicines : getSnapshot(STORAGE_KEYS.MEDICINES, []);

    if (isTauriEnvironment()) {
      try {
        const db = await getSqliteDb();
        if (resolvedFacilities.length === 0) {
          resolvedFacilities = await db.select("SELECT * FROM facilities");
        }
        if (resolvedMedicines.length === 0) {
          resolvedMedicines = await db.select("SELECT * FROM medicines");
        }
      } catch {}
    }

    const choFacility =
      resolvedFacilities.find((f) => isChoFacility(f)) ||
      resolvedFacilities.find(
        (f) =>
          f.facility_code === "CHO-NAGA" ||
          f.facility_type === "CHO" ||
          (f.facility_name && f.facility_name.includes("City Health Office"))
      ) || {
        id: "0b7e2eaa-1072-4fb1-8e14-d6fb46097aad",
        facility_name: "City Health Office - City of Naga",
        facility_code: "CHO-NAGA",
      };

    if (!choFacility?.id) return currentInventory;

    let confirmedReturns = [];
    if (isTauriEnvironment()) {
      try {
        const db = await getSqliteDb();
        const rows = await db.select(
          `SELECT sr.*, f.facility_name, f.facility_code
           FROM stock_returns sr
           LEFT JOIN facilities f ON sr.facility_id = f.id
           WHERE UPPER(sr.status) IN ('CONFIRMED', 'VERIFIED')`
        );
        if (Array.isArray(rows) && rows.length > 0) {
          confirmedReturns = rows.map((r) => ({
            ...r,
            facility: {
              id: r.facility_id,
              facility_name: r.facility_name || "Barangay Health Center",
              facility_code: r.facility_code || "BHW",
            },
          }));
        }
      } catch (err) {
        console.warn("[reconcileConfirmedReturnsIntoInventory] SQLite returns query failed:", err);
      }
    }

    if ((!isTauriEnvironment() || confirmedReturns.length === 0) && (await hasActiveAuthSession())) {
      try {
        const cloudRes = await supabase
          .from("stock_returns")
          .select("id, return_id, facility_id, medicine_id, medicine_name, brand_name, dosage, unit_of_measure, lot_no, quantity, unit_cost, expiration_date, reason, status, confirmed_at, submitted_at, facility:facilities!stock_returns_facility_id_fkey(id, facility_name, facility_code)")
          .in("status", ["CONFIRMED", "VERIFIED", "confirmed", "verified"]);
        if (!cloudRes.error && Array.isArray(cloudRes.data) && cloudRes.data.length > 0) {
          const cloudReturns = flattenStockReturnRows(cloudRes.data);
          for (const cr of cloudReturns) {
            confirmedReturns.push(cr);
          }
        }
      } catch {}
    }

    const snapshotReturns = flattenStockReturnRows(getSnapshot(STORAGE_KEYS.STOCK_RETURNS, [])).filter(
      (r) => ["CONFIRMED", "VERIFIED"].includes(String(r.status || "").toUpperCase())
    );

    const providedReturns = flattenStockReturnRows(stockReturns).filter(
      (r) => ["CONFIRMED", "VERIFIED"].includes(String(r.status || "").toUpperCase())
    );

    const returnsMap = new Map();
    for (const r of [...snapshotReturns, ...confirmedReturns, ...providedReturns]) {
      const key = r.id || `${r.return_id}_${r.lot_no}`;
      returnsMap.set(key, r);
    }

    let updatedInventory = [...currentInventory];
    let hasNewLots = false;

    for (const ret of returnsMap.values()) {
      const retQty = parseInt(ret.quantity, 10) || 0;
      if (retQty <= 0) continue;

      const cleanLot = normalizeLotNo(ret.lot_no);
      const existingLotIndex = updatedInventory.findIndex(
        (item) =>
          item.facility_id === choFacility.id &&
          normalizeLotNo(item.batch_number || item.lot_no) === cleanLot &&
          (item.intake_type === "RETURN" ||
            (typeof item.po_number === "string" && item.po_number.startsWith("RET-")) ||
            item.id === `inv_ret_${ret.id}`)
      );

      if (existingLotIndex >= 0) {
        const existing = updatedInventory[existingLotIndex];
        if (existing.intake_type !== "RETURN" || !existing.origin_facility_id) {
          updatedInventory[existingLotIndex] = {
            ...existing,
            intake_type: "RETURN",
            origin_facility_id: ret.facility_id || existing.origin_facility_id,
            return_reason: ret.reason || existing.return_reason,
            po_number: formatReturnId(ret.return_id) || existing.po_number,
          };
          hasNewLots = true;
        }
        continue;
      }

      const matchedMed =
        resolvedMedicines.find((m) => m.id === ret.medicine_id) ||
        resolvedMedicines.find(
          (m) =>
            ret.medicine_name &&
            m.generic_name?.toLowerCase().trim() === ret.medicine_name.toLowerCase().trim()
        ) ||
        null;

      const medId = ret.medicine_id || matchedMed?.id || null;

      const existingBatch = updatedInventory.find(
        (it) =>
          normalizeLotNo(it.batch_number || it.lot_no) === cleanLot ||
          (medId && it.medicine_id === medId)
      );

      const rawRetCost = toMoneyNumber(ret.unit_cost);
      const unitCost =
        rawRetCost > 0
          ? rawRetCost
          : existingBatch?.unit_cost > 0
          ? Number(existingBatch.unit_cost)
          : matchedMed?.unit_cost > 0
          ? Number(matchedMed.unit_cost)
          : 0;

      const originStationName =
        ret.facility?.facility_name ||
        resolvedFacilities.find((f) => f.id === ret.facility_id)?.facility_name ||
        "Barangay Health Center";

      const isExpired = isLotExpired({ expiration_date: ret.expiration_date });
      const nowIso = new Date().toISOString();

      const newLot = {
        id: `inv_ret_${ret.id}`,
        facility_id: choFacility.id,
        medicine_id: medId,
        quantity: retQty,
        batch_number: ret.lot_no,
        po_number: formatReturnId(ret.return_id),
        unit_cost: unitCost,
        date_received: ret.confirmed_at
          ? String(ret.confirmed_at).slice(0, 10)
          : ret.submitted_at
          ? String(ret.submitted_at).slice(0, 10)
          : nowIso.slice(0, 10),
        expiration_date: ret.expiration_date,
        origin_facility_id: ret.facility_id || null,
        origin_facility: ret.facility || {
          id: ret.facility_id,
          facility_name: originStationName,
        },
        intake_type: "RETURN",
        return_reason: ret.reason || null,
        status: isExpired ? "EXPIRED" : "ACTIVE",
        brand_name: ret.brand_name || matchedMed?.brand_name || null,
        supplier_name: `Returned from ${originStationName}`,
        facility: choFacility,
        medicine: matchedMed || {
          id: medId,
          generic_name: ret.medicine_name,
          dosage: ret.dosage,
          unit_of_measure: ret.unit_of_measure,
        },
        created_at: ret.confirmed_at || ret.created_at || nowIso,
        updated_at: ret.updated_at || nowIso,
      };

      updatedInventory.push(newLot);
      hasNewLots = true;

      // Persist to local SQLite so it remains on disk
      if (isTauriEnvironment()) {
        try {
          const db = await getSqliteDb();
          await db.execute(
            `INSERT OR REPLACE INTO inventory (
              id, facility_id, medicine_id, quantity, batch_number, po_number,
              unit_cost, date_received, expiration_date, origin_facility_id, intake_type,
              return_reason, status, brand_name, supplier_name, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newLot.id,
              newLot.facility_id,
              newLot.medicine_id,
              newLot.quantity,
              newLot.batch_number,
              newLot.po_number,
              newLot.unit_cost,
              newLot.date_received,
              newLot.expiration_date,
              newLot.origin_facility_id,
              newLot.intake_type,
              newLot.return_reason,
              newLot.status,
              newLot.brand_name,
              newLot.supplier_name,
              newLot.updated_at,
            ]
          );
        } catch (dbErr) {
          console.warn("[reconcileConfirmedReturnsIntoInventory] SQLite write failed:", dbErr);
        }
      }
    }

    if (hasNewLots) {
      saveSnapshot(STORAGE_KEYS.INVENTORY, updatedInventory);
    }

    return updatedInventory;
  } catch (err) {
    console.warn("[reconcileConfirmedReturnsIntoInventory] Error:", err);
    return currentInventory;
  }
}
