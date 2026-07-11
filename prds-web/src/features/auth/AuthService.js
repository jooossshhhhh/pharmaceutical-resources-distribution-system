import { supabaseAuth } from "../../services/supabase";

export const normalizePhoneNumber = (phoneNumber) => {
  const digitsOnly = phoneNumber.replace(/\D/g, "");

  if (digitsOnly.startsWith("63")) {
    return `0${digitsOnly.slice(2)}`;
  }

  if (digitsOnly.startsWith("0")) {
    return digitsOnly;
  }

  return `0${digitsOnly}`;
};

export const isPhilippineMobileNumber = (phoneNumber) => {
  return /^09\d{9}$/.test(phoneNumber.replace(/\D/g, ""));
};

export const toPhilippineE164PhoneNumber = (phoneNumber) => {
  return `+63${normalizePhoneNumber(phoneNumber).slice(1)}`;
};

const phoneToEmail = (phoneNumber) => {
  return `${normalizePhoneNumber(phoneNumber)}@prds.local`;
};

export const getInternalPhoneEmail = (phoneNumber) => {
  return phoneToEmail(phoneNumber);
};

export const sendPhoneOtp = async (
  phoneNumber,
  { shouldCreateUser = true } = {}
) => {
  const { data, error } = await supabaseAuth.auth.signInWithOtp({
    phone: toPhilippineE164PhoneNumber(phoneNumber),
    options: {
      shouldCreateUser,
    },
  });

  if (error) {
    throw error;
  }

  return data;
};

export const signUpWithPhonePassword = async ({
  phoneNumber,
  password,
}) => {
  const { data, error } = await supabaseAuth.auth.signUp({
    phone: toPhilippineE164PhoneNumber(phoneNumber),
    password,
  });

  if (error) {
    throw error;
  }

  return data;
};

export const signInWithPhonePassword = async ({
  phoneNumber,
  password,
}) => {
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    phone: toPhilippineE164PhoneNumber(phoneNumber),
    password,
  });

  if (error) {
    throw error;
  }

  return data;
};

export const verifyPhoneOtp = async ({
  phoneNumber,
  verificationCode,
}) => {
  const { data, error } = await supabaseAuth.auth.verifyOtp({
    phone: toPhilippineE164PhoneNumber(phoneNumber),
    token: verificationCode,
    type: "sms",
  });

  if (error) {
    throw error;
  }

  return data;
};

export const getAuthErrorMessage = (error) => {
  return error?.message || "Authentication failed. Please try again.";
};

export const signInWithGoogle = async () => {
  const { data, error } = await supabaseAuth.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
    },
  });

  if (error) {
    throw error;
  }

  return data;
};

// LOGOUT
export const logoutUser = async () => {
  await supabaseAuth.auth.signOut();
};
