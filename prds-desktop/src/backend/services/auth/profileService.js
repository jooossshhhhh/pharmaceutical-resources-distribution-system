import { supabase } from "../../client/supabase";
import { getCachedUserSession, saveUserSession } from "../../database/snapshotStore";
import { isCurrentNetworkOnline } from "../../sync/networkStatus";
import { isProfileRegistrationComplete } from "@shared/utils/authRegistrationUtils";

export { isProfileRegistrationComplete };

let isAvatarUpdatedAtSupported = false;

const PROFILE_COLUMNS =
  `
    id,
    first_name,
    last_name,
    email,
    phone_number,
    avatar_url,
    role,
    facility_id,
    status,
    created_at,
    facility:facilities(
      id,
      facility_name,
      facility_code,
      facility_type,
      address,
      status
    )
  `;

const AVATAR_BUCKET = "avatars";

const normalizeProfile = (profile) => {
  if (!profile) {
    return null;
  }

  return {
    ...profile,
    has_passcode: Boolean(profile.has_passcode),
    facility_name: profile.facility?.facility_name || "",
    facility_code: profile.facility?.facility_code || "",
    facility_type: profile.facility?.facility_type || "",
    facility_address: profile.facility?.address || "",
    facility_status: profile.facility?.status || "",
  };
};

const fetchProfileById = async (profileId) => {
  if (!profileId) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const normalized = normalizeProfile(data);
  if (normalized) {
    // Optionally fetch avatar_updated_at if available without failing
    if (isAvatarUpdatedAtSupported !== false) {
      try {
        const { data: avatarMeta, error: avatarErr } = await supabase
          .from("profiles")
          .select("avatar_updated_at")
          .eq("id", profileId)
          .maybeSingle();
        if (avatarErr) {
          if (
            avatarErr.code === "42703" ||
            String(avatarErr.message || "").toLowerCase().includes("does not exist")
          ) {
            isAvatarUpdatedAtSupported = false;
          }
        } else {
          isAvatarUpdatedAtSupported = true;
          if (avatarMeta?.avatar_updated_at) {
            normalized.avatar_updated_at = avatarMeta.avatar_updated_at;
          }
        }
      } catch {
        isAvatarUpdatedAtSupported = false;
      }
    }

    // Preserve has_passcode from cached session or user_metadata if present
    const cached = getCachedUserSession();
    if (cached?.profile?.id === profileId && typeof cached.profile.has_passcode === "boolean") {
      normalized.has_passcode = cached.profile.has_passcode;
    }
    if (cached?.user?.user_metadata?.has_passcode !== undefined) {
      normalized.has_passcode = Boolean(cached.user.user_metadata.has_passcode);
    }
    saveUserSession(null, normalized);
  }
  return normalized;
};

export const getProfileByIdForRegistration = async (profileId, email) => {
  const profile = await fetchProfileById(profileId);
  if (profile) {
    return profile;
  }

  if (email) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("email", email)
        .maybeSingle();

      if (!error && data) {
        return normalizeProfile(data);
      }
    } catch {
      // ignore
    }
  }

  return null;
};

export const getProfileById = async (profileId) => {
  if (!profileId) {
    return null;
  }

  const cached = getCachedUserSession();
  if (cached.profile?.id === profileId && !isCurrentNetworkOnline()) {
    return cached.profile;
  }

  try {
    return await fetchProfileById(profileId);
  } catch (err) {
    console.warn("getProfileById network failure, falling back to cached profile:", err);
    return cached.profile?.id === profileId ? cached.profile : null;
  }
};

export const createPhoneProfile = async ({
  email = null,
  facilityId,
  firstName,
  lastName,
  phoneNumber,
  role,
  userId,
}) => {
  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email ? email.trim().toLowerCase() : null,
      phone_number: phoneNumber,
      role,
      facility_id: facilityId,
      status: "PENDING",
    }, { onConflict: "id" })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return normalizeProfile(data);
};

export const createGoogleProfile = async ({
  email,
  facilityId,
  firstName,
  lastName,
  phoneNumber = null,
  role,
  userId,
}) => {
  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email,
      phone_number: phoneNumber ? phoneNumber.trim() : null,
      role,
      facility_id: facilityId,
      status: "PENDING",
    }, { onConflict: "id" })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return normalizeProfile(data);
};

