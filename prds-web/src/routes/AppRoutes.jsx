import { BrowserRouter, Routes, Route } from "react-router-dom";

import LoginPage from "../features/auth/LoginPage";
import RegisterPage from "../features/auth/RegisterPage";
import OTPVerification from "../features/auth/OTPVerification";
import ForgotPassword from "../features/auth/ForgotPassword";
import PendingApproval from "../features/auth/PendingApproval";
import DashboardModule from "../modules/dashboard/DashboardModule";
import DispensingModule from "../modules/dispensing/DispensingModule";
import ActivityLogsModule from "../modules/activity/ActivityLogsModule";
import FacilitiesModule from "../modules/facilities/FacilitiesModule";
import ForecastingModule from "../modules/forecasting/ForecastingModule";
import BhwInventoryModule from "../modules/inventory/BhwInventoryModule";
import ChoInventoryModule from "../modules/inventory/ChoInventoryModule";
import MedicinesModule from "../modules/medicines/MedicinesModule";
import NotificationsModule from "../modules/notifications/NotificationsModule";
import ProfileSettingsModule from "../modules/profile/ProfileSettingsModule";
import RequestsModule from "../modules/requests/RequestsModule";
import SuppliersModule from "../modules/suppliers/SuppliersModule";
import TransfersModule from "../modules/transfers/TransfersModule";
import UserManagementModule from "../modules/users/UserManagementModule";
import PatientsModule from "../modules/patients/PatientsModule";
import ComingSoonModule from "../modules/coming-soon/ComingSoonModule";
import ProtectedRoutes from "./ProtectedRoutes";
import RoleGuard from "./RoleGuard";

export default function AppRoutes() {
  return (
    <BrowserRouter>
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
          <Route
            path="/inventory"
            element={
              <RoleGuard allowedRoles={["PHARMA_I", "PHARMA_II"]}>
                <ChoInventoryModule />
              </RoleGuard>
            }
          />
          <Route
            path="/inventory-bhw"
            element={
              <RoleGuard allowedRoles={["BHW"]}>
                <BhwInventoryModule />
              </RoleGuard>
            }
          />
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
          <Route path="/patients" element={<PatientsModule />} />
          <Route path="/dispensing" element={<DispensingModule />} />
          <Route
            path="/other-programs"
            element={
              <RoleGuard allowedRoles={["PHARMA_I", "PHARMA_II"]}>
                <ComingSoonModule
                  title="Other Programs"
                  description="Additional health programs and program medicines are under development and will be available soon."
                />
              </RoleGuard>
            }
          />
          <Route path="/profile-settings" element={<ProfileSettingsModule />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
