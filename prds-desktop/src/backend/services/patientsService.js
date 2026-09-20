import { supabase } from "../client/supabase";
import { saveSnapshot, getSnapshot, STORAGE_KEYS } from "../database/snapshotStore";
import { isCurrentNetworkOnline } from "../sync/networkStatus";
import { createOfflineInsertPayload, enqueueMutation } from "../sync/outboxQueue";

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
  if (!isCurrentNetworkOnline()) {
    const cached = getSnapshot(STORAGE_KEYS.PATIENTS, []);
    return facilityId ? cached.filter((p) => p.facility_id === facilityId) : cached;
  }

  try {
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

    if (data && (!facilityId || facilityId.length === 0)) {
      saveSnapshot(STORAGE_KEYS.PATIENTS, data);
    }

    return data || [];
  } catch (err) {
    console.warn("getPatients online error, using snapshot:", err);
    const cached = getSnapshot(STORAGE_KEYS.PATIENTS, []);
    return facilityId ? cached.filter((p) => p.facility_id === facilityId) : cached;
  }
};

export const getHealthCenterFacilities = async () => {
  if (!isCurrentNetworkOnline()) {
    const cached = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    return cached.filter((f) => f.facility_type === "HEALTH_CENTER" && f.status === "ACTIVE");
  }

  try {
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
  } catch (err) {
    const cached = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    return cached.filter((f) => f.facility_type === "HEALTH_CENTER" && f.status === "ACTIVE");
  }
};

