import { useEffect, useState } from "react";

import { useAuth } from "../../context/useAuth";
import { supabase } from "../../services/supabase";
import DispensingLoadingSkeleton from "./DispensingLoadingSkeleton";
import DispensingWorkbench from "./DispensingWorkbench";

export default function BhwDispensingModule() {
  const { profile } = useAuth();
  const [facilities, setFacilities] = useState([]);
  const [error, setError] = useState("");
  const profileFacilityId = profile?.facility_id;

  useEffect(() => {
    let cancelled = false;

    const loadOwnFacility = async () => {
      if (!profileFacilityId) {
        setError("Your account is not assigned to a facility.");
        return;
      }

      try {
        const { data, error: facilityError } = await supabase
          .from("facilities")
          .select("id, facility_name, facility_code")
          .eq("id", profileFacilityId)
          .single();

        if (facilityError) {
          throw facilityError;
        }

        if (!cancelled) {
          setFacilities(data ? [data] : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load your facility.");
        }
      }
    };

    const timerId = window.setTimeout(() => {
      loadOwnFacility();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [profileFacilityId]);

  if (error) {
    return <DispensingLoadingSkeleton error={error} />;
  }

  if (facilities.length === 0) {
    return <DispensingLoadingSkeleton />;
  }

  return <DispensingWorkbench facilities={facilities} isCho={false} />;
}