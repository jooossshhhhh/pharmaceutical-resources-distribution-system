import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoutes from "./ProtectedRoutes";
import RoleGuard from "./RoleGuard";
import GoogleOAuthCallbackHandler from "./GoogleOAuthCallbackHandler";

// Auth Views (Lazy loaded for fast initial app startup)
const LoginPage = lazy(() => import("@frontend/views/auth/LoginPage"));
const RegisterPage = lazy(() => import("@frontend/views/auth/RegisterPage"));
const OTPVerification = lazy(() => import("@frontend/views/auth/OTPVerification"));
const ForgotPassword = lazy(() => import("@frontend/views/auth/ForgotPassword"));
const PendingApproval = lazy(() => import("@frontend/views/auth/PendingApproval"));

// Main Application Modules (Lazy loaded on demand)
const DashboardModule = lazy(() => import("@frontend/views/dashboard/DashboardModule"));
const DispensingModule = lazy(() => import("@frontend/views/dispensing/DispensingModule"));
const ActivityLogsModule = lazy(() => import("@frontend/views/activity/ActivityLogsModule"));
const FacilitiesModule = lazy(() => import("@frontend/views/facilities/FacilitiesModule"));
const ForecastingModule = lazy(() => import("@frontend/views/forecasting/ForecastingModule"));
const InventoryModule = lazy(() => import("@frontend/views/inventory/InventoryModule"));
const MedicinesModule = lazy(() => import("@frontend/views/medicines/MedicinesModule"));
const NotificationsModule = lazy(() => import("@frontend/views/notifications/NotificationsModule"));
const ProfileSettingsModule = lazy(() => import("@frontend/views/profile/ProfileSettingsModule"));
const RequestsModule = lazy(() => import("@frontend/views/requests/RequestsModule"));
const SuppliersModule = lazy(() => import("@frontend/views/suppliers/SuppliersModule"));
const TransfersModule = lazy(() => import("@frontend/views/transfers/TransfersModule"));
const UserManagementModule = lazy(() => import("@frontend/views/users/UserManagementModule"));
const PatientsModule = lazy(() => import("@frontend/views/patients/PatientsModule"));
const OtherProgramsModule = lazy(() => import("@frontend/views/other-programs/OtherProgramsModule"));
const ReportModule = lazy(() => import("@frontend/views/reports/ReportModule"));

function RouteLoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#f8fafc]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
        <span className="text-xs font-medium text-slate-500">Loading module...</span>
      </div>
    </div>
  );
}

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
          <Route path="/dashboard" element={<DashboardModule />} />
          <Route
            path="/facilities"
            element={
              <RoleGuard allowedRoles={["PHARMA_I", "PHARMA_II"]}>
                <FacilitiesModule />
              </RoleGuard>
            }
          />
          <Route
            path="/medicines"
            element={
              <RoleGuard allowedRoles={["PHARMA_I", "PHARMA_II"]}>
                <MedicinesModule />
              </RoleGuard>
            }
          />
          <Route
            path="/suppliers"
            element={
              <RoleGuard allowedRoles={["PHARMA_II"]}>
                <SuppliersModule />
              </RoleGuard>
            }
          />
          <Route path="/inventory" element={<InventoryModule />} />
          <Route path="/inventory-bhw" element={<Navigate to="/inventory" replace />} />
          <Route path="/requests" element={<RequestsModule />} />
          <Route path="/transfers" element={<TransfersModule />} />
          <Route path="/forecasting" element={<ForecastingModule />} />
          <Route path="/notifications" element={<NotificationsModule />} />
          <Route path="/activity-logs" element={<ActivityLogsModule />} />
          <Route
            path="/users"
            element={
              <RoleGuard allowedRoles={["PHARMA_II"]}>
                <UserManagementModule />
              </RoleGuard>
            }
          />
          <Route path="/users/accounts" element={<Navigate to="/users" replace />} />
          <Route path="/users/change-requests" element={<Navigate to="/users" replace />} />
          <Route path="/patients" element={<PatientsModule />} />
          <Route path="/dispensing" element={<DispensingModule />} />
          <Route path="/reports" element={<ReportModule />} />
          <Route
            path="/other-programs"
            element={
              <RoleGuard allowedRoles={["PHARMA_II"]}>
                <OtherProgramsModule />
              </RoleGuard>
            }
          />
          <Route path="/profile-settings" element={<ProfileSettingsModule />} />
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
