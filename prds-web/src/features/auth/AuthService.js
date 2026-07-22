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

export const updateUserPhone = async (phoneNumber) => {
  const { data, error } = await supabaseAuth.auth.updateUser({
    phone: toPhilippineE164PhoneNumber(phoneNumber),
  });

  if (error) {
    throw error;
  }

  return data;
};

export const verifyPhoneChangeOtp = async ({
  phoneNumber,
  verificationCode,
}) => {
  const { data, error } = await supabaseAuth.auth.verifyOtp({
    phone: toPhilippineE164PhoneNumber(phoneNumber),
    token: verificationCode,
    type: "phone_change",
  });

  if (error) {
    throw error;
  }

  return data;
};

export const resendPhoneChangeOtp = async (phoneNumber) => {
  const { data, error } = await supabaseAuth.auth.resend({
    phone: toPhilippineE164PhoneNumber(phoneNumber),
    type: "phone_change",
  });

  if (error) {
    throw error;
  }

  return data;
};

export const updateUserPassword = async (password) => {
  const { data, error } = await supabaseAuth.auth.updateUser({
    password,
  });

  if (error) {
    throw error;
  }

  return data;
};

export const linkGoogleIdentity = async () => {
  const { data, error } = await supabaseAuth.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/profile-settings`,
    },
  });

  if (error) {
    throw error;
  }

  return data;
};

export const getAuthErrorMessage = (error) => {
  return error?.message || "Authentication failed. Please try again.";
};

export const signInWithGoogle = async (redirectPath = "/") => {
  const { data, error } = await supabaseAuth.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}${redirectPath}`,
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
