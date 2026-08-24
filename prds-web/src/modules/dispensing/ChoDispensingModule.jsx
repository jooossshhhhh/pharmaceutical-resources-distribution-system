import { useEffect, useState } from "react";

import { getHealthCenterFacilities } from "../patients/PatientsService";
import DispensingLoadingSkeleton from "./DispensingLoadingSkeleton";
import DispensingWorkbench from "./DispensingWorkbench";

export default function ChoDispensingModule() {
  const [facilities, setFacilities] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadFacilities = async () => {
      try {
        const rows = await getHealthCenterFacilities();

        if (!cancelled) {
          setFacilities(rows);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load facilities.");
        }
      }
    };

    loadFacilities();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <DispensingLoadingSkeleton error={error} />;
  }

  if (facilities.length === 0) {
    return <DispensingLoadingSkeleton />;
  }

  return <DispensingWorkbench facilities={facilities} isCho />;
}