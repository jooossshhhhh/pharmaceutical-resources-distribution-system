import { supabase } from "../../services/supabase";

export const getRequestsData = async () => {
  const [requestsResult, facilitiesResult, inventoryResult] = await Promise.all([
    supabase
      .from("medicine_requests")
      .select(
        `
        id,
        requested_by,
        facility_id,
        request_date,
        status,
        approved_by,
        approved_at,
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
        items:medicine_request_items(
          id,
          medicine_id,
          quantity,
          medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure)
        )
      `
      )
      .order("request_date", { ascending: false }),
    supabase
      .from("facilities")
      .select("id, facility_name, facility_code, facility_type")
      .eq("status", "ACTIVE")
      .order("facility_name", { ascending: true }),
    supabase
      .from("inventory")
      .select("id, facility_id, medicine_id, quantity, threshold"),
  ]);

  const firstError =
    requestsResult.error || facilitiesResult.error || inventoryResult.error;

  if (firstError) {
    throw firstError;
  }

  return {
    facilities: facilitiesResult.data || [],
    inventoryRows: inventoryResult.data || [],
    requests: requestsResult.data || [],
  };
};

export const reviewMedicineRequest = async ({
  profileId,
  remarks,
  requestId,
  status,
}) => {
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

export const getBhwRequestsData = async ({ facilityId }) => {
  const [requestsResult, medicinesResult] = await Promise.all([
    supabase
      .from("medicine_requests")
      .select(
        `
        id,
        requested_by,
        facility_id,
        request_date,
        status,
        approved_by,
        approved_at,
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
        items:medicine_request_items(
          id,
          medicine_id,
          quantity,
          medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure)
        )
      `
      )
      .eq("facility_id", facilityId)
      .order("request_date", { ascending: false }),
    supabase
      .from("medicines")
      .select("id, generic_name, brand_name, dosage, unit_of_measure")
      .order("generic_name", { ascending: true }),
  ]);

  const firstError = requestsResult.error || medicinesResult.error;

  if (firstError) {
    throw firstError;
  }

  return {
    medicines: medicinesResult.data || [],
    requests: requestsResult.data || [],
  };
};

export const createBhwMedicineRequest = async ({
  facilityId,
  items,
  profileId,
  remarks,
}) => {
  const { data: request, error: requestError } = await supabase
    .from("medicine_requests")
    .insert({
      facility_id: facilityId,
      remarks: remarks || null,
      requested_by: profileId,
    })
    .select("id")
    .single();

  if (requestError) {
    throw requestError;
  }

  const requestItems = items.map((item) => ({
    medicine_id: item.medicine_id,
    quantity: Number(item.quantity),
    request_id: request.id,
  }));

  const { error: itemsError } = await supabase
    .from("medicine_request_items")
    .insert(requestItems);

  if (itemsError) {
    throw itemsError;
  }

  const { error: logError } = await supabase.from("activity_logs").insert({
    action: "Medicine Request Submitted",
    details: `Submitted medicine request ${request.id}`,
    module: "Medicine Request",
    user_id: profileId,
  });

  if (logError) {
    throw logError;
  }

  return request.id;
};
