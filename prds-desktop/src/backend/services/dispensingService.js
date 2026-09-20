import { supabase } from "../client/supabase";
import { dataClient } from "../client/dataClient";
import { isCurrentNetworkOnline } from "../sync/networkStatus";
import { getSnapshot, saveSnapshot, STORAGE_KEYS } from "../database/snapshotStore";
import {
  buildWalkInRpcPayload,
  deductWalkInInventoryFefo,
  getBlockedPatientIdsFromClaimRows,
  getMonthRangeIso,
} from "@shared/utils/dispensingUtils";

const DISPENSING_SELECT = `
  id,
  dispensing_transaction_id,
  medicine_id,
  quantity,
  needed_quantity,
  prescribed_by,
  follow_up_action,
  follow_up_date,
  is_manual_record,
  record_type,
  manual_dispensed_by,
  dispensing_type,
  dispense_date,
  voided_at,
  void_reason,
  medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure),
  patient:patients(
    id,
    patient_code,
    first_name,
    middle_name,
    last_name,
    suffix,
    gender,
    date_of_birth,
    facility:facilities!patients_facility_id_fkey(id, facility_name, facility_code)
  ),
  dispenser:profiles!medicine_dispensing_dispensed_by_fkey(id, first_name, last_name, role),
  dispensing_facility:facilities!medicine_dispensing_facility_id_fkey(id, facility_name, facility_code),
  referred_facility:facilities!medicine_dispensing_referred_facility_id_fkey(id, facility_name, facility_code),
  batch:inventory!medicine_dispensing_inventory_id_fkey(id, batch_number, expiration_date)
`;

export const getWalkInInventory = async (facilityId) => {
  if (!facilityId) {
    return [];
  }

  const isOnline = isCurrentNetworkOnline();
  if (isOnline) {
    try {
      const { data, error } = await supabase
        .from("inventory")
        .select(`
          id,
          medicine_id,
          supplier_id,
          quantity,
          threshold,
          batch_number,
          date_received,
          expiration_date,
          medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure),
          supplier:suppliers(id, supplier_name)
        `)
        .eq("facility_id", facilityId)
        .order("expiration_date", { ascending: true })
        .order("date_received", { ascending: true });

      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn("Online inventory fetch failed, falling back to snapshot:", err);
    }
  }

  // Fallback to local snapshot
  const cachedInventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
  return cachedInventory
    .filter((inv) => !facilityId || String(inv.facility_id) === String(facilityId))
    .sort((a, b) => (a.expiration_date || "").localeCompare(b.expiration_date || ""));
};

