import { supabase } from "../client/supabase";
import { getSnapshot, saveSnapshot, STORAGE_KEYS } from "../database/snapshotStore";
import { isCurrentNetworkOnline } from "../sync/networkStatus";
import { enqueueMutation } from "../sync/outboxQueue";

export const getUserManagementData = async () => {
  // If offline, return immediately from local snapshot store
  if (!isCurrentNetworkOnline()) {
    const cachedUsers = getSnapshot(STORAGE_KEYS.USERS, []);
    const cachedFacilities = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    return {
      facilities: cachedFacilities,
      users: cachedUsers,
    };
  }

  try {
    const [profilesResult, facilitiesResult] = await Promise.all([
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
    ]);

    const firstError = profilesResult.error || facilitiesResult.error;

    if (firstError) {
      throw firstError;
    }

    const users = profilesResult.data || [];
    const facilities = facilitiesResult.data || [];

    // Save snapshot locally for seamless offline retrieval
    saveSnapshot(STORAGE_KEYS.USERS, users);
    saveSnapshot(STORAGE_KEYS.FACILITIES, facilities);

    return {
      facilities,
      users,
    };
  } catch (err) {
    console.warn("getUserManagementData online fetch failed, using local snapshot:", err);
    const cachedUsers = getSnapshot(STORAGE_KEYS.USERS, []);
    const cachedFacilities = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    return {
      facilities: cachedFacilities,
      users: cachedUsers,
    };
  }
};

export const updateManagedUser = async ({ adminId, payload, user }) => {
  const isOnline = isCurrentNetworkOnline();

  // Optimistically update local snapshot store immediately
  try {
    const cachedUsers = getSnapshot(STORAGE_KEYS.USERS, []);
    const updatedUsers = cachedUsers.map((u) => {
      if (u.id === user.id) {
        return {
          ...u,
          ...payload,
          updated_at: new Date().toISOString(),
        };
      }
      return u;
    });
    saveSnapshot(STORAGE_KEYS.USERS, updatedUsers);
  } catch (optErr) {
    console.warn("Optimistic local user snapshot update failed:", optErr);
  }

  if (isOnline) {
    try {
      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id);

      if (error) {
        throw error;
      }

      if (payload.status === "ACTIVE" && user.status !== "ACTIVE") {
        await supabase.from("notifications").insert({
          message: "Your PRDS account has been approved. You can now sign in.",
          title: "Account Approved",
          user_id: user.id,
        });
      }

      if (payload.status === "DEACTIVATED" && user.status !== "DEACTIVATED") {
        await supabase.from("notifications").insert({
          message: "Your PRDS account has been deactivated. Contact an administrator for assistance.",
          title: "Account Deactivated",
          user_id: user.id,
        });
      }

      return adminId;
    } catch (onlineErr) {
      console.warn("Online user update failed, queuing for offline background push:", onlineErr);
    }
  }

  // Offline or network fallback: enqueue mutations to outbox queue
  await enqueueMutation({
    userId: adminId,
    mutationType: "UPDATE",
    target: "profiles",
    payload: { id: user.id, values: payload },
  });

  if (payload.status === "ACTIVE" && user.status !== "ACTIVE") {
    await enqueueMutation({
      userId: adminId,
      mutationType: "INSERT",
      target: "notifications",
      payload: {
        message: "Your PRDS account has been approved. You can now sign in.",
        title: "Account Approved",
        user_id: user.id,
      },
    });
  }

  if (payload.status === "DEACTIVATED" && user.status !== "DEACTIVATED") {
    await enqueueMutation({
      userId: adminId,
      mutationType: "INSERT",
      target: "notifications",
      payload: {
        message: "Your PRDS account has been deactivated. Contact an administrator for assistance.",
        title: "Account Deactivated",
        user_id: user.id,
      },
    });
  }

  return { adminId, isOfflineQueued: true };
};
