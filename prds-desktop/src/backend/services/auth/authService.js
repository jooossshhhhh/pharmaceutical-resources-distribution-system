import { supabaseAuth } from "../../client/supabase";
import { clearUserSession } from "../../database/snapshotStore";
import { getAuthErrorMessage as getAuthErrorMessageFromUtils } from "@shared/utils/authErrorUtils";
import { isPhilippineMobileNumber } from "@shared/utils/authRegistrationUtils";
import { signOutCurrentSession } from "./authSessionUtils.js";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  GOOGLE_OAUTH_RETURN_PATH_KEY,
  normalizeGoogleOAuthReturnPath,
} from "./googleOAuthUtils.js";

export { isPhilippineMobileNumber };

const recordAuthActivity = async (action) => {
  try {
    await supabaseAuth.rpc("record_activity_log", {
      p_action: action,
      p_module: "Authentication",
      p_details: `${action}.`,
    });
  } catch (err) {
    console.warn("Authentication activity log failed:", err);
  }
};

export const normalizePhoneNumber = (phoneNumber) => {
  const digitsOnly = phoneNumber.replace(/\D/g, "");

  if (!digitsOnly) {
    return "";
  }

  if (digitsOnly.startsWith("63")) {
    return `0${digitsOnly.slice(2)}`;
  }

  if (digitsOnly.startsWith("0")) {
    return digitsOnly;
  }

  return `0${digitsOnly}`;
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

export const sendEmailOtp = async (
  email,
  { shouldCreateUser = false } = {}
) => {
  const { data, error } = await supabaseAuth.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser,
    },
  });

  if (error) {
    throw error;
  }

  return data;
};

export const sendPasswordResetEmail = async (email) => {
  const { data, error } = await supabaseAuth.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/forgot-password`,
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

  await recordAuthActivity("User Signed In");
  return data;
};

export const signInWithEmailPassword = async ({
  email,
  password,
}) => {
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  await recordAuthActivity("User Signed In");
  return data;
};

export const verifyPhoneOtp = async ({
  phoneNumber,
  verificationCode,
}) => {
  const { data, error } = await supabaseAuth.auth.verifyOtp({
    phone: toPhilippineE164PhoneNumber(phoneNumber),
    token: (verificationCode || "").trim(),
    type: "sms",
  });

  if (error) {
    throw error;
  }

  await recordAuthActivity("User Signed In");
  return data;
};

export const verifyEmailOtp = async ({
  email,
  verificationCode,
}) => {
  const { data, error } = await supabaseAuth.auth.verifyOtp({
    email: (email || "").trim().toLowerCase(),
    token: (verificationCode || "").trim(),
    type: "email",
  });

  if (error) {
    throw error;
  }

  await recordAuthActivity("User Signed In");
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
    token: (verificationCode || "").trim(),
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

export const logOwnPasswordChange = async () => {
  const { error } = await supabaseAuth.rpc("log_own_password_change");

  if (error) {
    throw error;
  }
};

export const getCurrentAuthUser = async () => {
  const { data, error } = await supabaseAuth.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user;
};

export const getUserIdentities = async () => {
  const { data, error } = await supabaseAuth.auth.getUserIdentities();

  if (error) {
    throw error;
  }

  return data.identities || [];
};

export const unlinkUserIdentity = async (identity) => {
  const { data, error } = await supabaseAuth.auth.unlinkIdentity(identity);

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
  return getAuthErrorMessageFromUtils(error);
};

export const signInWithGoogle = async (redirectPath = "/") => {
  const returnPath = normalizeGoogleOAuthReturnPath(redirectPath);
  const isDesktop = isTauri();
  const { data, error } = await supabaseAuth.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: isDesktop
        ? "prds://auth/callback"
        : `${window.location.origin}${returnPath}`,
      skipBrowserRedirect: isDesktop,
      queryParams: { prompt: "select_account" },
    },
  });

  if (error) {
    throw error;
  }

  if (isDesktop) {
    if (!data?.url) {
      throw new Error("Google sign-in did not return an authorization URL.");
    }

    localStorage.setItem(GOOGLE_OAUTH_RETURN_PATH_KEY, returnPath);
    try {
      await openUrl(data.url);
    } catch (openError) {
      localStorage.removeItem(GOOGLE_OAUTH_RETURN_PATH_KEY);
      throw openError;
    }
  }

  return data;
};

export const signOutOtherSessions = async () => {
  const { error } = await supabaseAuth.auth.signOut({ scope: "others" });

  if (error) {
    throw error;
  }
};

// LOGOUT
export const logoutUser = async () => {
  await recordAuthActivity("User Signed Out");
  await clearUserSession();
  await signOutCurrentSession(supabaseAuth.auth);
};