export const getFacilityMedicineStockOverview = async ({ facilityId, medicineIds = [] } = {}) => {
  if (!facilityId || medicineIds.length === 0) {
    return [];
  }

  const isOnline = isCurrentNetworkOnline();
  if (isOnline) {
    try {
      const { data, error } = await supabase
        .from("inventory")
        .select("id, medicine_id, quantity, batch_number, expiration_date")
        .eq("facility_id", facilityId)
        .in("medicine_id", medicineIds)
        .gt("quantity", 0)
        .gt("expiration_date", new Date().toISOString().slice(0, 10))
        .order("expiration_date", { ascending: true });

      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn("Online stock overview fetch failed, falling back to snapshot:", err);
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const cachedInventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
  return cachedInventory
    .filter(
      (inv) =>
        (!facilityId || String(inv.facility_id) === String(facilityId)) &&
        medicineIds.includes(inv.medicine_id) &&
        Number(inv.quantity) > 0 &&
        (!inv.expiration_date || inv.expiration_date > todayStr)
    )
    .sort((a, b) => (a.expiration_date || "").localeCompare(b.expiration_date || ""));
};

export const searchDispensingPatients = async ({ facilityId = null, keyword = "" } = {}) => {
  const isOnline = isCurrentNetworkOnline();
  if (isOnline) {
    try {
      let query = supabase.from("patients").select(`
        id,
        patient_code,
        first_name,
        middle_name,
        last_name,
        suffix,
        gender,
        date_of_birth,
        contact_number,
        address,
        created_at,
        facility_id,
        facility:facilities!patients_facility_id_fkey(id, facility_name, facility_code)
      `);

      query = query.is("archived_at", null);

      if (facilityId) {
        query = query.eq("facility_id", facilityId);
      }

      const term = (keyword || "").trim();

      if (term) {
        term
          .replace(/[%,()]/g, " ")
          .split(/\s+/)
          .filter(Boolean)
          .forEach((part) => {
            query = query.or(
              [
                `first_name.ilike.%${part}%`,
                `middle_name.ilike.%${part}%`,
                `last_name.ilike.%${part}%`,
                `patient_code.ilike.%${part}%`,
              ].join(",")
            );
          });
      }

      const { data, error } = await query.order("first_name", { ascending: true }).limit(25);
      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn("Online patient search failed, falling back to snapshot:", err);
    }
  }

  // Fallback to local snapshot
  const cachedPatients = getSnapshot(STORAGE_KEYS.PATIENTS, []);
  const term = (keyword || "").toLowerCase().trim();

  return cachedPatients
    .filter((p) => {
      if (facilityId && String(p.facility_id) !== String(facilityId)) return false;
      if (!term) return true;
      const fullName = `${p.first_name || ""} ${p.middle_name || ""} ${p.last_name || ""} ${p.patient_code || ""}`.toLowerCase();
      return fullName.includes(term);
    })
    .slice(0, 25);
};

export const getPatientClaimStatus = async (patientId) => {
  const isOnline = isCurrentNetworkOnline();
  if (isOnline) {
    try {
      const { data, error } = await supabase.rpc("get_patient_monthly_claim_status", {
        p_patient_id: patientId,
      });
      if (!error && data !== undefined) {
        return Boolean(data?.claimed_this_month);
      }
    } catch (err) {
      console.warn("Online claim status RPC failed, falling back to snapshot:", err);
    }
  }

  const { start } = getMonthRangeIso();
  const cachedDispensing = getSnapshot(STORAGE_KEYS.DISPENSING, []);
  const claimed = cachedDispensing.some(
    (d) =>
      String(d.patient_id || d.patient?.id) === String(patientId) &&
      !d.voided_at &&
      (d.dispense_date || "") >= start
  );
  return claimed;
};

export const getClaimedPatientIds = async (patientIds) => {
  if (!patientIds || patientIds.length === 0) {
    return [];
  }

  const { start } = getMonthRangeIso();
  const isOnline = isCurrentNetworkOnline();
  if (isOnline) {
    try {
      const { data, error } = await supabase
        .from("medicine_dispensing")
        .select("patient_id, medicine_id, dispensing_transaction_id, quantity, needed_quantity, is_manual_record, record_type")
        .in("patient_id", patientIds)
        .is("voided_at", null)
        .gte("dispense_date", start);

      if (!error && data) {
        return getBlockedPatientIdsFromClaimRows(data);
      }
    } catch (err) {
      console.warn("Online claimed patient IDs check failed, falling back to snapshot:", err);
    }
  }

  const cachedDispensing = getSnapshot(STORAGE_KEYS.DISPENSING, []);
  const filtered = cachedDispensing.filter(
    (d) =>
      patientIds.includes(d.patient_id || d.patient?.id) &&
      !d.voided_at &&
      (d.dispense_date || "") >= start
  );
  return getBlockedPatientIdsFromClaimRows(filtered);
};

export const getDispensingHistory = async ({ patientId } = {}) => {
  const isOnline = isCurrentNetworkOnline();
  if (isOnline) {
    try {
      let query = supabase
        .from("medicine_dispensing")
        .select(DISPENSING_SELECT)
        .order("dispense_date", { ascending: false });

      if (patientId) {
        query = query.eq("patient_id", patientId);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn("Online dispensing history fetch failed, falling back to snapshot:", err);
    }
  }

  const cachedDispensing = getSnapshot(STORAGE_KEYS.DISPENSING, []);
  if (patientId) {
    return cachedDispensing.filter(
      (d) => String(d.patient_id || d.patient?.id) === String(patientId)
    );
  }
  return cachedDispensing;
};

export const completeWalkInDispensing = async ({ facilityId, items, patientId, prescribedBy }) => {
  const rpcPayload = buildWalkInRpcPayload({
    items,
    operationId: globalThis.crypto.randomUUID(),
    patientId,
    prescribedBy,
  });

  const { data, error, isOfflineQueued } = await dataClient.rpc("dispense_walk_in_idempotent", rpcPayload);

  if (error) {
    throw error;
  }

  // Optimistically update local inventory snapshot
  try {
    const cachedInventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
    const dispensingFacilityId = data?.facility_id || facilityId;
    const updatedInventory = deductWalkInInventoryFefo({
      facilityId: dispensingFacilityId,
      inventoryRows: cachedInventory,
      items,
    });
    saveSnapshot(STORAGE_KEYS.INVENTORY, updatedInventory);

    // Also optimistically record dispensing event in snapshot
    const txId = isOfflineQueued
      ? `OFFLINE-${Date.now().toString(36).toUpperCase()}`
      : data?.transaction_id || `TX-${Date.now()}`;
    const cachedDispensing = getSnapshot(STORAGE_KEYS.DISPENSING, []);
    const newDispenseRecords = items.map((item) => ({
      id: `disp-${Date.now()}-${item.medicine_id}`,
      dispensing_transaction_id: txId,
      facility_id: dispensingFacilityId,
      patient_id: patientId,
      medicine_id: item.medicine_id,
      needed_quantity: Number(item.needed_quantity ?? item.quantity),
      quantity: Number(item.quantity),
      dispense_date: new Date().toISOString(),
      prescribed_by: prescribedBy,
      record_type: "LIVE_DISPENSING",
    }));
    saveSnapshot(STORAGE_KEYS.DISPENSING, [...newDispenseRecords, ...cachedDispensing]);
  } catch (optErr) {
    console.warn("Optimistic local inventory update failed:", optErr);
  }

  if (isOfflineQueued) {
    return {
      dispensed_at: new Date().toISOString(),
      transaction_id: `OFFLINE-${Date.now().toString(36).toUpperCase()}`,
      queued: true,
    };
  }

  return data;
};

export const voidDispensingTransaction = async ({ reason, transactionId }) => {
  const { error } = await dataClient.rpc("void_dispensing_transaction", {
    p_reason: reason,
    p_transaction_id: transactionId,
  });

  if (error) {
    throw error;
  }
};
