import { supabaseAuth } from "../../client/supabase";
import {
  clearUserSession,
  getCachedUserSession,
  getLastLoginTimestamp,
  getTerminalPasscodeAccount,
  recordLoginTimestamp,
  removeTerminalPasscodeAccount,
  restoreSnapshotsFromSqlite,
  saveTerminalPasscodeAccount,
  saveUserSession,
} from "../../database/snapshotStore";
import { getAuthErrorMessage as getAuthErrorMessageFromUtils } from "@shared/utils/authErrorUtils";
import { isPhilippineMobileNumber } from "@shared/utils/authRegistrationUtils";
import { signOutCurrentSession } from "./authSessionUtils.js";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  GOOGLE_OAUTH_RETURN_PATH_KEY,
  normalizeGoogleOAuthReturnPath,
} from "./googleOAuthUtils.js";
import {
  hashPasscode,
  verifyPasscodeHash,
  isDifferentFromCurrentPasscode,
} from "@shared/utils/passcodeUtils";
import { isCurrentNetworkOnline } from "../../sync/networkStatus";

export { isPhilippineMobileNumber };

const recordAuthActivity = async (action) => {
  if (!isCurrentNetworkOnline()) return;
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

const syncTerminalPasscodeFromAuth = (data) => {
  try {
    if (data?.user?.user_metadata?.has_passcode && data?.user?.user_metadata?.passcode_hash) {
      const identifier = data.user.email || data.user.phone || data.user.id;
      const existing = getTerminalPasscodeAccount(identifier);
      saveTerminalPasscodeAccount({
        user: data.user,
        profile: existing?.profile || null,
        passcodeHash: data.user.user_metadata.passcode_hash,
        session: data.session || null,
      });
    }
  } catch (err) {
    console.warn("Failed to auto-register terminal passcode from auth:", err);
  }
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

  const now = new Date().toISOString();
  recordLoginTimestamp(now, data?.user?.id);
  if (data?.user) {
    data.user.last_sign_in_at = now;
  }
  syncTerminalPasscodeFromAuth(data);
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

  const now = new Date().toISOString();
  recordLoginTimestamp(now, data?.user?.id);
  if (data?.user) {
    data.user.last_sign_in_at = now;
  }
  syncTerminalPasscodeFromAuth(data);
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

  const now = new Date().toISOString();
  recordLoginTimestamp(now, data?.user?.id);
  if (data?.user) {
    data.user.last_sign_in_at = now;
  }
  syncTerminalPasscodeFromAuth(data);
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

  const now = new Date().toISOString();
  recordLoginTimestamp(now, data?.user?.id);
  if (data?.user) {
    data.user.last_sign_in_at = now;
  }
  syncTerminalPasscodeFromAuth(data);
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

export const signInWithPasscode = async ({ identifier, passcode }) => {
  const cleanPasscode = (passcode || "").trim();
  if (!cleanPasscode || !/^\d{6}$/.test(cleanPasscode)) {
    throw new Error("Passcode must be exactly 6 numeric digits.");
  }

  const cleanIdentifier = (identifier || "").trim();
  if (!cleanIdentifier) {
    throw new Error("Please enter your Phone Number or Email address.");
  }

  // Look up registered terminal account
  const account = getTerminalPasscodeAccount(cleanIdentifier);

  if (!account || !account.passcodeHash) {
    throw new Error(
      "No passcode configured on this device for this account. Please sign in using Password or OTP verification first, then configure your passcode."
    );
  }

  const isValid = await verifyPasscodeHash(cleanPasscode, account.passcodeHash);
  if (!isValid) {
    throw new Error("Incorrect passcode. Please check your digits or sign in using Password or OTP.");
  }

  const now = new Date().toISOString();
  recordLoginTimestamp(now, account.user?.id);

  const updatedUser = account.user
    ? { ...account.user, last_sign_in_at: now }
    : { last_sign_in_at: now };

  // Restore Supabase Auth session only when online to prevent network errors from triggering SIGNED_OUT
  if (isCurrentNetworkOnline() && account.session?.refresh_token) {
    try {
      const { data: refreshedData, error: refreshError } =
        await supabaseAuth.auth.setSession({
          access_token: account.session.access_token,
          refresh_token: account.session.refresh_token,
        });

      if (!refreshError && refreshedData?.session) {
        saveTerminalPasscodeAccount({
          user: updatedUser,
          profile: account.profile,
          passcodeHash: account.passcodeHash,
          session: refreshedData.session,
        });
      }
    } catch (sessionErr) {
      console.warn("Passcode session restore online fallback:", sessionErr);
    }
  } else {
    saveTerminalPasscodeAccount({
      user: updatedUser,
      profile: account.profile,
      passcodeHash: account.passcodeHash,
      session: account.session,
    });
  }

  // Restore active user session locally with current login time
  saveUserSession(updatedUser, account.profile);
  await recordAuthActivity("User Signed In with Passcode");
  await restoreSnapshotsFromSqlite(account.profile?.facility_id, account.profile?.role).catch(() => {});

  return {
    user: updatedUser,
    profile: account.profile,
    session: account.session,
  };
};

export const setupUserPasscode = async ({ passcode, existingPasscodeHash = "" }) => {
  if (!passcode || !/^\d{6}$/.test(passcode)) {
    throw new Error("Passcode must be exactly 6 numeric digits.");
  }

  // 1. Verify that new passcode is different from previous passcode if one exists
  const currentAuthUser = await getCurrentAuthUser().catch(() => null);
  const currentHash =
    existingPasscodeHash ||
    currentAuthUser?.user_metadata?.passcode_hash ||
    getCachedUserSession()?.user?.user_metadata?.passcode_hash;

  if (currentHash) {
    const isDifferent = await isDifferentFromCurrentPasscode(passcode, currentHash);
    if (!isDifferent) {
      throw new Error("New passcode must be different from your current passcode.");
    }
  }

  // 2. Hash the 6-digit passcode
  const hashedPasscode = await hashPasscode(passcode);

  // 3. Update ONLY user_metadata in Supabase Auth (DO NOT TOUCH account password!)
  const { data: updateData, error: updateError } = await supabaseAuth.auth.updateUser({
    data: {
      has_passcode: true,
      passcode_hash: hashedPasscode,
      passcode_updated_at: new Date().toISOString(),
    },
  });

  if (updateError) {
    throw updateError;
  }

  // 4. Best-effort update to public.profiles table
  try {
    const { error: rpcError } = await supabaseAuth.rpc("set_own_passcode_status", {
      p_has_passcode: true,
    });
    if (rpcError) {
      const user = updateData?.user || currentAuthUser || (await getCurrentAuthUser());
      if (user?.id) {
        await supabaseAuth
          .from("profiles")
          .update({
            has_passcode: true,
            passcode_updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
      }
    }
  } catch (err) {
    console.warn("Profiles table passcode status update skipped/fallback:", err?.message || err);
  }

  // 5. Immediately persist to local session cache and terminal registry
  const cached = getCachedUserSession();
  const activeUser = updateData?.user || currentAuthUser || cached?.user;
  const currentProfile = cached?.profile || {};
  const updatedProfile = {
    ...currentProfile,
    has_passcode: true,
    passcode_hash: hashedPasscode,
    passcode_updated_at: new Date().toISOString(),
  };
  saveUserSession(activeUser, updatedProfile);

  const { data: sessionData } = await supabaseAuth.auth.getSession().catch(() => ({ data: { session: null } }));
  const activeSession = sessionData?.session || null;

  saveTerminalPasscodeAccount({
    user: activeUser,
    profile: updatedProfile,
    passcodeHash: hashedPasscode,
    session: activeSession,
  });

  await recordAuthActivity("Passcode Configured");
  return {
    success: true,
    has_passcode: true,
    passcode_hash: hashedPasscode,
    profile: updatedProfile,
    user: activeUser,
  };
};

export const removeUserPasscode = async () => {
  // 1. Clear passcode flag and hash in Supabase Auth user_metadata
  const { data: updateData, error: updateError } = await supabaseAuth.auth.updateUser({
    data: {
      has_passcode: false,
      passcode_hash: null,
      passcode_updated_at: null,
    },
  });

  if (updateError) {
    throw updateError;
  }

  // 2. Best-effort update to public.profiles table
  try {
    const { error: rpcError } = await supabaseAuth.rpc("set_own_passcode_status", {
      p_has_passcode: false,
    });
    if (rpcError) {
      const user = updateData?.user || (await getCurrentAuthUser());
      if (user?.id) {
        await supabaseAuth
          .from("profiles")
          .update({
            has_passcode: false,
            passcode_updated_at: null,
          })
          .eq("id", user.id);
      }
    }
  } catch (err) {
    console.warn("Profiles table passcode removal skipped/fallback:", err?.message || err);
  }

  // 3. Update local session cache and remove from terminal passcode registry
  const cached = getCachedUserSession();
  const activeUser = updateData?.user || cached?.user;
  const currentProfile = cached?.profile || {};
  const updatedProfile = {
    ...currentProfile,
    has_passcode: false,
    passcode_hash: null,
    passcode_updated_at: null,
  };
  saveUserSession(activeUser, updatedProfile);

  if (activeUser?.id) {
    removeTerminalPasscodeAccount(activeUser.id);
  }

  await recordAuthActivity("Passcode Removed");
  return { success: true, has_passcode: false, profile: updatedProfile, user: activeUser };
};

export const getCurrentAuthUser = async () => {
  if (isCurrentNetworkOnline()) {
    try {
      const { data, error } = await supabaseAuth.auth.getUser();
      if (!error && data?.user) {
        const user = data.user;
        const lastLogin = getLastLoginTimestamp(user.id);
        if (lastLogin) {
          user.last_sign_in_at = lastLogin;
        }
        return user;
      }
    } catch (e) {
      console.warn("supabaseAuth.auth.getUser online error, falling back:", e?.message || e);
    }
  }

  // Fallback to locally cached user session or terminal passcode account
  const cached = getCachedUserSession();
  let user = cached?.user || null;
  if (!user && cached?.profile?.id) {
    const terminalAccount = getTerminalPasscodeAccount(cached.profile.id);
    user = terminalAccount?.user || null;
  }

  if (user) {
    const lastLogin = getLastLoginTimestamp(user.id);
    if (lastLogin) {
      user.last_sign_in_at = lastLogin;
    }
    return user;
  }

  throw new Error("Auth session missing!");
};

export const getUserIdentities = async () => {
  if (isCurrentNetworkOnline()) {
    try {
      const { data, error } = await supabaseAuth.auth.getUserIdentities();
      if (!error && data?.identities && data.identities.length > 0) {
        return data.identities;
      }
    } catch (e) {
      console.warn("supabaseAuth.auth.getUserIdentities online error, falling back:", e?.message || e);
    }
  }

  // Fallback to cached user identities
  const cached = getCachedUserSession();
  const cachedUser = cached?.user || null;
  const terminalAccount = cachedUser?.id ? getTerminalPasscodeAccount(cachedUser.id) : null;
  const sourceUser = cachedUser || terminalAccount?.user || null;

  if (sourceUser?.identities && Array.isArray(sourceUser.identities) && sourceUser.identities.length > 0) {
    return sourceUser.identities;
  }

  // Synthesize identities from cached user & profile metadata if available
  const identities = [];
  const profile = cached?.profile || terminalAccount?.profile || null;
  const primaryEmail = sourceUser?.email || profile?.email || terminalAccount?.email || "";
  const phoneNumber = sourceUser?.phone || profile?.phone_number || terminalAccount?.phoneNumber || "";
  const providers =
    sourceUser?.app_metadata?.providers ||
    (sourceUser?.app_metadata?.provider ? [sourceUser.app_metadata.provider] : []);

  // Check for Google identity
  const isGoogle =
    providers.includes("google") ||
    sourceUser?.app_metadata?.provider === "google" ||
    (primaryEmail && primaryEmail.toLowerCase().includes("@gmail.com"));

  if (isGoogle && primaryEmail) {
    identities.push({
      id: sourceUser?.id ? `google-${sourceUser.id}` : "google-identity",
      user_id: sourceUser?.id || "",
      provider: "google",
      email: primaryEmail,
      identity_data: {
        email: primaryEmail,
        email_verified: true,
      },
    });
  }

  // Check for Phone identity
  const isPhone =
    providers.includes("phone") ||
    sourceUser?.app_metadata?.provider === "phone" ||
    Boolean(phoneNumber);

  if (isPhone && phoneNumber) {
    identities.push({
      id: sourceUser?.id ? `phone-${sourceUser.id}` : "phone-identity",
      user_id: sourceUser?.id || "",
      provider: "phone",
      phone: phoneNumber,
      identity_data: {
        phone: phoneNumber,
        sub: phoneNumber,
        phone_verified: true,
      },
    });
  }

  return identities;
};

export const unlinkUserIdentity = async (identity) => {
  if (!isCurrentNetworkOnline()) {
    throw new Error("Cannot unlink login methods while offline. Please connect to the internet.");
  }
  const { data, error } = await supabaseAuth.auth.unlinkIdentity(identity);

  if (error) {
    throw error;
  }

  return data;
};

export const linkGoogleIdentity = async () => {
  if (!isCurrentNetworkOnline()) {
    throw new Error("Cannot link Google account while offline. Please connect to the internet.");
  }
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

  await recordAuthActivity("Signed Out Other Sessions");
  return { success: true };
};

// LOGOUT
export const logoutUser = async () => {
  await recordAuthActivity("User Signed Out");
  await clearUserSession();
  await signOutCurrentSession(supabaseAuth.auth);
};
