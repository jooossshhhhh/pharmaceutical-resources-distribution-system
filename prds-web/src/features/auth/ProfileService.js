import { supabase } from "../../services/supabase";
import { getInternalPhoneEmail } from "./AuthService";

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

export const createPhoneProfile = async ({
  firstName,
  lastName,
  phoneNumber,
  userId,
}) => {
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: userId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: getInternalPhoneEmail(phoneNumber),
      phone_number: phoneNumber,
      role: "BHW",
      status: "PENDING",
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const createSupabaseProfile = async (supabaseUser) => {
  const metadata = supabaseUser.user_metadata || {};
  const fullName = metadata.full_name || metadata.name || "";
  const [firstName = "Google", ...lastNameParts] = fullName.trim().split(" ");
  const lastName = lastNameParts.join(" ") || "User";
  const email = supabaseUser.email;

  if (!email) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: supabaseUser.id,
      first_name: firstName,
      last_name: lastName,
      email,
      role: "BHW",
      status: "PENDING",
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const getOrCreateSupabaseProfile = async (supabaseUser) => {
  const existingProfile = await getProfileById(supabaseUser?.id);

  if (existingProfile) {
    return existingProfile;
  }

  return createSupabaseProfile(supabaseUser);
};