export const updateOwnProfileContact = async ({
  email,
  firstName,
  lastName,
  phoneNumber,
}) => {
  const { error } = await supabase.rpc("update_own_profile_contact", {
    p_email: email || null,
    p_first_name: firstName,
    p_last_name: lastName,
    p_phone_number: phoneNumber || null,
  });

  if (error) {
    const errorMsg = String(error.message || "").toLowerCase();
    if (
      errorMsg.includes("phone updates require verified") ||
      errorMsg.includes("supabase auth phone login")
    ) {
      const cleanPhone = phoneNumber ? phoneNumber.trim() : null;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        const { error: directErr } = await supabase
          .from("profiles")
          .update({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone_number: cleanPhone,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (!directErr) {
          return;
        }
      }
    }
    throw error;
  }
};

export const createFacilityChangeRequest = async ({
  currentFacilityId,
  profileId,
  reason,
  requestedFacilityId,
}) => {
  const { data, error } = await supabase
    .from("profile_facility_change_requests")
    .insert({
      profile_id: profileId,
      current_facility_id: currentFacilityId || null,
      requested_facility_id: requestedFacilityId,
      reason: reason?.trim() || null,
      status: "PENDING",
    })
    .select(
      `
        id,
        profile_id,
        current_facility_id,
        requested_facility_id,
        reason,
        status,
        created_at,
        requested_facility:facilities!profile_facility_change_requests_requested_facility_id_fkey(
          facility_name,
          facility_code
        )
      `
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const getOwnPendingFacilityChangeRequest = async (profileId) => {
  if (!profileId) {
    return null;
  }

  const { data, error } = await supabase
    .from("profile_facility_change_requests")
    .select(
      `
        id,
        profile_id,
        current_facility_id,
        requested_facility_id,
        reason,
        status,
        created_at,
        requested_facility:facilities!profile_facility_change_requests_requested_facility_id_fkey(
          facility_name,
          facility_code
        )
      `
    )
    .eq("profile_id", profileId)
    .eq("status", "PENDING")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const getSupabaseProfile = async (supabaseUser) => {
  const existingProfile = await getProfileById(supabaseUser?.id);

  if (existingProfile) {
    if (supabaseUser?.user_metadata?.has_passcode !== undefined) {
      existingProfile.has_passcode = Boolean(supabaseUser.user_metadata.has_passcode);
    }

    if (
      supabaseUser?.email &&
      existingProfile.email !== supabaseUser.email
    ) {
      try {
        await updateOwnProfileContact({
          email: supabaseUser.email,
          firstName: existingProfile.first_name,
          lastName: existingProfile.last_name,
          phoneNumber: existingProfile.phone_number,
        });

        const refreshed = await getProfileById(supabaseUser.id);
        if (refreshed) {
          if (supabaseUser?.user_metadata?.has_passcode !== undefined) {
            refreshed.has_passcode = Boolean(supabaseUser.user_metadata.has_passcode);
          }
          return refreshed;
        }
      } catch {
        return existingProfile;
      }
    }

    return existingProfile;
  }

  return null;
};

export const getProfileAvatarUrl = async (profileId) => {
  if (!profileId) {
    return "";
  }

  const cached = getCachedUserSession();
  const cachedAvatar = cached?.profile?.id === profileId ? cached.profile?.avatar_url || "" : "";

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", profileId)
      .maybeSingle();

    return error ? cachedAvatar : (data?.avatar_url || cachedAvatar);
  } catch {
    return cachedAvatar;
  }
};

export const updateOwnProfileAvatar = async (avatarUrl) => {
  const { error } = await supabase.rpc("update_own_profile_avatar", {
    p_avatar_url: avatarUrl || null,
  });

  if (error) {
    throw error;
  }
};

export const uploadProfileAvatar = async ({ file, userId }) => {
  const path = `${userId}/avatar.webp`;
  const contentType = file.type || "image/webp";

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      contentType,
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  return `${data?.publicUrl || ""}?t=${Date.now()}`;
};

export const removeProfileAvatar = async ({ userId }) => {
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).list(userId, {
    limit: 100,
  });

  if (error || !data?.length) {
    return;
  }

  await supabase.storage
    .from(AVATAR_BUCKET)
    .remove(data.map((item) => `${userId}/${item.name}`));
};

export const requestGmailUpdate = async ({ newEmail }) => {
  if (!isCurrentNetworkOnline()) {
    throw new Error("Cannot update Gmail while offline. Please connect to the internet.");
  }

  const cleanEmail = String(newEmail || "").trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Please enter a valid Gmail address.");
  }

  const { data, error } = await supabase.auth.updateUser(
    { email: cleanEmail },
    { emailRedirectTo: `${window.location.origin}/profile-settings` }
  );

  if (error) {
    throw error;
  }

  return { success: true, user: data?.user };
};

export const verifyAndApplyGmailUpdate = async ({
  newEmail,
  token,
  oldEmail,
  profile,
}) => {
  if (!isCurrentNetworkOnline()) {
    throw new Error("Cannot verify email update while offline. Please connect to the internet.");
  }

  const cleanEmail = String(newEmail || "").trim().toLowerCase();
  const cleanToken = String(token || "").trim();

  if (!cleanToken) {
    throw new Error("Please enter the verification code sent to your email.");
  }

  // 1. Verify OTP with Supabase Auth
  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    email: cleanEmail,
    token: cleanToken,
    type: "email_change",
  });

  if (verifyError) {
    throw verifyError;
  }

  // 2. Notify CHO (if BHW) and record audit log via RPC
  try {
    await supabase.rpc("notify_cho_of_bhw_email_update", {
      p_old_email: oldEmail || null,
      p_new_email: cleanEmail,
    });
  } catch (rpcErr) {
    console.warn("RPC notify_cho_of_bhw_email_update fallback:", rpcErr?.message || rpcErr);

    // Resilient fallback: direct update to profiles table
    if (profile?.id) {
      await supabase
        .from("profiles")
        .update({
          email: cleanEmail,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);

      // Best effort activity log
      try {
        await supabase.from("activity_logs").insert({
          user_id: profile.id,
          action: "User Account Email Updated",
          module: "Authentication",
          details: `${profile.first_name || ""} ${profile.last_name || ""} updated account email from ${oldEmail || "none"} to ${cleanEmail}.`,
        });
      } catch (logErr) {
        console.warn("Activity log fallback skipped:", logErr);
      }
    }
  }

  // 3. Update local session cache
  const cached = getCachedUserSession();
  const activeUser = verifyData?.user || cached?.user || {};
  const currentProfile = cached?.profile || profile || {};
  const updatedProfile = {
    ...currentProfile,
    email: cleanEmail,
  };
  saveUserSession(activeUser, updatedProfile);

  return {
    success: true,
    newEmail: cleanEmail,
    profile: updatedProfile,
    user: activeUser,
  };
};
