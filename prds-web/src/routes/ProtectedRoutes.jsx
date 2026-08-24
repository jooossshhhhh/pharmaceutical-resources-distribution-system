import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../context/useAuth";
import { isProfileRegistrationComplete } from "../features/auth/ProfileService";

export default function ProtectedRoutes() {
  const { isAuthenticated, isProfileApproved, loading, profile } = useAuth();

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7f6f3] px-5 py-5 text-[#0d1117]">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[1280px] items-center justify-center">
          <div className="rounded-xl border border-[#d8dadc] bg-white px-5 py-4 text-center shadow-sm">
            <div className="mx-auto h-2 w-28 overflow-hidden rounded-full bg-[#eef1f5]">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[#6be9c2]" />
            </div>
            <p className="mt-3 text-sm font-bold text-[#42474e]">Loading PRDS workspace</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (!isProfileRegistrationComplete(profile)) {
    return <Navigate to="/register" replace />;
  }

  if (!isProfileApproved) {
    return <Navigate to="/pending-approval" replace />;
  }

  return <Outlet />;
}
