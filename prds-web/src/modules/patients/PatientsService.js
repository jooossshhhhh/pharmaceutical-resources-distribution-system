import { supabase } from "../../services/supabase";

const PATIENT_SELECT = `
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
  facility_id,
  created_by,
  created_at,
  updated_at,
  archived_at,
  archived_by,
  archive_reason,
  facility:facilities!patients_facility_id_fkey(
    id,
    facility_name,
    facility_code,
    facility_type,
    address
  ),
  registered_by:profiles!patients_created_by_fkey(
    id,
    first_name,
    last_name,
    role
  )
`;

export const getPatients = async ({ archiveMode = "active", facilityId } = {}) => {
  let query = supabase.from("patients").select(PATIENT_SELECT);

  if (facilityId) {
    query = query.eq("facility_id", facilityId);
  }

  if (archiveMode === "archived") {
    query = query.not("archived_at", "is", null);
  } else if (archiveMode !== "all") {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
};

export const getHealthCenterFacilities = async () => {
  const { data, error } = await supabase
    .from("facilities")
    .select("id, facility_name, facility_code, facility_type, address, status")
    .eq("facility_type", "HEALTH_CENTER")
    .eq("status", "ACTIVE")
    .order("facility_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
};

export const createPatient = async (payload) => {
  const { data, error } = await supabase
    .from("patients")
    .insert(payload)
    .select(PATIENT_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const updatePatient = async (patientId, payload) => {
  const { data, error } = await supabase
    .from("patients")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", patientId)
    .select(PATIENT_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const archivePatient = async (patientId, { reason = "" } = {}) => {
  const { data, error } = await supabase
    .from("patients")
    .update({
      archive_reason: reason?.trim() || null,
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", patientId)
    .select(PATIENT_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const restorePatient = async (patientId) => {
  const { data, error } = await supabase
    .from("patients")
    .update({
      archive_reason: null,
      archived_at: null,
      archived_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", patientId)
    .select(PATIENT_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const getPatientReferenceCounts = async (patientId) => {
  const [dispensingResult, patientRecordsResult] = await Promise.all([
    supabase
      .from("medicine_dispensing")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId),
    supabase
      .from("patient_medicine_records")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId),
  ]);

  const firstError = dispensingResult.error || patientRecordsResult.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    dispensing: dispensingResult.count || 0,
    patientRecords: patientRecordsResult.count || 0,
  };
};

export const deleteArchivedPatient = async (patientId) => {
  const referenceCounts = await getPatientReferenceCounts(patientId);
  const hasHistory = referenceCounts.dispensing > 0 || referenceCounts.patientRecords > 0;

  if (hasHistory) {
    throw new Error(
      "This patient has dispensing history and cannot be permanently deleted. Keep the archived record for audit history."
    );
  }

  const { error } = await supabase.from("patients").delete().eq("id", patientId);

  if (error) {
    throw new Error(error.message);
  }
};
