import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "@frontend/context/useAuth";
import { isProfileRegistrationComplete } from "@backend/services/auth/profileService";
import { getCachedUserSession } from "@backend/database/snapshotStore";

export default function ProtectedRoutes() {
  const { isAuthenticated, isProfileApproved, loading, profile } = useAuth();
  const [maxLoadingReached, setMaxLoadingReached] = useState(false);

  useEffect(() => {
    // Safety timer: Never hang on loading screen for more than 1 second
    const timer = setTimeout(() => {
      setMaxLoadingReached(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const cachedSession = getCachedUserSession();
  const effectiveAuth = isAuthenticated || Boolean(cachedSession.user);
  const effectiveProfile = profile || cachedSession.profile;
  const effectiveIsApproved = (profile?.status ?? cachedSession.profile?.status) === "ACTIVE";

  if (!maxLoadingReached && (!effectiveAuth || (loading && !effectiveProfile))) {
    return (
      <main className="min-h-screen bg-[#E5EFF1] px-5 py-5 text-[#1B2B30]">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[1280px] items-center justify-center">
          <div className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] px-5 py-4 text-center shadow-xs">
            <div className="mx-auto h-2 w-28 overflow-hidden rounded-full bg-[#CFDDE0]/50">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-linear-to-r from-[#1F4E5A] to-[#286575]" />
            </div>
            <p className="mt-3 text-sm font-bold text-[#1B2B30]">Loading PRDS workspace</p>
          </div>
        </div>
      </main>
    );
  }

  if (!effectiveAuth) {
    return <Navigate to="/" replace />;
  }

  if (!isProfileRegistrationComplete(effectiveProfile)) {
    return <Navigate to="/register" replace />;
  }

  if (!effectiveIsApproved) {
    return <Navigate to="/pending-approval" replace />;
  }

  return <Outlet />;
}
