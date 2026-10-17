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
 * Generates a clean human-friendly Return ID.
 * Example: RET-TIN-20261013-A8F2
 */
export const generateReturnId = (facilityCode = "BHW") => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const cleanCode = (facilityCode || "BHW").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `RET-${cleanCode}-${year}${month}${day}-${randomSuffix}`;
};

// Backward-compatible alias
export const generateReturnSlipNo = generateReturnId;

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

    const returnId =
      row.return_id ||
      row.return_slip_no ||
      (row.id ? (String(row.id).startsWith("ret") ? row.id : `RET-${String(row.id).slice(0, 8).toUpperCase()}`) : "-");

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
        `SELECT sr.*,
                f.facility_name as facility_name,
                f.facility_code as facility_code
         FROM stock_returns sr
         LEFT JOIN facilities f ON sr.facility_id = f.id
         ORDER BY sr.submitted_at DESC, sr.created_at DESC`
      );

      if (Array.isArray(rows) && rows.length > 0) {
        returnsData = rows.map((row) => ({
          ...row,
          facility: {
            id: row.facility_id,
            facility_name: row.facility_name || "Barangay Health Center",
            facility_code: row.facility_code || "BHW",
          },
        }));
      }
    } catch (sqliteErr) {
      console.warn("[stockReturnsService] SQLite read fallback:", sqliteErr);
    }
  }

  if (isOnline()) {
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
    const formValues = {
      ...(stockReturnData || returnData),
      ...item,
      return_id: sharedReturnId,
      facility_id: sharedFacilityId,
      reason: item.reason || sharedReason,
      remarks: item.remarks || sharedRemarks,
      lot_no: item.lot_no || item.batch_number,
      medicine_name: item.medicine_name,
      brand_name: item.brand_name,
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
            lot_no, quantity, unit_cost, expiration_date, reason, status, remarks,
            submitted_by_id, submitted_at, confirmed_by_id, confirmed_at, created_at, updated_at, is_synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            payload.id,
            payload.return_id,
            payload.facility_id,
            payload.source_inventory_id || null,
            payload.medicine_id,
            payload.medicine_name,
            payload.brand_name,
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

    // 3. Persist to Supabase if online
    if (isOnline()) {
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
  }

  return createdPayloads.length === 1 ? createdPayloads[0] : createdPayloads;
}

/**
 * Confirms receipt and acceptance of a stock return by CHO.
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

  if (isOnline()) {
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
  saveSnapshot(
    STORAGE_KEYS.STOCK_RETURNS,
    currentSnapshot.map((row) => row.id === returnId ? { ...row, ...updatePayload } : row)
  );

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
