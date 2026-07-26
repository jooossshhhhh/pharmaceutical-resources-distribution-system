import { supabase } from "../../services/supabase";

const PROFILE_COLUMNS =
  `
    id,
    first_name,
    last_name,
    email,
    phone_number,
    role,
    facility_id,
    status,
    facility:facilities(
      id,
      facility_name,
      facility_code,
      facility_type,
      address,
      status
    )
  `;

const normalizeProfile = (profile) => {
  if (!profile) {
    return null;
  }

  return {
    ...profile,
    facility_name: profile.facility?.facility_name || "",
    facility_code: profile.facility?.facility_code || "",
    facility_type: profile.facility?.facility_type || "",
    facility_address: profile.facility?.address || "",
    facility_status: profile.facility?.status || "",
  };
};

export const getProfileById = async (profileId) => {
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

  return normalizeProfile(data);
};

export const isProfileRegistrationComplete = (profile) => {
  return !!(
    profile?.first_name &&
    profile?.last_name &&
    profile?.role &&
    profile?.facility_id &&
    (profile?.email || profile?.phone_number)
  );
};

export const createPhoneProfile = async ({
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
      email: null,
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
      phone_number: null,
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

        return await getProfileById(supabaseUser.id);
      } catch {
        return existingProfile;
      }
    }

    return existingProfile;
  }

  return null;
};
