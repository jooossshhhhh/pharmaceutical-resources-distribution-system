import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LoginPage from "@frontend/views/auth/LoginPage";
import RegisterPage from "@frontend/views/auth/RegisterPage";
import OTPVerification from "@frontend/views/auth/OTPVerification";
import ForgotPassword from "@frontend/views/auth/ForgotPassword";
import PendingApproval from "@frontend/views/auth/PendingApproval";
import DashboardModule from "@frontend/views/dashboard/DashboardModule";
import DispensingModule from "@frontend/views/dispensing/DispensingModule";
import ActivityLogsModule from "@frontend/views/activity/ActivityLogsModule";
import FacilitiesModule from "@frontend/views/facilities/FacilitiesModule";
import ForecastingModule from "@frontend/views/forecasting/ForecastingModule";
import InventoryModule from "@frontend/views/inventory/InventoryModule";
import MedicinesModule from "@frontend/views/medicines/MedicinesModule";
import NotificationsModule from "@frontend/views/notifications/NotificationsModule";
import ProfileSettingsModule from "@frontend/views/profile/ProfileSettingsModule";
import RequestsModule from "@frontend/views/requests/RequestsModule";
import SuppliersModule from "@frontend/views/suppliers/SuppliersModule";
import TransfersModule from "@frontend/views/transfers/TransfersModule";
import UserManagementModule from "@frontend/views/users/UserManagementModule";
import PatientsModule from "@frontend/views/patients/PatientsModule";
import OtherProgramsModule from "@frontend/views/other-programs/OtherProgramsModule";
import ProtectedRoutes from "./ProtectedRoutes";
import RoleGuard from "./RoleGuard";
import GoogleOAuthCallbackHandler from "./GoogleOAuthCallbackHandler";

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <GoogleOAuthCallbackHandler />
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
    </BrowserRouter>
  );
}
