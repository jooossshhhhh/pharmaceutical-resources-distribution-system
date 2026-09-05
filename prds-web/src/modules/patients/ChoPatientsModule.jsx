import { useCallback, useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { getHealthCenterFacilities, getPatients } from "./PatientsService";
import PatientRegistry from "./PatientRegistry";

export default function ChoPatientsModule() {
  const { profile } = useAuth();
  const [patients, setPatients] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const today = useMemo(() => {
    return new Intl.DateTimeFormat("en-PH", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date());
  }, []);

  const loadPatients = useCallback(async () => {
    try {
      const rows = await getPatients({ archiveMode: "all" });
      setPatients(rows);
      setError("");
    } catch (errorMessage) {
      setError(errorMessage instanceof Error ? errorMessage.message : String(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadFacilities = useCallback(async () => {
    try {
      const rows = await getHealthCenterFacilities();
      setFacilities(rows);
    } catch (errorMessage) {
      setError(errorMessage instanceof Error ? errorMessage.message : String(errorMessage));
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadPatients();
      loadFacilities();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadFacilities, loadPatients]);

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="h-80 animate-pulse rounded-xl border border-[#d8dadc] bg-white/60" />
      ) : (
        <PatientRegistry
          canArchive={["PHARMA_I", "PHARMA_II"].includes(profile?.role)}
          canDelete={profile?.role === "PHARMA_II"}
          facilities={facilities}
          isCho
          loadPatients={loadPatients}
          patients={patients}
        />
      )}
    </AdminShell>
  );
}
