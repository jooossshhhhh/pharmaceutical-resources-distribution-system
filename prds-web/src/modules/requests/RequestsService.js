import { supabase } from "../../services/supabase";
import { getRequestNumber } from "./requestUtils";

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

  return {
    facilities: facilitiesResult.data || [],
    forecastRows: forecastResult.data || [],
    inventoryRows: inventoryResult.data || [],
    medicines: medicinesResult.data || [],
    requests: requestsResult.map((request) => ({
      ...request,
      fulfillments: fulfillmentsByRequest.get(request.id) || [],
    })),
  };
};

export const reviewMedicineRequest = async ({
  allocations = [],
  profileId,
  remarks,
  requestId,
  status,
}) => {
  let targetRequest = null;

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
    const payload = {
      approved_at: new Date().toISOString(),
      approved_by: profileId,
      remarks: remarks || null,
      status,
    };

    const { data, error } = await supabase
      .from("medicine_requests")
      .update(payload)
      .eq("id", requestId)
      .select(
        `
        id,
        requested_by,
        facility_id,
        request_date,
        status,
        approved_by,
        approved_at,
        received_by,
        received_at,
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
        receiver:profiles!medicine_requests_received_by_fkey(
          id,
          first_name,
          last_name
        ),
        items:medicine_request_items(
          id,
          request_id,
          medicine_id,
          quantity,
          medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure)
        )
      `
      )
      .single();

    if (error) {
      throw error;
    }

    targetRequest = data;
  }

  const isApproved = status === "APPROVED";
  const action = isApproved ? "Request Released" : "Request Rejected";
  const reqNumber = getRequestNumber(targetRequest.id);
  const facilityName = targetRequest.facility?.facility_name || "facility";
  const details = isApproved
    ? `Released and completed medicine request ${reqNumber} for ${facilityName}.`
    : `Request Rejected for ${facilityName} (${reqNumber})`;

  try {
    const { error: logError } = await supabase.from("activity_logs").insert({
      action,
      details,
      module: "Medicine Request",
      user_id: profileId,
    });

    if (logError) {
      console.warn("Failed to insert activity log for medicine request:", logError.message);
    }
  } catch (logErr) {
    console.warn("Error logging medicine request review activity:", logErr);
  }

  try {
    const notificationTitle = isApproved ? "Request Released" : "Request Rejected";
    const notificationMessage = isApproved
      ? `Your medicine request ${targetRequest.id.slice(0, 8).toUpperCase()} has been released by CHO.`
      : `Your medicine request ${targetRequest.id.slice(0, 8).toUpperCase()} has been rejected by CHO.`;

    if (targetRequest.requested_by) {
      const { error: notificationError } = await supabase.from("notifications").insert({
        message: notificationMessage,
        title: notificationTitle,
        user_id: targetRequest.requested_by,
      });

      if (notificationError) {
        console.warn("Failed to insert notification for medicine request review:", notificationError.message);
      }
    }
  } catch (notifErr) {
    console.warn("Error creating notification for medicine request review:", notifErr);
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

  const { data, error } = await supabase.rpc("submit_bhw_medicine_request", {
    p_items: requestItems,
    p_remarks: remarks || null,
  });

  if (error) {
    throw error;
  }

  return data;
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

  const { data, error } = await supabase.rpc("create_manual_medicine_request", {
    p_facility_id: facilityId,
    p_items: requestItems,
    p_manual_requested_by: manualRequestedBy || null,
    p_remarks: remarks || null,
  });

  if (error) {
    if ((error.message || "").includes("create_manual_medicine_request")) {
      throw new Error("Manual request database update is not applied yet. Apply the latest Supabase migration, then try again.");
    }

    throw error;
  }

  return data;
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
