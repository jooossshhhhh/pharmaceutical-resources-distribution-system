import { supabase } from "../client/supabase";
import { dataClient } from "../client/dataClient";
import { isCurrentNetworkOnline } from "../sync/networkStatus";
import { getSnapshot, saveSnapshot, STORAGE_KEYS } from "../database/snapshotStore";
import {
  buildWalkInRpcPayload,
  deductWalkInInventoryFefo,
  FOLLOW_UP_ACTIONS,
  getBlockedPatientIdsFromClaimRows,
  getMonthRangeIso,
  getPatientDispensingStatus,
  getPatientMonthlyClaimsBreakdown,
} from "@shared/utils/dispensingUtils";

const DISPENSING_SELECT = `
  id,
  dispensing_transaction_id,
  facility_id,
  medicine_id,
  inventory_id,
  quantity,
  needed_quantity,
  unit_cost_at_dispense,
  total_cost_at_dispense,
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
  medicine:medicines(id, generic_name, dosage, unit_of_measure),
  patient:patients(
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
    facility:facilities!patients_facility_id_fkey(id, facility_name, facility_code)
  ),
  dispenser:profiles!medicine_dispensing_dispensed_by_fkey(id, first_name, last_name, role),
  dispensing_facility:facilities!medicine_dispensing_facility_id_fkey(id, facility_name, facility_code),
  referred_facility:facilities!medicine_dispensing_referred_facility_id_fkey(id, facility_name, facility_code),
  batch:inventory!medicine_dispensing_inventory_id_fkey(id, batch_number, expiration_date, unit_cost, brand_name)
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
          facility_id,
          medicine_id,
          quantity,
          threshold,
          batch_number,
          date_received,
          expiration_date,
          brand_name,
          unit_cost,
          medicine:medicines(id, generic_name, dosage, unit_of_measure, categories)
        `)
        .eq("facility_id", facilityId)
        .order("expiration_date", { ascending: true })
        .order("date_received", { ascending: true });

      if (!error && data && data.length > 0) {
        const cachedMedicines = getSnapshot(STORAGE_KEYS.MEDICINES, []);
        const medMap = new Map(cachedMedicines.map((m) => [m.id, m]));
        return data.map((row) => ({
          ...row,
          medicine: row.medicine || medMap.get(row.medicine_id) || null,
        }));
      }
    } catch (err) {
      console.warn("Online inventory fetch failed, falling back to snapshot:", err);
    }
  }

  // Fallback to local snapshot
  const cachedInventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
  const cachedMedicines = getSnapshot(STORAGE_KEYS.MEDICINES, []);
  const medMap = new Map(cachedMedicines.map((m) => [m.id, m]));

  return cachedInventory
    .filter((inv) => !facilityId || String(inv.facility_id) === String(facilityId))
    .map((inv) => ({
      ...inv,
      medicine: inv.medicine || medMap.get(inv.medicine_id) || null,
    }))
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

export const getPatientsMonthlyClaimOverview = async (
  patientIds,
  { currentFacilityId = null, isBhw = false, today = new Date().toISOString().slice(0, 10) } = {}
) => {
  if (!patientIds || patientIds.length === 0) {
    return new Map();
  }

  const { start } = getMonthRangeIso();
  let claimRows = [];
  const isOnline = isCurrentNetworkOnline();

  if (isOnline) {
    try {
      const { data, error } = await supabase
        .from("medicine_dispensing")
        .select(`
          id,
          patient_id,
          facility_id,
          medicine_id,
          dispensing_transaction_id,
          quantity,
          needed_quantity,
          follow_up_action,
          follow_up_date,
          referred_facility_id,
          dispense_date,
          prescribed_by,
          record_type,
          is_manual_record,
          medicine:medicines(id, generic_name, dosage, unit_of_measure),
          referred_facility:facilities!medicine_dispensing_referred_facility_id_fkey(id, facility_name)
        `)
        .in("patient_id", patientIds)
        .is("voided_at", null)
        .gte("dispense_date", start);

      if (!error && data) {
        claimRows = data;
      }
    } catch (err) {
      console.warn("Online patient claim overview check failed, falling back to snapshot:", err);
    }
  }

  if (claimRows.length === 0) {
    const cachedDispensing = getSnapshot(STORAGE_KEYS.DISPENSING, []);
    claimRows = cachedDispensing.filter(
      (d) =>
        patientIds.includes(d.patient_id || d.patient?.id) &&
        !d.voided_at &&
        (d.dispense_date || "") >= start
    );
  }

  const overviewMap = new Map();
  patientIds.forEach((pid) => {
    const breakdown = getPatientMonthlyClaimsBreakdown(claimRows, pid);
    const status = getPatientDispensingStatus({
      claimsBreakdown: breakdown,
      today,
      currentFacilityId,
      isBhw,
    });
    overviewMap.set(pid, {
      breakdown,
      status,
      isBlocked: status.isBlocked,
      hasPartial: breakdown.some((b) => !b.is_completed),
    });
  });

  return overviewMap;
};