export const createPatient = async (payload) => {
  const isOnline = isCurrentNetworkOnline();

  if (!isOnline) {
    const insertPayload = createOfflineInsertPayload(payload);
    const facilities = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    const patientFacility = facilities.find((f) => f.id === insertPayload.facility_id);
    const newRecord = {
      ...insertPayload,
      facility: patientFacility || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await enqueueMutation({
      mutationType: "INSERT",
      target: "patients",
      payload: insertPayload,
    });
    const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
    saveSnapshot(STORAGE_KEYS.PATIENTS, [newRecord, ...current]);
    return newRecord;
  }

  try {
    const { data, error } = await supabase
      .from("patients")
      .insert(payload)
      .select(PATIENT_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
      saveSnapshot(STORAGE_KEYS.PATIENTS, [data, ...current]);
    }

    return data;
  } catch (err) {
    const isNetworkErr =
      !isCurrentNetworkOnline() ||
      err.message?.includes("Failed to fetch") ||
      err.message?.includes("NetworkError");

    if (isNetworkErr) {
      const insertPayload = createOfflineInsertPayload(payload);
      const facilities = getSnapshot(STORAGE_KEYS.FACILITIES, []);
      const patientFacility = facilities.find((f) => f.id === insertPayload.facility_id);
      const newRecord = {
        ...insertPayload,
        facility: patientFacility || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await enqueueMutation({
        mutationType: "INSERT",
        target: "patients",
        payload: insertPayload,
      });
      const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
      saveSnapshot(STORAGE_KEYS.PATIENTS, [newRecord, ...current]);
      return newRecord;
    }
    throw err;
  }
};

export const updatePatient = async (patientId, payload) => {
  const isOnline = isCurrentNetworkOnline();

  if (!isOnline) {
    const updateValues = { ...payload, updated_at: new Date().toISOString() };
    await enqueueMutation({
      mutationType: "UPDATE",
      target: "patients",
      payload: { id: patientId, values: updateValues },
    });
    const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
    let updatedRecord = null;
    const updatedList = current.map((p) => {
      if (p.id === patientId) {
        updatedRecord = { ...p, ...updateValues };
        return updatedRecord;
      }
      return p;
    });
    saveSnapshot(STORAGE_KEYS.PATIENTS, updatedList);
    return updatedRecord || { id: patientId, ...updateValues };
  }

  try {
    const { data, error } = await supabase
      .from("patients")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", patientId)
      .select(PATIENT_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
      const updatedList = current.map((p) => (p.id === patientId ? data : p));
      saveSnapshot(STORAGE_KEYS.PATIENTS, updatedList);
    }

    return data;
  } catch (err) {
    const isNetworkErr =
      !isCurrentNetworkOnline() ||
      err.message?.includes("Failed to fetch") ||
      err.message?.includes("NetworkError");

    if (isNetworkErr) {
      const updateValues = { ...payload, updated_at: new Date().toISOString() };
      await enqueueMutation({
        mutationType: "UPDATE",
        target: "patients",
        payload: { id: patientId, values: updateValues },
      });
      const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
      let updatedRecord = null;
      const updatedList = current.map((p) => {
        if (p.id === patientId) {
          updatedRecord = { ...p, ...updateValues };
          return updatedRecord;
        }
        return p;
      });
      saveSnapshot(STORAGE_KEYS.PATIENTS, updatedList);
      return updatedRecord || { id: patientId, ...updateValues };
    }
    throw err;
  }
};

export const archivePatient = async (patientId, { reason = "" } = {}) => {
  const archivePayload = {
    archive_reason: reason?.trim() || null,
    archived_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const isOnline = isCurrentNetworkOnline();

  if (!isOnline) {
    await enqueueMutation({
      mutationType: "UPDATE",
      target: "patients",
      payload: { id: patientId, values: archivePayload },
    });
    const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
    let updatedRecord = null;
    const updatedList = current.map((p) => {
      if (p.id === patientId) {
        updatedRecord = { ...p, ...archivePayload };
        return updatedRecord;
      }
      return p;
    });
    saveSnapshot(STORAGE_KEYS.PATIENTS, updatedList);
    return updatedRecord || { id: patientId, ...archivePayload };
  }

  try {
    const { data, error } = await supabase
      .from("patients")
      .update(archivePayload)
      .eq("id", patientId)
      .select(PATIENT_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
      const updatedList = current.map((p) => (p.id === patientId ? data : p));
      saveSnapshot(STORAGE_KEYS.PATIENTS, updatedList);
    }

    return data;
  } catch (err) {
    const isNetworkErr =
      !isCurrentNetworkOnline() ||
      err.message?.includes("Failed to fetch") ||
      err.message?.includes("NetworkError");

    if (isNetworkErr) {
      await enqueueMutation({
        mutationType: "UPDATE",
        target: "patients",
        payload: { id: patientId, values: archivePayload },
      });
      const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
      let updatedRecord = null;
      const updatedList = current.map((p) => {
        if (p.id === patientId) {
          updatedRecord = { ...p, ...archivePayload };
          return updatedRecord;
        }
        return p;
      });
      saveSnapshot(STORAGE_KEYS.PATIENTS, updatedList);
      return updatedRecord || { id: patientId, ...archivePayload };
    }
    throw err;
  }
};

export const restorePatient = async (patientId) => {
  const restorePayload = {
    archive_reason: null,
    archived_at: null,
    archived_by: null,
    updated_at: new Date().toISOString(),
  };

  const isOnline = isCurrentNetworkOnline();

  if (!isOnline) {
    await enqueueMutation({
      mutationType: "UPDATE",
      target: "patients",
      payload: { id: patientId, values: restorePayload },
    });
    const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
    let updatedRecord = null;
    const updatedList = current.map((p) => {
      if (p.id === patientId) {
        updatedRecord = { ...p, ...restorePayload };
        return updatedRecord;
      }
      return p;
    });
    saveSnapshot(STORAGE_KEYS.PATIENTS, updatedList);
    return updatedRecord || { id: patientId, ...restorePayload };
  }

  try {
    const { data, error } = await supabase
      .from("patients")
      .update(restorePayload)
      .eq("id", patientId)
      .select(PATIENT_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
      const updatedList = current.map((p) => (p.id === patientId ? data : p));
      saveSnapshot(STORAGE_KEYS.PATIENTS, updatedList);
    }

    return data;
  } catch (err) {
    const isNetworkErr =
      !isCurrentNetworkOnline() ||
      err.message?.includes("Failed to fetch") ||
      err.message?.includes("NetworkError");

    if (isNetworkErr) {
      await enqueueMutation({
        mutationType: "UPDATE",
        target: "patients",
        payload: { id: patientId, values: restorePayload },
      });
      const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
      let updatedRecord = null;
      const updatedList = current.map((p) => {
        if (p.id === patientId) {
          updatedRecord = { ...p, ...restorePayload };
          return updatedRecord;
        }
        return p;
      });
      saveSnapshot(STORAGE_KEYS.PATIENTS, updatedList);
      return updatedRecord || { id: patientId, ...restorePayload };
    }
    throw err;
  }
};

export const getPatientReferenceCounts = async (patientId) => {
  if (!isCurrentNetworkOnline()) {
    return { dispensing: 0, patientRecords: 0 };
  }

  try {
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
      return { dispensing: 0, patientRecords: 0 };
    }

    return {
      dispensing: dispensingResult.count || 0,
      patientRecords: patientRecordsResult.count || 0,
    };
  } catch {
    return { dispensing: 0, patientRecords: 0 };
  }
};

export const deleteArchivedPatient = async (patientId) => {
  const referenceCounts = await getPatientReferenceCounts(patientId);
  const hasHistory = referenceCounts.dispensing > 0 || referenceCounts.patientRecords > 0;

  if (hasHistory) {
    throw new Error(
      "This patient has dispensing history and cannot be permanently deleted. Keep the archived record for audit history."
    );
  }

  const isOnline = isCurrentNetworkOnline();
  if (!isOnline) {
    await enqueueMutation({
      mutationType: "DELETE",
      target: "patients",
      payload: { id: patientId },
    });
    const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
    saveSnapshot(
      STORAGE_KEYS.PATIENTS,
      current.filter((p) => p.id !== patientId)
    );
    return;
  }

  try {
    const { error } = await supabase.from("patients").delete().eq("id", patientId);

    if (error) {
      throw new Error(error.message);
    }

    const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
    saveSnapshot(
      STORAGE_KEYS.PATIENTS,
      current.filter((p) => p.id !== patientId)
    );
  } catch (err) {
    const isNetworkErr =
      !isCurrentNetworkOnline() ||
      err.message?.includes("Failed to fetch") ||
      err.message?.includes("NetworkError");

    if (isNetworkErr) {
      await enqueueMutation({
        mutationType: "DELETE",
        target: "patients",
        payload: { id: patientId },
      });
      const current = getSnapshot(STORAGE_KEYS.PATIENTS, []);
      saveSnapshot(
        STORAGE_KEYS.PATIENTS,
        current.filter((p) => p.id !== patientId)
      );
      return;
    }
    throw err;
  }
};

export const getManualRecordMedicines = async () => {
  if (!isCurrentNetworkOnline()) {
    return getSnapshot(STORAGE_KEYS.MEDICINES, []);
  }

  try {
    const { data, error } = await supabase
      .from("medicines")
      .select("id, generic_name, brand_name, dosage, unit_of_measure")
      .order("generic_name", { ascending: true });

    if (error) {
      return getSnapshot(STORAGE_KEYS.MEDICINES, []);
    }

    if (data) {
      saveSnapshot(STORAGE_KEYS.MEDICINES, data);
    }

    return data || [];
  } catch {
    return getSnapshot(STORAGE_KEYS.MEDICINES, []);
  }
};

export const getActiveFacilities = async () => {
  if (!isCurrentNetworkOnline()) {
    const cached = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    return cached.filter((f) => f.status === "ACTIVE");
  }

  try {
    const { data, error } = await supabase
      .from("facilities")
      .select("id, facility_name, facility_code, facility_type, address, status")
      .eq("status", "ACTIVE")
      .order("facility_name", { ascending: true });

    if (error) {
      const cached = getSnapshot(STORAGE_KEYS.FACILITIES, []);
      return cached.filter((f) => f.status === "ACTIVE");
    }

    return data || [];
  } catch {
    const cached = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    return cached.filter((f) => f.status === "ACTIVE");
  }
};

export const addPatientManualDispensingRecord = async ({
  date,
  dispensedBy,
  facilityId,
  medicineId,
  neededQuantity,
  patientId,
  prescribedBy,
  recordType = "HISTORY_ONLY",
  releasedQuantity,
}) => {
  const args = {
    p_dispense_date: date,
    p_dispensing_facility_id: facilityId,
    p_manual_dispensed_by: dispensedBy,
    p_medicine_id: medicineId,
    p_needed_quantity: Number(neededQuantity),
    p_patient_id: patientId,
    p_prescribed_by: prescribedBy,
    p_quantity: Number(releasedQuantity),
    p_record_type: recordType,
  };

  const isOnline = isCurrentNetworkOnline();
  if (!isOnline) {
    await enqueueMutation({
      mutationType: "RPC",
      target: "add_patient_manual_dispensing_record",
      payload: args,
    });
    return { success: true, offline: true };
  }

  try {
    const { data, error } = await supabase.rpc("add_patient_manual_dispensing_record", args);

    if (error) {
      throw new Error(error.message);
    }

    return data;
  } catch (err) {
    const isNetworkErr =
      !isCurrentNetworkOnline() ||
      err.message?.includes("Failed to fetch") ||
      err.message?.includes("NetworkError");

    if (isNetworkErr) {
      await enqueueMutation({
        mutationType: "RPC",
        target: "add_patient_manual_dispensing_record",
        payload: args,
      });
      return { success: true, offline: true };
    }
    throw err;
  }
};
