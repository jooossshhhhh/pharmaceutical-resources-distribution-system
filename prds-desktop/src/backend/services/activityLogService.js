import { supabase } from "../client/supabase";
import { getSnapshot, saveSnapshot, STORAGE_KEYS } from "../database/snapshotStore";
import { isCurrentNetworkOnline } from "../sync/networkStatus";

export const getActivityLogData = async () => {
  const cachedLogs = getSnapshot(STORAGE_KEYS.ACTIVITY_LOGS, []);
  const cachedFacilities = getSnapshot(STORAGE_KEYS.FACILITIES, []);
  const cachedRequests = getSnapshot(STORAGE_KEYS.REQUESTS, []);
  const cachedPatients = getSnapshot(STORAGE_KEYS.PATIENTS, []);

  if (!isCurrentNetworkOnline()) {
    return {
      facilities: cachedFacilities,
      logs: cachedLogs,
      requests: cachedRequests,
      patients: cachedPatients,
    };
  }

  try {
    const [
      logsResult,
      facilitiesResult,
      requestsResult,
      patientsResult,
      fulfillmentsResult,
    ] = await Promise.all([
      supabase
        .from("activity_logs")
        .select(
          `
          id,
          user_id,
          action,
          module,
          details,
          created_at,
          user:profiles!activity_logs_user_id_fkey(
            id,
            first_name,
            last_name,
            email,
            phone_number,
            role,
            facility_id,
            facility:facilities(id, facility_name, facility_code)
          )
        `
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("facilities")
        .select("id, facility_name, facility_code")
        .eq("status", "ACTIVE")
        .order("facility_name", { ascending: true }),
      supabase
        .from("medicine_requests")
        .select(
          `
          id,
          facility_id,
          manual_requested_by,
          request_source,
          request_date,
          status,
          facility:facilities(id, facility_name, facility_code),
          requester:profiles!medicine_requests_requested_by_fkey(id, first_name, last_name),
          items:medicine_request_items(id, quantity, medicine:medicines(id, generic_name, brand_name, dosage))
        `
        )
        .order("request_date", { ascending: false })
        .limit(200),
      supabase
        .from("patients")
        .select("id, patient_code, first_name, last_name")
        .limit(200),
      supabase
        .from("medicine_request_fulfillments")
        .select("id, request_id, request_item_id, quantity"),
    ]);

    const firstError = logsResult.error || facilitiesResult.error || requestsResult.error || patientsResult.error || fulfillmentsResult.error;
    if (firstError) {
      throw firstError;
    }

    const fulfillmentsByRequest = (fulfillmentsResult?.data || []).reduce((acc, row) => {
      const list = acc.get(row.request_id) || [];
      list.push(row);
      acc.set(row.request_id, list);
      return acc;
    }, new Map());

    const logs = logsResult.data || cachedLogs;
    const facilities = facilitiesResult.data || cachedFacilities;
    const rawRequests = requestsResult.data || cachedRequests;
    const requests = rawRequests.map((request) => ({
      ...request,
      fulfillments: fulfillmentsByRequest.get(request.id) || request.fulfillments || [],
    }));
    const patients = patientsResult.data || cachedPatients;

    if (logsResult.data) {
      saveSnapshot(STORAGE_KEYS.ACTIVITY_LOGS, logs);
    }
    if (facilitiesResult.data) {
      saveSnapshot(STORAGE_KEYS.FACILITIES, facilities);
    }
    if (requestsResult.data) {
      saveSnapshot(STORAGE_KEYS.REQUESTS, requests);
    }
    if (patientsResult.data) {
      saveSnapshot(STORAGE_KEYS.PATIENTS, patients);
    }

    return {
      facilities,
      logs,
      requests,
      patients,
    };
  } catch (err) {
    console.warn("getActivityLogData online fetch failed, using snapshot:", err);
    return {
      facilities: cachedFacilities,
      logs: cachedLogs,
      requests: cachedRequests,
      patients: cachedPatients,
      error: err,
    };
  }
};