export const getPatientActiveMonthlyClaims = async (patientId, options = {}) => {
  if (!patientId) {
    return {
      breakdown: [],
      hasPartial: false,
      isBlocked: false,
      status: getPatientDispensingStatus({ claimsBreakdown: [] }),
    };
  }

  const overview = await getPatientsMonthlyClaimOverview([patientId], options);
  return (
    overview.get(patientId) || {
      breakdown: [],
      hasPartial: false,
      isBlocked: false,
      status: getPatientDispensingStatus({ claimsBreakdown: [] }),
    }
  );
};

export const getClaimedPatientIds = async (patientIds, options = {}) => {
  if (!patientIds || patientIds.length === 0) {
    return [];
  }

  const overview = await getPatientsMonthlyClaimOverview(patientIds, options);
  const blockedIds = [];
  overview.forEach((value, pid) => {
    if (value.isBlocked) {
      blockedIds.push(pid);
    }
  });
  return blockedIds;
};

export const updateDispensingFollowUp = async ({
  dispensingIds = [],
  patientId,
  followUpAction,
  followUpDate = null,
  referredFacilityId = null,
}) => {
  if (!followUpAction) {
    throw new Error("Follow-up action is required.");
  }

  if (followUpAction === FOLLOW_UP_ACTIONS.schedule && !followUpDate) {
    throw new Error("Follow-up date is required when scheduling a return to CHO.");
  }

  if (followUpAction === FOLLOW_UP_ACTIONS.refer && !referredFacilityId) {
    throw new Error("Please select a Barangay Health Center to refer the patient to.");
  }

  const isOnline = isCurrentNetworkOnline();
  const updatePayload = {
    follow_up_action: followUpAction,
    follow_up_date: followUpAction === FOLLOW_UP_ACTIONS.schedule ? followUpDate : null,
    referred_facility_id: followUpAction === FOLLOW_UP_ACTIONS.refer ? referredFacilityId : null,
  };

  if (isOnline) {
    let query = supabase.from("medicine_dispensing").update(updatePayload);
    if (dispensingIds.length > 0) {
      query = query.in("id", dispensingIds);
    } else if (patientId) {
      const { start } = getMonthRangeIso();
      query = query
        .eq("patient_id", patientId)
        .is("voided_at", null)
        .gte("dispense_date", start);
    } else {
      throw new Error("No dispensing record or patient identified to update.");
    }

    const { error } = await query;
    if (error) {
      throw error;
    }
  }

  // Optimistically update local snapshot store
  try {
    const cachedDispensing = getSnapshot(STORAGE_KEYS.DISPENSING, []);
    const cachedFacilities = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    const facilityMap = new Map(cachedFacilities.map((f) => [String(f.id), f]));

    const targetFacility = referredFacilityId ? facilityMap.get(String(referredFacilityId)) : null;

    const updatedDispensing = cachedDispensing.map((record) => {
      const matchesId = dispensingIds.length > 0 && dispensingIds.includes(record.id);
      const matchesPatient =
        !dispensingIds.length &&
        patientId &&
        String(record.patient_id || record.patient?.id) === String(patientId);

      if (matchesId || matchesPatient) {
        return {
          ...record,
          follow_up_action: updatePayload.follow_up_action,
          follow_up_date: updatePayload.follow_up_date,
          referred_facility_id: updatePayload.referred_facility_id,
          referred_facility: targetFacility
            ? { id: targetFacility.id, facility_name: targetFacility.facility_name }
            : null,
        };
      }
      return record;
    });

    saveSnapshot(STORAGE_KEYS.DISPENSING, updatedDispensing);
  } catch (snapErr) {
    console.warn("Failed to update snapshot store for follow-up update:", snapErr);
  }

  return { success: true };
};

