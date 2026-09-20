import { supabase } from "../client/supabase";
import { saveSnapshot, getSnapshot, STORAGE_KEYS } from "../database/snapshotStore";
import { isCurrentNetworkOnline } from "../sync/networkStatus";
import { dataClient } from "../client/dataClient";

const getCachedChoMedicines = () => {
  const today = new Date().toISOString().slice(0, 10);
  const choFacilityIds = new Set(
    getSnapshot(STORAGE_KEYS.FACILITIES, [])
      .filter((facility) => facility.facility_type === "CHO" && facility.status === "ACTIVE")
      .map((facility) => facility.id)
  );
  const physicalByMedicine = new Map();
  getSnapshot(STORAGE_KEYS.INVENTORY, []).forEach((row) => {
    if (!choFacilityIds.has(row.facility_id) || !row.medicine_id ||
        Number(row.quantity) <= 0 || !row.expiration_date || row.expiration_date <= today) return;
    physicalByMedicine.set(row.medicine_id, (physicalByMedicine.get(row.medicine_id) || 0) + Number(row.quantity));
  });

  const reservedByMedicine = new Map();
  getSnapshot(STORAGE_KEYS.REQUESTS, [])
    .filter((request) => ["PENDING", "APPROVED"].includes(request.status))
    .flatMap((request) => request.items || [])
    .forEach((item) => reservedByMedicine.set(
      item.medicine_id,
      (reservedByMedicine.get(item.medicine_id) || 0) + Number(item.quantity || 0)
    ));

  const medicines = new Map(getSnapshot(STORAGE_KEYS.MEDICINES, []).map((medicine) => [medicine.id, medicine]));
  return [...physicalByMedicine].map(([medicineId, physicalQuantity]) => ({
    ...(medicines.get(medicineId) || { id: medicineId }),
    physical_quantity: physicalQuantity,
    reserved_quantity: reservedByMedicine.get(medicineId) || 0,
    available_quantity: Math.max(0, physicalQuantity - (reservedByMedicine.get(medicineId) || 0)),
  }));
};

const callQueueableRequestRpc = async (functionName, params, facilityId) => {
  const result = await dataClient.rpc(functionName, {
    p_operation_id: globalThis.crypto.randomUUID(),
    ...params,
  }, { facilityId });
  if (result.error) throw result.error;
  return result.isOfflineQueued
    ? { queued: true, mutationId: result.data.mutationId }
    : result.data;
};

const buildRequestSelect = (withReceiptFields, withSourceFields) => `
    id,
    requested_by,
    facility_id,
    request_date,
    status,
    approved_by,
    approved_at,
    ${withReceiptFields ? "received_by," : ""}
    ${withReceiptFields ? "received_at," : ""}
    ${withSourceFields ? "request_source," : ""}
    ${withSourceFields ? "manual_requested_by," : ""}
    ${withSourceFields ? "encoded_by," : ""}
    remarks,
    facility:facilities(id, facility_name, facility_code, facility_type, address),
    requester:profiles!medicine_requests_requested_by_fkey(
      id,
      first_name,
      last_name,
      email,
      phone_number,
      role
    ),
    approver:profiles!medicine_requests_approved_by_fkey(
      id,
      first_name,
      last_name
    ),
    ${
      withReceiptFields
        ? "receiver:profiles!medicine_requests_received_by_fkey(id, first_name, last_name),"
        : ""
    }
    items:medicine_request_items(
      id,
      request_id,
      medicine_id,
      quantity,
      medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure)
    )
`;

const isMissingReceiptColumns = (error) => {
  return (
    error?.code === "PGRST204" ||
    (error?.message || "").toLowerCase().includes("received_by") ||
    (error?.message || "").toLowerCase().includes("received_at")
  );
};

const isMissingSourceColumns = (error) => {
  const message = (error?.message || "").toLowerCase();

  return (
    message.includes("request_source") ||
      message.includes("manual_requested_by") ||
      message.includes("encoded_by")
  );
};

