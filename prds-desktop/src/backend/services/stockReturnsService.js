/**
 * PRDS Stock Returns Service
 * Handles returned medicine stock from Barangay Health Centers as a separate
 * ledger from supplier procurement inventory.
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
  { value: "PENDING", label: "Sent to CHO", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "RECEIVED", label: "Received at CHO", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "VERIFIED", label: "Verified", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
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
  const found = RETURN_STATUS_OPTIONS.find((opt) => opt.value === status);
  return found || { value: status, label: status || "Unknown", tone: "bg-slate-100 text-slate-700 border-slate-200" };
};

export const generateReturnSlipNo = (facilityCode = "BHW") => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const cleanCode = (facilityCode || "BHW").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `RET-${cleanCode}-${year}${month}${day}-${randomSuffix}`;
};

export function buildStockReturnPayload({
  formValues = {},
  medicine = null,
  userProfile = null,
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

  return {
    id: formValues.id || createId(),
    lot_no: lotNo,
    medicine_id: formValues.medicine_id || medicine?.id || null,
    medicine_name: medicineName,
    brand_name: brandName,
    quantity,
    unit_cost: toMoneyNumber(formValues.unit_cost),
    expiration_date: formValues.expiration_date,
    reason: formValues.reason || formValues.return_reason || "EXCESS_STOCK",
    facility_id: facilityId,
    status: formValues.status || "PENDING",
    submitted_by_id: formValues.submitted_by_id || userProfile?.id || null,
    verified_by_id: formValues.verified_by_id || null,
    submitted_at: formValues.submitted_at || nowIso,
    verified_at: formValues.verified_at || null,
    created_at: formValues.created_at || nowIso,
    updated_at: nowIso,
  };
}

export function flattenStockReturnRows(rows = []) {
  const flattened = [];

  for (const row of rows || []) {
    if (!row) continue;

    if (Array.isArray(row.items) && row.items.length > 0) {
      for (const item of row.items) {
        flattened.push({
          id: item.id,
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
      let result = await supabase
        .from("stock_returns")
        .select(`
          id,
          lot_no,
          medicine_id,
          medicine_name,
          brand_name,
          quantity,
          unit_cost,
          expiration_date,
          reason,
          facility_id,
          status,
          submitted_by_id,
          verified_by_id,
          submitted_at,
          verified_at,
          created_at,
          updated_at,
          facility:facilities!stock_returns_facility_id_fkey(id, facility_name, facility_code)
        `)
        .order("submitted_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (
        result.error &&
        (result.error.code === "42703" ||
          String(result.error.message || "").toLowerCase().includes("could not find") ||
          String(result.error.message || "").toLowerCase().includes("column"))
      ) {
        result = await supabase
          .from("stock_returns")
          .select(`
            id,
            return_slip_no,
            source_facility_id,
            return_reason,
            status,
            created_at,
            updated_at,
            source_facility:facilities!stock_returns_source_facility_id_fkey(id, facility_name, facility_code),
            items:stock_return_items(
              id,
              medicine_id,
              batch_number,
              quantity,
              expiration_date,
              unit_cost,
              medicine:medicines(id, generic_name, brand_name)
            )
          `)
          .order("created_at", { ascending: false });
      }

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
  const firstItem = items[0] || {};
  const formValues = stockReturnData || {
    ...returnData,
    ...firstItem,
    lot_no: firstItem.lot_no || firstItem.batch_number,
    reason: returnData.reason || returnData.return_reason,
    facility_id: returnData.facility_id || returnData.source_facility_id,
    medicine_name: firstItem.medicine_name,
    brand_name: firstItem.brand_name,
  };
  const payload = buildStockReturnPayload({ formValues, medicine: medicine || firstItem.medicine, userProfile });

  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute(
        `INSERT OR REPLACE INTO stock_returns (
          id, lot_no, medicine_id, medicine_name, brand_name, quantity, unit_cost,
          expiration_date, reason, facility_id, status, submitted_by_id, verified_by_id,
          submitted_at, verified_at, created_at, updated_at, is_synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.id,
          payload.lot_no,
          payload.medicine_id,
          payload.medicine_name,
          payload.brand_name,
          payload.quantity,
          payload.unit_cost,
          payload.expiration_date,
          payload.reason,
          payload.facility_id,
          payload.status,
          payload.submitted_by_id,
          payload.verified_by_id,
          payload.submitted_at,
          payload.verified_at,
          payload.created_at,
          payload.updated_at,
          isOnline() ? 1 : 0,
        ]
      );
    } catch (localWriteErr) {
      console.warn("[stockReturnsService] SQLite write error:", localWriteErr);
    }
  }

  if (isOnline()) {
    try {
      const { error } = await supabase.from("stock_returns").insert(payload);
      if (error) throw error;

      try {
        await supabase.from("activity_logs").insert({
          user_id: userProfile?.id,
          action: "Stock Return Sent",
          module: "Stock Returns",
          details: `Returned ${payload.quantity} unit(s) of ${payload.medicine_name || "medicine"} from barangay stock. Reason: ${getReturnReasonLabel(payload.reason)}`,
        });
      } catch {}
    } catch (cloudErr) {
      console.warn("[stockReturnsService] Supabase insert failed, enqueuing to outbox:", cloudErr);
      await enqueueMutation({ mutationType: "INSERT", target: "stock_returns", payload });
    }
  } else {
    await enqueueMutation({ mutationType: "INSERT", target: "stock_returns", payload });
  }

  const currentSnapshot = flattenStockReturnRows(getSnapshot(STORAGE_KEYS.STOCK_RETURNS) || []);
  saveSnapshot(STORAGE_KEYS.STOCK_RETURNS, [payload, ...currentSnapshot.filter((row) => row.id !== payload.id)]);

  return payload;
}

export async function verifyStockReturn(returnId, verifiedByUserId = null) {
  const nowIso = new Date().toISOString();
  const updatePayload = {
    id: returnId,
    status: "VERIFIED",
    verified_by_id: verifiedByUserId,
    verified_at: nowIso,
    updated_at: nowIso,
  };

  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute(
        `UPDATE stock_returns
         SET status = 'VERIFIED', verified_by_id = ?, verified_at = ?, updated_at = ?
         WHERE id = ?`,
        [verifiedByUserId, nowIso, nowIso, returnId]
      );
    } catch (err) {
      console.warn("[stockReturnsService] SQLite verify error:", err);
    }
  }

  if (isOnline()) {
    try {
      const { error } = await supabase
        .from("stock_returns")
        .update({
          status: "VERIFIED",
          verified_by_id: verifiedByUserId,
          verified_at: nowIso,
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

export function calculateStockReturnKpis(returns = []) {
  const rows = flattenStockReturnRows(returns);
  const totalReturns = rows.length;
  let totalUnitsReturned = 0;
  let verifiedCount = 0;
  let activeThisMonth = 0;

  const currentMonthPrefix = new Date().toISOString().slice(0, 7);
  const stationCounts = new Map();

  for (const row of rows) {
    if (row.status === "VERIFIED") verifiedCount++;
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
    verifiedCount,
    pendingVerificationCount: totalReturns - verifiedCount,
    activeThisMonth,
    topStations,
  };
}
