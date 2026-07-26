import { supabase } from "../../services/supabase";

export const getActivityLogData = async () => {
  const [logsResult, facilitiesResult] = await Promise.all([
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
      .limit(150),
    supabase
      .from("facilities")
      .select("id, facility_name, facility_code")
      .eq("status", "ACTIVE")
      .order("facility_name", { ascending: true }),
  ]);

  const firstError = logsResult.error || facilitiesResult.error;

  if (firstError) {
    throw firstError;
  }

  return {
    facilities: facilitiesResult.data || [],
    logs: logsResult.data || [],
  };
};
