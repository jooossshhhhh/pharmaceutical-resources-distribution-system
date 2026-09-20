import { supabase } from "../client/supabase";
import { getSnapshot, saveSnapshot, STORAGE_KEYS } from "../database/snapshotStore";
import { isCurrentNetworkOnline } from "../sync/networkStatus";
import { enqueueMutation } from "../sync/outboxQueue";
import { isConnectivityError } from "../client/networkErrorUtils";
import { normalizeNotificationReadArgs } from "@shared/utils/notificationUtils";

export const getNotificationData = async () => {
  if (!isCurrentNetworkOnline()) {
    const cachedNotifications = getSnapshot(STORAGE_KEYS.NOTIFICATIONS, []);
    const cachedFacilities = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    return {
      facilities: cachedFacilities,
      notifications: cachedNotifications,
    };
  }

  try {
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

    const notifications = notificationsResult.data || [];
    const facilities = facilitiesResult.data || [];

    saveSnapshot(STORAGE_KEYS.NOTIFICATIONS, notifications);
    saveSnapshot(STORAGE_KEYS.FACILITIES, facilities);

    return {
      facilities,
      notifications,
    };
  } catch (err) {
    console.warn("getNotificationData online fetch failed, using snapshot:", err);
    const cachedNotifications = getSnapshot(STORAGE_KEYS.NOTIFICATIONS, []);
    const cachedFacilities = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    return {
      facilities: cachedFacilities,
      notifications: cachedNotifications,
      error: err,
    };
  }
};

export const updateOwnNotificationReadStatus = async (...args) => {
  const { isRead, notificationId, profileId } = normalizeNotificationReadArgs(args);
  // Optimistically update snapshot
  try {
    const cached = getSnapshot(STORAGE_KEYS.NOTIFICATIONS, []);
    const updated = cached.map((n) =>
      n.id === notificationId ? { ...n, is_read: isRead } : n
    );
    saveSnapshot(STORAGE_KEYS.NOTIFICATIONS, updated);
  } catch (optErr) {
    console.warn("Optimistic notification read update failed:", optErr);
  }

  if (isCurrentNetworkOnline()) {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: isRead })
        .eq("id", notificationId)
        .eq("user_id", profileId);

      if (!error) {
        return;
      }
      if (!isConnectivityError(error)) {
        throw error;
      }
    } catch (onlineErr) {
      console.warn("Online notification update failed, queuing for offline sync:", onlineErr);
      if (!isConnectivityError(onlineErr)) {
        throw onlineErr;
      }
    }
  }

  // Queue for offline sync
  await enqueueMutation({
    userId: profileId,
    mutationType: "UPDATE",
    target: "notifications",
    payload: {
      id: notificationId,
      values: { is_read: isRead },
    },
  });
};
