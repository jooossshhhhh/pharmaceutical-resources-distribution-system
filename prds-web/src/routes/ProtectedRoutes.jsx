import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../context/useAuth";
import { isProfileRegistrationComplete } from "../features/auth/ProfileService";

export default function ProtectedRoutes() {
  const { isAuthenticated, isProfileApproved, loading, profile } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-sm font-semibold text-slate-500">
        Loading
      </div>
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
