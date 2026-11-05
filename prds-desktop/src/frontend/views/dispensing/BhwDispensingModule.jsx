import { useEffect, useState } from "react";

import { useAuth } from "../../context/useAuth";
import { supabase } from "@backend/client/supabase";
import { getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { getSqliteDb, isTauriEnvironment } from "@backend/database/sqliteClient";
import DispensingLoadingSkeleton from "./DispensingLoadingSkeleton";
import DispensingWorkbench from "./DispensingWorkbench";

export default function BhwDispensingModule() {
  const { profile } = useAuth();
  const profileFacilityId = profile?.facility_id || profile?.facility?.id || null;
  const [facilities, setFacilities] = useState(() => {
    if (profile?.facility?.id) return [profile.facility];
    if (!profileFacilityId) return [];
    const cached = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    const match = (cached || []).find((f) => String(f.id) === String(profileFacilityId));
    return match ? [match] : [{ id: profileFacilityId }];
  });
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadOwnFacility = async () => {
      if (!profileFacilityId) {
        setError("Your account is not assigned to a facility.");
        return;
      }

      setError("");

      if (profile?.facility?.id && !cancelled) {
        setFacilities([profile.facility]);
      } else {
        const cached = getSnapshot(STORAGE_KEYS.FACILITIES, []);
        const cachedMatch = (cached || []).find((f) => String(f.id) === String(profileFacilityId));
        if (cachedMatch && !cancelled) {
          setFacilities([cachedMatch]);
        } else if (isTauriEnvironment()) {
          try {
            const db = await getSqliteDb();
            const rows = await db.select("SELECT * FROM facilities WHERE id = ?", [profileFacilityId]);
            if (!cancelled && Array.isArray(rows) && rows.length > 0) {
              setFacilities([rows[0]]);
            }
          } catch {}
        }
      }

      try {
        const { data, error: facilityError } = await supabase
          .from("facilities")
          .select("id, facility_name, facility_code")
          .eq("id", profileFacilityId)
          .single();

        if (!facilityError && data && !cancelled) {
          setFacilities([data]);
        }
      } catch {
        // Local facility fallback already resolved above
      }
    };

    const timerId = window.setTimeout(() => {
      loadOwnFacility();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [profileFacilityId, profile?.facility]);

  if (error) {
    return <DispensingLoadingSkeleton error={error} />;
  }

  if (facilities.length === 0 && !profileFacilityId) {
    return <DispensingLoadingSkeleton />;
  }

  return <DispensingWorkbench />;
}
