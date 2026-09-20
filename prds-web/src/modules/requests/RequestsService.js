import { supabase } from "../../services/supabase";

const buildRequestSelect = (withReceiptFields) => `
    id,
    requested_by,
    facility_id,
    request_date,
    status,
    approved_by,
    approved_at,
    ${withReceiptFields ? "received_by," : ""}
    ${withReceiptFields ? "received_at," : ""}
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

const fetchRequestsQuery = async ({ facilityId, withReceiptFields }) => {
  let query = supabase
    .from("medicine_requests")
    .select(buildRequestSelect(withReceiptFields));

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
  try {
    return await fetchRequestsQuery({ facilityId, withReceiptFields: true });
  } catch (error) {
    if (!isMissingReceiptColumns(error)) {
      throw error;
    }
  }

  return fetchRequestsQuery({ facilityId, withReceiptFields: false });
};

const fetchRequestById = async (requestId) => {
  const requests = await fetchRequestsWithFallback({ facilityId: null });
  return requests.find((request) => request.id === requestId) || null;
};

export const getRequestsData = async () => {
  const [requestsResult, facilitiesResult, inventoryResult] = await Promise.all([
    fetchRequestsWithFallback({ facilityId: null }),
    supabase
      .from("facilities")
      .select("id, facility_name, facility_code, facility_type")
      .eq("status", "ACTIVE")
      .order("facility_name", { ascending: true }),
    supabase
      .from("inventory")
      .select("id, facility_id, medicine_id, quantity, threshold"),
  ]);

const firstError = facilitiesResult.error || inventoryResult.error;

  if (firstError) {
    throw firstError;
  }

  return {
    facilities: facilitiesResult.data || [],
    inventoryRows: inventoryResult.data || [],
    requests: requestsResult,
  };
};

export const reviewMedicineRequest = async ({
  allocations = [],
  profileId,
  remarks,
  requestId,
  status,
}) => {
  if (status === "APPROVED") {
    const { data, error } = await supabase.rpc("approve_and_release_medicine_request", {
      p_allocations: allocations,
      p_remarks: remarks || null,
      p_request_id: requestId,
    });

    if (error) {
      throw error;
    }

    const updatedRequest = await fetchRequestById(data || requestId);

    if (!updatedRequest) {
      throw new Error("Request was approved, but the updated request could not be loaded.");
    }

    return updatedRequest;
  }

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

  const action = status === "APPROVED" ? "Request Approved" : "Request Rejected";

  const { error: logError } = await supabase.from("activity_logs").insert({
    action,
    details: `${action} for ${data.facility?.facility_name || "facility"} (${data.id})`,
    module: "Medicine Request",
    user_id: profileId,
  });

  if (logError) {
    throw logError;
  }

  const notificationTitle = status === "APPROVED" ? "Request Approved" : "Request Rejected";
  const notificationMessage =
    status === "APPROVED"
      ? `Your medicine request ${data.id.slice(0, 8).toUpperCase()} has been approved by CHO.`
      : `Your medicine request ${data.id.slice(0, 8).toUpperCase()} has been rejected by CHO.`;

  const { error: notificationError } = await supabase.from("notifications").insert({
    message: notificationMessage,
    title: notificationTitle,
    user_id: data.requested_by,
  });

  if (notificationError) {
    throw notificationError;
  }

  return data;
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

export const confirmRequestReceived = async ({ requestId }) => {
  const { data, error } = await supabase.rpc("confirm_request_received", {
    request_id: requestId,
  });

  if (error) {
    throw error;
  }

  return data;
};
