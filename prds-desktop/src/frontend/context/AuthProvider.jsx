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
            setProfile(userProfile);
            saveUserSession(currentSupabaseUser, userProfile);
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
        loadSupabaseProfile(session);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (!supabaseUser?.id) {
      return null;
    }

    try {
      if (isCurrentNetworkOnline()) {
        const updatedProfile = await getProfileById(supabaseUser.id);
        if (updatedProfile) {
          setProfile(updatedProfile);
          saveUserSession(supabaseUser, updatedProfile);
          return updatedProfile;
        }
      }
    } catch (err) {
      console.warn("Failed to refresh profile online:", err);
    }

    return profile;
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
    isAuthenticated: Boolean(supabaseUser),
    isProfileApproved: profile?.status === "ACTIVE",
    refreshProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
