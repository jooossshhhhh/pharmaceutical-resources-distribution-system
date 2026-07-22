import { useEffect, useState } from "react";

import { supabaseAuth } from "../services/supabase";
import {
  getSupabaseProfile,
  getProfileById,
} from "../features/auth/ProfileService";
import { AuthContext } from "./AuthContext";

export const AuthProvider = ({ children }) => {
  const [supabaseUser, setSupabaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadSupabaseProfile = async (session) => {
      const currentSupabaseUser = session?.user ?? null;
      setLoading(true);
      setSupabaseUser(currentSupabaseUser);
      setProfile(null);
      setProfileError(null);

      if (!currentSupabaseUser) {
        setLoading(false);
        return;
      }

      try {
        const userProfile = await getSupabaseProfile(currentSupabaseUser);

        if (isMounted) {
          setProfile(userProfile);
        }
      } catch (error) {
        if (isMounted) {
          setProfileError(error);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    supabaseAuth.auth.getSession().then(({ data }) => {
      loadSupabaseProfile(data.session);
    });

    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange((_event, session) => {
      loadSupabaseProfile(session);
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

    const updatedProfile = await getProfileById(supabaseUser.id);
    setProfile(updatedProfile);
    return updatedProfile;
  };

  const value = {
    supabaseUser,
    profile,
    profileError,
    loading,
    isAuthenticated: !!supabaseUser,
    isProfileApproved: profile?.status === "ACTIVE",
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
