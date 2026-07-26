import { supabase } from "../../services/supabase";

export const getNotificationData = async () => {
  const [notificationsResult, facilitiesResult] = await Promise.all([
    supabase.rpc("get_visible_notifications"),
    supabase
      .from("facilities")
      .select("id, facility_name, facility_code")
      .eq("status", "ACTIVE")
      .order("facility_name", { ascending: true }),
  ]);

  const firstError = notificationsResult.error || facilitiesResult.error;

  if (firstError) {
    throw firstError;
  }

  return {
    facilities: facilitiesResult.data || [],
    notifications: notificationsResult.data || [],
  };
};

export const markOwnNotificationsRead = async ({ profileId }) => {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", profileId)
    .eq("is_read", false);

  if (error) {
    throw error;
  }
};
