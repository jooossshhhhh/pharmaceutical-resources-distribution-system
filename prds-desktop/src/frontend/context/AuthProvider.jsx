import { useEffect, useState } from "react";

import { supabaseAuth } from "@backend/client/supabase";
import {
  getSupabaseProfile,
  getProfileById,
} from "@backend/services/auth/profileService";
import { logoutUser } from "@backend/services/auth/authService";
import { AuthContext } from "./AuthContext";
import {
  getCachedUserSession,
  saveUserSession,
  clearUserSession,
  saveTerminalPasscodeAccount,
  recordLoginTimestamp,
} from "@backend/database/snapshotStore";
import { isCurrentNetworkOnline } from "@backend/sync/networkStatus";

export const AuthProvider = ({ children }) => {
  // Read instant persistent snapshot for 0ms offline boot
  const cached = getCachedUserSession();
  const [supabaseUser, setSupabaseUser] = useState(cached.user);
  const [profile, setProfile] = useState(cached.profile);
  const [profileError] = useState(null);
  // Never show loading screen on boot if we already have a cached user session
  const [loading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadSupabaseProfile = async (session) => {
      const currentSupabaseUser = session?.user ?? null;

      if (!currentSupabaseUser) {
        // Only clear state if we don't have an offline cached session
        const currentCached = getCachedUserSession();
        if (!currentCached.user) {
          if (isMounted) {
            setSupabaseUser(null);
            setProfile(null);
          }
        }
        return;
      }

      if (isMounted) {
        setSupabaseUser(currentSupabaseUser);
      }

      // Fast background revalidation (never blocks UI)
      try {
        if (isCurrentNetworkOnline()) {
          // Timeout after 2.5s so slow connections never hang
          const profilePromise = getSupabaseProfile(currentSupabaseUser);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Profile timeout")), 2500)
          );

          const userProfile = await Promise.race([profilePromise, timeoutPromise]);
          if (isMounted && userProfile) {
            if (currentSupabaseUser?.user_metadata?.has_passcode !== undefined) {
              userProfile.has_passcode = Boolean(currentSupabaseUser.user_metadata.has_passcode);
            }
            if (currentSupabaseUser?.user_metadata?.passcode_hash) {
              userProfile.passcode_hash = currentSupabaseUser.user_metadata.passcode_hash;
            }
            setProfile(userProfile);
            saveUserSession(currentSupabaseUser, userProfile);

            if (currentSupabaseUser?.user_metadata?.passcode_hash) {
              saveTerminalPasscodeAccount({
                user: currentSupabaseUser,
                profile: userProfile,
                passcodeHash: currentSupabaseUser.user_metadata.passcode_hash,
                session,
              });
            }
          }
        }
      } catch (error) {
        // Silently preserve cached profile
        console.warn("Retaining offline cached profile:", error?.message || error);
      }
    };

    // Fast check: race getSession with a 1.5s timeout
    const checkSession = async () => {
      try {
        const sessionPromise = supabaseAuth.auth.getSession();
        const timeoutPromise = new Promise((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 1500)
        );

        const { data } = await Promise.race([sessionPromise, timeoutPromise]);
        if (isMounted && data?.session) {
          loadSupabaseProfile(data.session);
        }
      } catch (err) {
        console.warn("Session check offline fallback:", err);
      }
    };

    checkSession();

    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // If offline and an active cached session exists, retain it (network drop should not log user out)
        if (!isCurrentNetworkOnline()) {
          const currentCached = getCachedUserSession();
          if (currentCached.user || currentCached.profile) {
            console.warn("Retaining offline session during network disconnection");
            return;
          }
        }
        clearUserSession().catch((error) => {
          console.warn("Failed to clear signed-out user data:", error);
        });
        if (isMounted) {
          setSupabaseUser(null);
          setProfile(null);
        }
        return;
      }

      if (session) {
        if (event === "SIGNED_IN") {
          const now = new Date().toISOString();
          recordLoginTimestamp(now, session.user?.id);
          if (session.user) {
            session.user.last_sign_in_at = now;
          }
        }
        loadSupabaseProfile(session);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async (overrides = null) => {
    if (!supabaseUser?.id) {
      if (overrides) {
        setProfile((prev) => {
          const next = { ...(prev || {}), ...overrides };
          saveUserSession(supabaseUser, next);
          return next;
        });
      }
      return profile;
    }

    try {
      if (isCurrentNetworkOnline()) {
        const updatedProfile = await getProfileById(supabaseUser.id);
        if (updatedProfile) {
          if (supabaseUser?.user_metadata?.has_passcode !== undefined) {
            updatedProfile.has_passcode = Boolean(supabaseUser.user_metadata.has_passcode);
          }
          if (supabaseUser?.user_metadata?.passcode_hash) {
            updatedProfile.passcode_hash = supabaseUser.user_metadata.passcode_hash;
          }
          const merged = overrides ? { ...updatedProfile, ...overrides } : updatedProfile;
          setProfile(merged);
          saveUserSession(supabaseUser, merged);
          return merged;
        }
      }
    } catch (err) {
      console.warn("Failed to refresh profile online:", err);
    }

    if (overrides) {
      setProfile((prev) => {
        const merged = { ...(prev || {}), ...overrides };
        saveUserSession(supabaseUser, merged);
        return merged;
      });
      return { ...profile, ...overrides };
    }

    return profile;
  };

  const loginWithOfflineSession = ({ user, profile: newProfile }) => {
    if (user) {
      setSupabaseUser(user);
    }
    if (newProfile) {
      setProfile(newProfile);
    }
    saveUserSession(user || supabaseUser, newProfile || profile);
  };

  const signOut = async () => {
    setSupabaseUser(null);
    setProfile(null);
    try {
      await logoutUser();
    } catch (err) {
      await clearUserSession();
      throw err;
    }
  };

  const value = {
    supabaseUser,
    profile,
    profileError,
    loading,
    isAuthenticated: Boolean(supabaseUser || profile),
    isProfileApproved: (profile?.status ?? cached.profile?.status) === "ACTIVE",
    loginWithOfflineSession,
    refreshProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