export const getDispensingHistory = async ({ facilityId, patientId } = {}) => {
  const cachedInventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
  const invMap = new Map(cachedInventory.map((i) => [String(i.id), i]));
  const enrichRow = (r) => {
    if (!r) return r;
    const inv = r.inventory_id
      ? invMap.get(String(r.inventory_id))
      : r.batch?.id
      ? invMap.get(String(r.batch.id))
      : null;
    const resolvedBrand =
      r.batch?.brand_name ||
      r.medicine?.brand_name ||
      r.brand_name ||
      inv?.brand_name ||
      null;

    return {
      ...r,
      brand_name: resolvedBrand,
      batch: r.batch
        ? { ...r.batch, brand_name: resolvedBrand || r.batch.brand_name || null }
        : inv
        ? {
            batch_number: inv.batch_number,
            expiration_date: inv.expiration_date,
            unit_cost: inv.unit_cost,
            brand_name: resolvedBrand,
          }
        : null,
    };
  };

  const isOnline = isCurrentNetworkOnline();
  if (isOnline) {
    try {
      let query = supabase
        .from("medicine_dispensing")
        .select(DISPENSING_SELECT)
        .order("dispense_date", { ascending: false });

      if (facilityId) {
        query = query.eq("facility_id", facilityId);
      }

      if (patientId) {
        query = query.eq("patient_id", patientId);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data.map(enrichRow);
      }
    } catch (err) {
      console.warn("Online dispensing history fetch failed, falling back to snapshot:", err);
    }
  }

  const cachedDispensing = getSnapshot(STORAGE_KEYS.DISPENSING, []);
  let filtered = cachedDispensing;
  if (facilityId) {
    filtered = filtered.filter(
      (d) => String(d.facility_id) === String(facilityId)
    );
  }
  if (patientId) {
    filtered = filtered.filter(
      (d) => String(d.patient_id || d.patient?.id) === String(patientId)
    );
  }
  return filtered.map(enrichRow);
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
    const cachedMedicines = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    const medicinesMap = new Map(cachedMedicines.map((m) => [String(m.id), m]));

    const newDispenseRecords = items.map((item) => {
      const med =
        item.medicine ||
        medicinesMap.get(String(item.medicine_id)) ||
        {};
      const generic = (med.generic_name || item.generic_name || "").trim();
      const brand = (med.brand_name || item.brand_name || "").trim();
      const dosage = (med.dosage || item.dosage || "").trim();
      const unit = (med.unit_of_measure || item.unit_of_measure || "").trim();
      const unitCost = Number(med.unit_cost ?? item.unit_cost ?? 0);

      return {
        id: `disp-${Date.now()}-${item.medicine_id}`,
        dispensing_transaction_id: txId,
        facility_id: dispensingFacilityId,
        patient_id: patientId,
        medicine_id: item.medicine_id,
        needed_quantity: Number(item.needed_quantity ?? item.quantity),
        quantity: Number(item.quantity),
        dispense_date: new Date().toISOString(),
        prescribed_by: prescribedBy,
        follow_up_action: item.follow_up_action || null,
        follow_up_date: item.follow_up_date || null,
        referred_facility_id: item.referred_facility_id || null,
        record_type: "LIVE_DISPENSING",
        generic_name: generic,
        brand_name: brand,
        dosage,
        unit_of_measure: unit,
        unit_cost: unitCost,
        medicine: {
          id: item.medicine_id,
          generic_name: generic,
          brand_name: brand,
          dosage,
          unit_of_measure: unit,
          unit_cost: unitCost,
        },
      };
    });
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
