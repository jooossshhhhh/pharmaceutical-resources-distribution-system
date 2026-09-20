import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../context/useAuth";

export default function RoleGuard({ allowedRoles, children }) {
  const location = useLocation();
  const { profile } = useAuth();

  if (!allowedRoles.includes(profile?.role)) {
    return <Navigate to="/dashboard" replace state={{ from: location.pathname }} />;
  }

  return children;
}
