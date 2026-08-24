import { supabase } from "../../services/supabase";
import { getMonthRangeIso } from "./dispensingUtils";

const DISPENSING_SELECT = `
  id,
  dispensing_transaction_id,
  quantity,
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
  batch:inventory!medicine_dispensing_inventory_id_fkey(id, batch_number, expiration_date)
`;

export const getWalkInInventory = async (facilityId) => {
  if (!facilityId) {
    return [];
  }

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

  if (error) {
    throw error;
  }

  return data || [];
};

export const searchDispensingPatients = async ({ facilityId = null, keyword = "" } = {}) => {
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

  if (facilityId) {
    query = query.eq("facility_id", facilityId);
  }

  const term = (keyword || "").trim();

  if (term) {
    const sanitized = term.replace(/[%,()]/g, " ");
    query = query.or(
      [
        `first_name.ilike.%${sanitized}%`,
        `last_name.ilike.%${sanitized}%`,
        `patient_code.ilike.%${sanitized}%`,
      ].join(",")
    );
  }

  const { data, error } = await query.order("first_name", { ascending: true }).limit(25);

  if (error) {
    throw error;
  }

  return data || [];
};

export const getPatientClaimStatus = async (patientId) => {
  const { data, error } = await supabase.rpc("get_patient_monthly_claim_status", {
    p_patient_id: patientId,
  });

  if (error) {
    throw error;
  }

  return Boolean(data?.claimed_this_month);
};

export const getClaimedPatientIds = async (patientIds) => {
  if (!patientIds || patientIds.length === 0) {
    return [];
  }

  const { start } = getMonthRangeIso();
  const { data, error } = await supabase
    .from("medicine_dispensing")
    .select("patient_id")
    .in("patient_id", patientIds)
    .is("voided_at", null)
    .gte("dispense_date", start);

  if (error) {
    throw error;
  }

  return Array.from(new Set((data || []).map((row) => row.patient_id)));
};

export const getDispensingHistory = async ({ patientId } = {}) => {
  let query = supabase
    .from("medicine_dispensing")
    .select(DISPENSING_SELECT)
    .order("dispense_date", { ascending: false });

  if (patientId) {
    query = query.eq("patient_id", patientId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
};

export const registerQuickPatient = async ({ profileId, payload }) => {
  const { data, error } = await supabase
    .from("patients")
    .insert({
      created_by: profileId,
      ...payload,
    })
    .select(`
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
    `)
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const completeWalkInDispensing = async ({ items, patientId }) => {
  const { data, error } = await supabase.rpc("dispense_walk_in", {
    p_items: items.map((item) => ({
      medicine_id: item.medicine_id,
      quantity: Number(item.quantity),
    })),
    p_patient_id: patientId,
  });

  if (error) {
    throw error;
  }

  return data;
};

export const voidDispensingTransaction = async ({ reason, transactionId }) => {
  const { error } = await supabase.rpc("void_dispensing_transaction", {
    p_reason: reason,
    p_transaction_id: transactionId,
  });

  if (error) {
    throw error;
  }
};
