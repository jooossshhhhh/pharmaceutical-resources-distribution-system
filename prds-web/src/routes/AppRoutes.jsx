import { BrowserRouter, Routes, Route } from "react-router-dom";

import LoginPage from "../features/auth/LoginPage";
import RegisterPage from "../features/auth/RegisterPage";
import OTPVerification from "../features/auth/OTPVerification";
import ForgotPassword from "../features/auth/ForgotPassword";
import PendingApproval from "../features/auth/PendingApproval";
import DashboardModule from "../modules/dashboard/DashboardModule";
import FacilitiesModule from "../modules/facilities/FacilitiesModule";
import InventoryModule from "../modules/inventory/InventoryModule";
import MedicinesModule from "../modules/medicines/MedicinesModule";
import NotificationsModule from "../modules/notifications/NotificationsModule";
import ProfileSettingsModule from "../modules/profile/ProfileSettingsModule";
import SuppliersModule from "../modules/suppliers/SuppliersModule";
import UserManagementModule from "../modules/users/UserManagementModule";
import ProtectedRoutes from "./ProtectedRoutes";

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
          <Route path="/facilities" element={<FacilitiesModule />} />
          <Route path="/medicines" element={<MedicinesModule />} />
          <Route path="/suppliers" element={<SuppliersModule />} />
          <Route path="/inventory" element={<InventoryModule />} />
          <Route path="/notifications" element={<NotificationsModule />} />
          <Route path="/users" element={<UserManagementModule />} />
          <Route path="/profile-settings" element={<ProfileSettingsModule />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
