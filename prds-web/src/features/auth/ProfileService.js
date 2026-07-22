import { supabase } from "../../services/supabase";

const PROFILE_COLUMNS =
  "id, first_name, last_name, email, phone_number, role, facility_id, status";

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

  return data;
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

  return data;
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

  return data;
};

export const getSupabaseProfile = async (supabaseUser) => {
  const existingProfile = await getProfileById(supabaseUser?.id);

  if (existingProfile) {
    if (
      supabaseUser?.email &&
      existingProfile.email !== supabaseUser.email
    ) {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          email: supabaseUser.email,
          updated_at: new Date().toISOString(),
        })
        .eq("id", supabaseUser.id)
        .select(PROFILE_COLUMNS)
        .single();

      if (!error) {
        return data;
      }
    }

    return existingProfile;
  }

  return null;
};
