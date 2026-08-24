import { useCallback, useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";
import { getPatients } from "./PatientsService";
import PatientRegistry from "./PatientRegistry";

export default function BhwPatientsModule() {
  const { profile } = useAuth();
  const [patients, setPatients] = useState([]);
  const [ownFacility, setOwnFacility] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const profileFacilityId = profile?.facility_id;

  const today = useMemo(() => {
    return new Intl.DateTimeFormat("en-PH", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date());
  }, []);

  const loadPatients = useCallback(async () => {
    if (!profileFacilityId) {
      setPatients([]);
      setIsLoading(false);
      return;
    }

    try {
      const rows = await getPatients({ facilityId: profileFacilityId });
      setPatients(rows);
      setError("");
    } catch (errorMessage) {
      setError(errorMessage instanceof Error ? errorMessage.message : String(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [profileFacilityId]);

  const loadOwnFacility = useCallback(async () => {
    if (!profileFacilityId) {
      setOwnFacility([]);
      return;
    }

    const { data, error: facilityError } = await supabase
      .from("facilities")
      .select("id, facility_name, facility_code, facility_type, address, status")
      .eq("id", profileFacilityId)
      .single();

    if (facilityError) {
      setError(facilityError.message);
      return;
    }

    setOwnFacility(data ? [data] : []);
  }, [profileFacilityId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadPatients();
      loadOwnFacility();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadOwnFacility, loadPatients]);

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
          canDelete={false}
          facilities={ownFacility}
          isCho={false}
          loadPatients={loadPatients}
          patients={patients}
        />
      )}
    </AdminShell>
  );
}