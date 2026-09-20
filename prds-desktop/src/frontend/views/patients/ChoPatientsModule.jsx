import { useCallback, useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { getActiveFacilities, getHealthCenterFacilities, getPatients } from "@backend/services/patientsService";
import PatientRegistry from "./PatientRegistry";

export default function ChoPatientsModule() {
  const { profile } = useAuth();
  const [patients, setPatients] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [dispensingFacilities, setDispensingFacilities] = useState([]);
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
      return rows;
    } catch (errorMessage) {
      setError(errorMessage instanceof Error ? errorMessage.message : String(errorMessage));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadFacilities = useCallback(async () => {
    try {
      const [healthCenters, activeFacilities] = await Promise.all([
        getHealthCenterFacilities(),
        getActiveFacilities(),
      ]);
      setFacilities(healthCenters);
      setDispensingFacilities(activeFacilities);
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
          defaultDispensingFacilityId={profile?.facility_id || ""}
          dispensingFacilities={dispensingFacilities}
          facilities={facilities}
          isCho
          loadPatients={loadPatients}
          patients={patients}
        />
      )}
    </AdminShell>
  );
}
