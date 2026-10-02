import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import ChoReportModule from "./ChoReportModule";
import BhwReportModule from "./BhwReportModule";

export default function ReportModule() {
  const { profile } = useAuth();

  return (
    <AdminShell profile={profile} onSignOut={logoutUser}>
      {profile?.role === "BHW" ? <BhwReportModule /> : <ChoReportModule />}
    </AdminShell>
  );
}
