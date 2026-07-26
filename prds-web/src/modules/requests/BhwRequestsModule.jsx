import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { formatDateTime } from "../dashboard/dashboardUtils";

export default function BhwRequestsModule() {
  const { profile } = useAuth();

  return (
    <AdminShell currentDateTime={formatDateTime(new Date())} profile={profile} onSignOut={logoutUser}>
      <section className="rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-xl font-black text-black">Facility Request Workspace</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-neutral-500">
          This BHW request workspace is reserved for the next pass. It will create medicine
          requests and show request history only for the signed-in user&apos;s assigned facility.
        </p>
      </section>
    </AdminShell>
  );
}
