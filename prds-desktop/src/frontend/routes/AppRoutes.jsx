import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

import ProtectedRoutes from "./ProtectedRoutes";
import KeepAliveWorkspaceLayout, { RouteLoadingFallback } from "./KeepAliveWorkspaceLayout";
import GoogleOAuthCallbackHandler from "./GoogleOAuthCallbackHandler";

function AuthRecoveryRedirectHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    const search = window.location.search || "";

    const isRecovery =
      hash.includes("type=recovery") ||
      (hash.includes("access_token") &&
        (location.pathname === "/" || location.pathname === "/forgot-password")) ||
      search.includes("token_hash") ||
      (search.includes("code=") && location.pathname !== "/reset-password");

    if (isRecovery && location.pathname !== "/reset-password") {
      navigate(`/reset-password${search}${hash}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  return null;
}

// Auth Views (Lazy loaded for fast initial app startup)
const LoginPage = lazy(() => import("@frontend/views/auth/LoginPage"));
const RegisterPage = lazy(() => import("@frontend/views/auth/RegisterPage"));
const OTPVerification = lazy(() => import("@frontend/views/auth/OTPVerification"));
const ForgotPasswordRequest = lazy(() => import("@frontend/views/auth/ForgotPasswordRequest"));
const ResetPassword = lazy(() => import("@frontend/views/auth/ForgotPassword"));
const PendingApproval = lazy(() => import("@frontend/views/auth/PendingApproval"));

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthRecoveryRedirectHandler />
      <GoogleOAuthCallbackHandler />
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/otp-verification" element={<OTPVerification />} />
          <Route path="/forgot-password" element={<ForgotPasswordRequest />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/pending-approval" element={<PendingApproval />} />
          <Route element={<ProtectedRoutes />}>
            <Route path="/*" element={<KeepAliveWorkspaceLayout />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
