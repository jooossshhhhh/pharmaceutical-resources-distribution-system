import { useEffect, useState, useMemo } from "react";
import { getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { getDispensingHistory } from "@backend/services/dispensingService";
import { getRequestsData } from "@backend/services/requestsService";
import { useAuth } from "../../context/useAuth";
import ReportHeader from "./components/ReportHeader";
import ReportSummaryCards from "./components/ReportSummaryCards";
import ReportCalendarWidget from "./components/ReportCalendarWidget";
import TopMedicinesChart from "./components/TopMedicinesChart";
import DailyTrendChart from "./components/DailyTrendChart";
import {
  calculateReportKpis,
  aggregateTopMedicines,
  aggregateDailyDispensingTrend,
} from "@shared/utils/reportUtils";
import { exportDailyRisExcel } from "@shared/utils/reportExportUtils";

const enrichInventoryRows = (rawInventory = [], medicinesList = [], facId = null) => {
  const map = new Map((medicinesList || []).map((m) => [String(m.id), m]));
  return (rawInventory || [])
    .filter((r) => !facId || String(r.facility_id || r.facility?.id || "") === String(facId))
    .map((item) => {
      const med = item.medicine || (item.medicine_id ? map.get(String(item.medicine_id)) : null) || {};
      const unitCost = Number(med.unit_cost ?? item.unit_cost ?? 0);
      return {
        ...item,
        medicine: {
          ...med,
          generic_name: med.generic_name || item.generic_name || "",
          brand_name: med.brand_name || item.brand_name || "",
          dosage: med.dosage || item.dosage || "",
          unit_of_measure: med.unit_of_measure || item.unit_of_measure || "",
          unit_cost: unitCost,
        },
        unit_cost: unitCost,
      };
    });
};

export default function BhwReportModule() {
  const { profile } = useAuth();
  const facilityId = profile?.facility_id;

  const [dispensingRows, setDispensingRows] = useState(() => {
    const rows = getSnapshot(STORAGE_KEYS.DISPENSING, []).filter(
      (r) => !facilityId || String(r.facility_id) === String(facilityId)
    );
    const meds = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    const map = new Map(meds.map((m) => [String(m.id), m]));
    return rows.map((r) => {
      const med = r.medicine || (r.medicine_id ? map.get(String(r.medicine_id)) : null) || {};
      return {
        ...r,
        medicine: {
          ...med,
          generic_name: med.generic_name || r.generic_name || "",
          brand_name: med.brand_name || r.brand_name || "",
          dosage: med.dosage || r.dosage || "",
          unit_of_measure: med.unit_of_measure || r.unit_of_measure || "",
          unit_cost: Number(med.unit_cost ?? r.unit_cost ?? 0),
        },
      };
    });
  });
  const [requestRows, setRequestRows] = useState(() => {
    const rows = getSnapshot(STORAGE_KEYS.REQUESTS, []).filter(
      (r) => r.status === "COMPLETED" && (!facilityId || String(r.facility_id) === String(facilityId))
    );
    const meds = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    const map = new Map(meds.map((m) => [String(m.id), m]));
    return rows.map((req) => ({
      ...req,
      items: (req.items || []).map((item) => {
        const med = item.medicine || (item.medicine_id ? map.get(String(item.medicine_id)) : null) || {};
        return {
          ...item,
          medicine: {
            ...med,
            generic_name: med.generic_name || item.generic_name || "",
            brand_name: med.brand_name || item.brand_name || "",
            dosage: med.dosage || item.dosage || "",
            unit_of_measure: med.unit_of_measure || item.unit_of_measure || "",
            unit_cost: Number(med.unit_cost ?? item.unit_cost ?? 0),
          },
        };
      }),
    }));
  });
  const [inventoryRows, setInventoryRows] = useState(() => {
    const raw = getSnapshot(STORAGE_KEYS.INVENTORY, []);
    const meds = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    return enrichInventoryRows(raw, meds, facilityId);
  });
  const [facilityName, setFacilityName] = useState(
    profile?.facility?.facility_name || profile?.facility_name || "Barangay Health Center"
  );
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadBhwData() {
      if (!facilityId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const [dispensingRes, requestsDataRes] = await Promise.allSettled([
          getDispensingHistory({ facilityId }),
          getRequestsData({ facilityId }),
        ]);

        if (isMounted) {
          const medicinesSnapshot = getSnapshot(STORAGE_KEYS.MEDICINES, []);
          const medicinesMap = new Map(medicinesSnapshot.map((m) => [String(m.id), m]));

          if (requestsDataRes.status === "fulfilled" && requestsDataRes.value) {
            const {
              requests = [],
              facilities: fetchedFacilities = [],
              inventoryRows: fetchedInventory = [],
              medicines: fetchedMedicines = [],
            } = requestsDataRes.value;

            const currentFacility = fetchedFacilities.find((f) => String(f.id) === String(facilityId));
            if (currentFacility?.facility_name) {
              setFacilityName(currentFacility.facility_name);
            }

            if (fetchedMedicines.length > 0) {
              fetchedMedicines.forEach((m) => medicinesMap.set(String(m.id), m));
            }

            const medsList = Array.from(medicinesMap.values());
            if (fetchedInventory.length > 0) {
              setInventoryRows(enrichInventoryRows(fetchedInventory, medsList, facilityId));
            } else {
              const currentInv = getSnapshot(STORAGE_KEYS.INVENTORY, []);
              setInventoryRows(enrichInventoryRows(currentInv, medsList, facilityId));
            }

            const completedRequests = requests
              .filter(
                (r) =>
                  r.status === "COMPLETED" &&
                  (!facilityId || String(r.facility_id) === String(facilityId))
              )
              .map((req) => ({
                ...req,
                items: (req.items || []).map((item) => {
                  const med =
                    item.medicine ||
                    (item.medicine_id ? medicinesMap.get(String(item.medicine_id)) : null) ||
                    {};
                  return {
                    ...item,
                    medicine: {
                      ...med,
                      generic_name: med.generic_name || item.generic_name || "",
                      brand_name: med.brand_name || item.brand_name || "",
                      dosage: med.dosage || item.dosage || "",
                      unit_of_measure: med.unit_of_measure || item.unit_of_measure || "",
                      unit_cost: Number(med.unit_cost ?? item.unit_cost ?? 0),
                    },
                  };
                }),
              }));

            setRequestRows(completedRequests);
          }

          if (dispensingRes.status === "fulfilled" && Array.isArray(dispensingRes.value)) {
            const enrichedDispensing = dispensingRes.value.map((r) => {
              const med =
                r.medicine ||
                (r.medicine_id ? medicinesMap.get(String(r.medicine_id)) : null) ||
                {};
              return {
                ...r,
                medicine: {
                  ...med,
                  generic_name: med.generic_name || r.generic_name || "",
                  brand_name: med.brand_name || r.brand_name || "",
                  dosage: med.dosage || r.dosage || "",
                  unit_of_measure: med.unit_of_measure || r.unit_of_measure || "",
                  unit_cost: Number(med.unit_cost ?? r.unit_cost ?? 0),
                },
              };
            });
            setDispensingRows(enrichedDispensing);
          }
        }
      } catch (err) {
        console.warn("Failed to load BHW report data, using snapshot fallback:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadBhwData();

    return () => {
      isMounted = false;
    };
  }, [facilityId]);

  const kpis = useMemo(() => {
    return calculateReportKpis({
      dispensingRows,
      requestRows,
      inventoryRows,
      selectedDate,
    });
  }, [dispensingRows, requestRows, inventoryRows, selectedDate]);

  const topMedicines = useMemo(() => {
    return aggregateTopMedicines({
      dispensingRows,
      requestRows,
      selectedDate,
      limit: 6,
    });
  }, [dispensingRows, requestRows, selectedDate]);

  const dailyTrend = useMemo(() => {
    return aggregateDailyDispensingTrend({
      dispensingRows,
      requestRows,
      year: selectedDate.getFullYear(),
      month: selectedDate.getMonth() + 1,
    });
  }, [dispensingRows, requestRows, selectedDate]);

  const monthName = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", { month: "long" }).format(selectedDate);
  }, [selectedDate]);

  const handleExportRis = async () => {
    setIsExporting(true);
    try {
      await exportDailyRisExcel({
        dispensingRows,
        requestRows,
        selectedDate,
      });
    } catch (err) {
      console.error("Export RIS failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4.5 p-1 max-w-[1400px] mx-auto">
      <ReportHeader
        isBhw={true}
        facilityName={facilityName}
        selectedDate={selectedDate}
        onExportRis={handleExportRis}
        isExporting={isExporting}
      />

      <div className="flex flex-col lg:flex-row gap-3.5 items-stretch">
        <ReportSummaryCards kpis={kpis} />
        <ReportCalendarWidget
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5">
        <TopMedicinesChart data={topMedicines} />
        <DailyTrendChart data={dailyTrend} monthName={monthName} />
      </div>
    </div>
  );
}
