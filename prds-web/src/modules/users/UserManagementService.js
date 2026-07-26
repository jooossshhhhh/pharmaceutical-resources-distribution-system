import { supabase } from "../../services/supabase";
import { USER_ACCOUNT_LOG_MODULE } from "./userManagementUtils";

export const getUserManagementData = async () => {
  const [profilesResult, facilitiesResult, requestsResult, logsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          `
          id,
          first_name,
          last_name,
          email,
          phone_number,
          role,
          facility_id,
          status,
          approved_by,
          approved_at,
          created_at,
          updated_at,
          facility:facilities(id, facility_name, facility_code)
        `
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("facilities")
        .select("id, facility_name, facility_code")
        .eq("status", "ACTIVE")
        .order("facility_name", { ascending: true }),
      supabase
        .from("profile_facility_change_requests")
        .select(
          `
          id,
          profile_id,
          current_facility_id,
          requested_facility_id,
          reason,
          status,
          reviewed_by,
          reviewed_at,
          created_at,
          updated_at,
          profile:profiles!profile_facility_change_requests_profile_id_fkey(
            id,
            first_name,
            last_name,
            email,
            phone_number,
            role
          ),
          current_facility:facilities!profile_facility_change_requests_current_facility_id_fkey(
            id,
            facility_name,
            facility_code
          ),
          requested_facility:facilities!profile_facility_change_requests_requested_facility_id_fkey(
            id,
            facility_name,
            facility_code
          ),
          reviewer:profiles!profile_facility_change_requests_reviewed_by_fkey(
            id,
            first_name,
            last_name
          )
        `
        )
        .order("created_at", { ascending: false }),
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
            role
          )
        `
        )
        .eq("module", USER_ACCOUNT_LOG_MODULE)
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

  const firstError =
    profilesResult.error ||
    facilitiesResult.error ||
    requestsResult.error ||
    logsResult.error;

  if (firstError) {
    throw firstError;
  }

  return {
    facilities: facilitiesResult.data || [],
    facilityRequests: requestsResult.data || [],
    logs: logsResult.data || [],
    users: profilesResult.data || [],
  };
};

export const updateManagedUser = async ({ adminId, payload, user }) => {
  const { error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", user.id);

  if (error) {
    throw error;
  }

  const logDetails = [
    `Admin updated ${user.first_name || "user"} ${user.last_name || ""}`.trim(),
    payload.role ? `role=${payload.role}` : "",
    payload.status ? `status=${payload.status}` : "",
    payload.facility_id ? `facility_id=${payload.facility_id}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  const { error: logError } = await supabase.from("activity_logs").insert({
    action: "User Account Managed",
    details: logDetails,
    module: USER_ACCOUNT_LOG_MODULE,
    user_id: user.id,
  });

  if (logError) {
    throw logError;
  }

  if (payload.status === "ACTIVE" && user.status !== "ACTIVE") {
    const { error: notificationError } = await supabase.from("notifications").insert({
      message: "Your PRDS account has been approved. You can now sign in.",
      title: "Account Approved",
      user_id: user.id,
    });

    if (notificationError) {
      throw notificationError;
    }
  }

  if (payload.status === "DEACTIVATED" && user.status !== "DEACTIVATED") {
    const { error: notificationError } = await supabase.from("notifications").insert({
      message: "Your PRDS account has been deactivated. Contact an administrator for assistance.",
      title: "Account Deactivated",
      user_id: user.id,
    });

    if (notificationError) {
      throw notificationError;
    }
  }

  return adminId;
};

export const reviewFacilityChangeRequest = async ({ requestId, status }) => {
  const { error } = await supabase.rpc(
    "review_profile_facility_change_request",
    {
      p_request_id: requestId,
      p_status: status,
    }
  );

  if (error) {
    throw error;
  }
};
