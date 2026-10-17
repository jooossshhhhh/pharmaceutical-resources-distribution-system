import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoutes from "./ProtectedRoutes";
import KeepAliveWorkspaceLayout, { RouteLoadingFallback } from "./KeepAliveWorkspaceLayout";
import GoogleOAuthCallbackHandler from "./GoogleOAuthCallbackHandler";

// Auth Views (Lazy loaded for fast initial app startup)
const LoginPage = lazy(() => import("@frontend/views/auth/LoginPage"));
const RegisterPage = lazy(() => import("@frontend/views/auth/RegisterPage"));
const OTPVerification = lazy(() => import("@frontend/views/auth/OTPVerification"));
const ForgotPassword = lazy(() => import("@frontend/views/auth/ForgotPassword"));
const PendingApproval = lazy(() => import("@frontend/views/auth/PendingApproval"));

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <GoogleOAuthCallbackHandler />
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/otp-verification" element={<OTPVerification />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
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