const fetchRequestsQuery = async ({ facilityId, withReceiptFields, withSourceFields }) => {
  let query = supabase
    .from("medicine_requests")
    .select(buildRequestSelect(withReceiptFields, withSourceFields));

  if (facilityId) {
    query = query.eq("facility_id", facilityId);
  }

  const { data, error } = await query.order("request_date", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

const fetchRequestsWithFallback = async ({ facilityId }) => {
  const attempts = [
    { withReceiptFields: true, withSourceFields: true },
    { withReceiptFields: true, withSourceFields: false },
    { withReceiptFields: false, withSourceFields: true },
    { withReceiptFields: false, withSourceFields: false },
  ];

  for (const attempt of attempts) {
    try {
      return await fetchRequestsQuery({ facilityId, ...attempt });
    } catch (error) {
      const isRetryable =
        (attempt.withReceiptFields && isMissingReceiptColumns(error)) ||
        (attempt.withSourceFields && isMissingSourceColumns(error));

      if (!isRetryable || attempt === attempts.at(-1)) {
        throw error;
      }
    }
  }
};

const fetchRequestById = async (requestId) => {
  const requests = await fetchRequestsWithFallback({ facilityId: null });
  return requests.find((request) => request.id === requestId) || null;
};

export const getRequestsData = async () => {
  if (!isCurrentNetworkOnline()) {
    const cachedRequests = getSnapshot(STORAGE_KEYS.REQUESTS, []);
    const cachedFacilities = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    const cachedInventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
    const cachedForecasts = getSnapshot(STORAGE_KEYS.FORECASTING, []);
    const cachedMedicines = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    return {
      facilities: cachedFacilities,
      forecastRows: cachedForecasts,
      inventoryRows: cachedInventory,
      medicines: cachedMedicines,
      requests: cachedRequests,
    };
  }

  try {
    const [
      requestsResult,
      facilitiesResult,
      inventoryResult,
      forecastResult,
      medicinesResult,
      fulfillmentsResult,
    ] = await Promise.all([
      fetchRequestsWithFallback({ facilityId: null }),
      supabase
        .from("facilities")
        .select("id, facility_name, facility_code, facility_type")
        .eq("status", "ACTIVE")
        .order("facility_name", { ascending: true }),
      supabase
        .from("inventory")
        .select("id, facility_id, medicine_id, quantity, threshold, batch_number, expiration_date"),
      supabase
        .from("forecasting")
        .select("id, facility_id, medicine_id, forecast_month, predicted_quantity")
        .order("forecast_month", { ascending: false }),
      supabase
        .from("medicines")
        .select("id, generic_name, brand_name, dosage, unit_of_measure")
        .order("generic_name", { ascending: true }),
      supabase
        .from("medicine_request_fulfillments")
        .select("id, request_id, request_item_id, source_inventory_id, quantity, fulfilled_by, fulfilled_at"),
    ]);

    const firstError =
      facilitiesResult.error ||
      inventoryResult.error ||
      forecastResult.error ||
      medicinesResult.error ||
      fulfillmentsResult.error;

    if (firstError) {
      throw firstError;
    }

    const inventoryById = new Map((inventoryResult.data || []).map((row) => [row.id, row]));
    const fulfillmentsByRequest = (fulfillmentsResult.data || []).reduce((requestMap, row) => {
      const sourceInventory = inventoryById.get(row.source_inventory_id) || {};
      const requestFulfillments = requestMap.get(row.request_id) || [];

      requestFulfillments.push({
        ...row,
        batch_number: sourceInventory.batch_number,
        expiration_date: sourceInventory.expiration_date,
      });
      requestMap.set(row.request_id, requestFulfillments);

      return requestMap;
    }, new Map());

    const requests = requestsResult.map((request) => ({
      ...request,
      fulfillments: fulfillmentsByRequest.get(request.id) || [],
    }));

    saveSnapshot(STORAGE_KEYS.REQUESTS, requests);

    return {
      facilities: facilitiesResult.data || [],
      forecastRows: forecastResult.data || [],
      inventoryRows: inventoryResult.data || [],
      medicines: medicinesResult.data || [],
      requests,
    };
  } catch (err) {
    console.warn("getRequestsData fetch failed, using snapshots:", err);
    return {
      facilities: getSnapshot(STORAGE_KEYS.FACILITIES, []),
      forecastRows: getSnapshot(STORAGE_KEYS.FORECASTING, []),
      inventoryRows: getSnapshot(STORAGE_KEYS.INVENTORY, []),
      medicines: getSnapshot(STORAGE_KEYS.MEDICINES, []),
      requests: getSnapshot(STORAGE_KEYS.REQUESTS, []),
    };
  }
};

export const reviewMedicineRequest = async ({
  allocations = [],
  remarks,
  requestId,
  status,
}) => {
  let targetRequest;

  if (status === "APPROVED") {
    const { data, error } = await supabase.rpc("approve_and_release_medicine_request", {
      p_allocations: allocations,
      p_remarks: remarks || null,
      p_request_id: requestId,
    });

    if (error) {
      throw error;
    }

    targetRequest = await fetchRequestById(data || requestId);

    if (!targetRequest) {
      targetRequest = {
        id: data || requestId,
        status: "COMPLETED",
      };
    }
  } else {
    if (status !== "REJECTED") {
      throw new Error("Unsupported request review status.");
    }

    const { data, error } = await supabase.rpc("reject_medicine_request", {
      p_request_id: requestId,
      p_remarks: remarks || null,
    });

    if (error) {
      throw error;
    }

    targetRequest = await fetchRequestById(data || requestId);
  }

  return targetRequest;
};

export const getRequestReleaseBatches = async (requestId) => {
  const { data, error } = await supabase.rpc("get_request_release_batches", {
    p_request_id: requestId,
  });

  if (error) {
    throw error;
  }

  return (data || []).map((batch) => ({
    ...batch,
    id: batch.source_inventory_id,
  }));
};

export const getBhwRequestsData = async ({ facilityId }) => {
  if (!isCurrentNetworkOnline()) {
    return {
      inventoryRows: getSnapshot(STORAGE_KEYS.INVENTORY, []).filter((row) => row.facility_id === facilityId),
      medicines: getCachedChoMedicines(),
      requests: getSnapshot(STORAGE_KEYS.REQUESTS, []).filter((request) => request.facility_id === facilityId),
    };
  }

  const [requestsResult, medicinesResult, inventoryResult] = await Promise.all([
    fetchRequestsWithFallback({ facilityId }),
    supabase.rpc("get_cho_inventory_medicines"),
    supabase
      .from("inventory")
      .select("id, facility_id, medicine_id, quantity, threshold")
      .eq("facility_id", facilityId),
  ]);

  const firstError = medicinesResult.error || inventoryResult.error;

  if (firstError) {
    throw firstError;
  }

  return {
    inventoryRows: inventoryResult.data || [],
    medicines: medicinesResult.data || [],
    requests: requestsResult,
  };
};

export const getChoInventoryMedicines = async () => {
  if (!isCurrentNetworkOnline()) return getCachedChoMedicines();

  const { data, error } = await supabase.rpc("get_cho_inventory_medicines");

  if (error) {
    throw error;
  }

  return data || [];
};

export const createBhwMedicineRequest = async ({
  items,
  remarks,
}) => {
  const requestItems = items.map((item) => ({
    medicine_id: item.medicine_id,
    quantity: Number(item.quantity),
  }));

  return callQueueableRequestRpc("submit_bhw_medicine_request_idempotent", {
    p_items: requestItems,
    p_remarks: remarks || null,
  });
};

export const createManualMedicineRequest = async ({
  facilityId,
  items,
  manualRequestedBy,
  remarks,
}) => {
  const requestItems = items.map((item) => ({
    medicine_id: item.medicine_id,
    quantity: Number(item.quantity),
  }));

  return callQueueableRequestRpc("create_manual_medicine_request_idempotent", {
    p_facility_id: facilityId,
    p_items: requestItems,
    p_manual_requested_by: manualRequestedBy || null,
    p_remarks: remarks || null,
  }, facilityId).catch((error) => {
    if ((error.message || "").includes("create_manual_medicine_request")) {
      throw new Error("Manual request database update is not applied yet. Apply the latest Supabase migration, then try again.");
    }
    throw error;
  });
};

export const confirmRequestReceived = async ({ requestId }) => {
  const { data, error } = await supabase.rpc("confirm_request_received", {
    request_id: requestId,
  });

  if (error) {
    throw error;
  }

  return data;
};
