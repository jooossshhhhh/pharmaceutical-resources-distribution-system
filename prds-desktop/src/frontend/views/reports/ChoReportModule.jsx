import { useEffect, useState, useMemo } from "react";
import { getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { getDispensingHistory } from "@backend/services/dispensingService";
import { getRequestsData } from "@backend/services/requestsService";
import { supabase } from "@backend/client/supabase";
import { useAuth } from "../../context/useAuth";
import ReportHeader from "./components/ReportHeader";
import ReportSummaryCards from "./components/ReportSummaryCards";
import ReportCalendarWidget from "./components/ReportCalendarWidget";
import TopMedicinesChart from "./components/TopMedicinesChart";
import FacilityDistributionChart from "./components/FacilityDistributionChart";
import DailyTrendChart from "./components/DailyTrendChart";
import {
  calculateReportKpis,
  aggregateTopMedicines,
  aggregateFacilityDistribution,
  aggregateDailyDispensingTrend,
} from "@shared/utils/reportUtils";
import {
  exportDailyRisExcel,
  exportMonthlyInventoryExcel,
} from "@shared/utils/reportExportUtils";

const enrichInventoryRows = (rawInventory = [], medicinesList = []) => {
  const map = new Map((medicinesList || []).map((m) => [String(m.id), m]));
  return (rawInventory || []).map((item) => {
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

export default function ChoReportModule() {
  const { profile } = useAuth();
  const [facilities, setFacilities] = useState(() => getSnapshot(STORAGE_KEYS.FACILITIES, []));
  const [dispensingRows, setDispensingRows] = useState(() => {
    const rows = getSnapshot(STORAGE_KEYS.DISPENSING, []);
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
    const rows = getSnapshot(STORAGE_KEYS.REQUESTS, []).filter((r) => r.status === "COMPLETED");
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
  const [otherProgramsRows, setOtherProgramsRows] = useState(() => getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []));
  const [inventoryRows, setInventoryRows] = useState(() => {
    const rawInv = getSnapshot(STORAGE_KEYS.INVENTORY, []);
    const meds = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    return enrichInventoryRows(rawInv, meds);
  });
  const [selectedFacilityId, setSelectedFacilityId] = useState("ALL");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch updated data from services with instant snapshot fallback
  useEffect(() => {
    let isMounted = true;

    async function loadReportData() {
      setIsLoading(true);
      try {
        const [dispensingRes, requestsDataRes] = await Promise.allSettled([
          getDispensingHistory(),
          getRequestsData(),
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

            if (fetchedMedicines.length > 0) {
              fetchedMedicines.forEach((m) => medicinesMap.set(String(m.id), m));
            }

            if (fetchedFacilities.length > 0) {
              setFacilities(fetchedFacilities);
            }

            const medsList = Array.from(medicinesMap.values());
            if (fetchedInventory.length > 0) {
              setInventoryRows(enrichInventoryRows(fetchedInventory, medsList));
            } else {
              const currentInv = getSnapshot(STORAGE_KEYS.INVENTORY, []);
              setInventoryRows(enrichInventoryRows(currentInv, medsList));
            }

            const completedRequests = requests
              .filter((r) => r.status === "COMPLETED")
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

          if (supabase) {
            try {
              const { data: progData } = await supabase.from("other_programs").select(`
                id, facility_id, program_name, program_date, description, status, completed_at, cancelled_at,
                medicines:program_medicines(
                  id, medicine_id, quantity_used,
                  medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure)
                )
              `);
              if (progData && isMounted) {
                setOtherProgramsRows(progData);
              }
            } catch {
              // fallback remains active
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load report data from services, utilizing local snapshot:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadReportData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Determine if selected facility is CHO
  const choFacility = useMemo(() => {
    return facilities.find((f) => f.facility_type === "CHO") || null;
  }, [facilities]);

  const isChoSelected = useMemo(() => {
    if (selectedFacilityId === "ALL") return false;
    return choFacility && choFacility.id === selectedFacilityId;
  }, [choFacility, selectedFacilityId]);

  // Filter rows based on facility dropdown selection
  const selectedFacility = useMemo(() => {
    return facilities.find((f) => String(f.id) === String(selectedFacilityId));
  }, [facilities, selectedFacilityId]);

  const headerFacilityName = useMemo(() => {
    if (selectedFacility) {
      return selectedFacility.facility_name;
    }
    return "Vicente Mendiola Center for Health (City Health Office)";
  }, [selectedFacility]);

  const filteredDispensing = useMemo(() => {
    if (selectedFacilityId === "ALL") return dispensingRows;
    return dispensingRows.filter((r) => {
      const facId = String(r.facility_id || r.facility?.id || "");
      return facId === String(selectedFacilityId);
    });
  }, [dispensingRows, selectedFacilityId]);

  const filteredRequests = useMemo(() => {
    if (selectedFacilityId === "ALL" || isChoSelected) {
      // CHO oversees all completed barangay distribution
      return requestRows;
    }
    return requestRows.filter((r) => {
      const facId = String(r.facility_id || r.facility?.id || "");
      return facId === String(selectedFacilityId);
    });
  }, [requestRows, selectedFacilityId, isChoSelected]);

  const filteredInventory = useMemo(() => {
    if (selectedFacilityId === "ALL") return inventoryRows;
    return inventoryRows.filter((r) => {
      const facId = String(r.facility_id || r.facility?.id || "");
      return facId === String(selectedFacilityId);
    });
  }, [inventoryRows, selectedFacilityId]);

  // Calculations
  const kpis = useMemo(() => {
    return calculateReportKpis({
      dispensingRows: filteredDispensing,
      requestRows: filteredRequests,
      inventoryRows: filteredInventory,
      selectedDate,
    });
  }, [filteredDispensing, filteredRequests, filteredInventory, selectedDate]);

  const topMedicines = useMemo(() => {
    return aggregateTopMedicines({
      dispensingRows: filteredDispensing,
      requestRows: filteredRequests,
      selectedDate,
      limit: 5,
    });
  }, [filteredDispensing, filteredRequests, selectedDate]);

  const facilityDistribution = useMemo(() => {
    return aggregateFacilityDistribution({
      dispensingRows: filteredDispensing,
      requestRows: filteredRequests,
      selectedDate,
    });
  }, [filteredDispensing, filteredRequests, selectedDate]);

  const dailyTrend = useMemo(() => {
    return aggregateDailyDispensingTrend({
      dispensingRows: filteredDispensing,
      requestRows: filteredRequests,
      year: selectedDate.getFullYear(),
      month: selectedDate.getMonth() + 1,
    });
  }, [filteredDispensing, filteredRequests, selectedDate]);

  const monthName = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", { month: "long" }).format(selectedDate);
  }, [selectedDate]);

  // Export handlers
  const handleExportRis = async () => {
    setIsExporting(true);
    try {
      await exportDailyRisExcel({
        dispensingRows: filteredDispensing,
        requestRows: filteredRequests,
        selectedDate,
      });
    } catch (err) {
      console.error("Export RIS failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportInventory = async () => {
    setIsExporting(true);
    try {
      await exportMonthlyInventoryExcel({
        inventoryRows: filteredInventory,
        dispensingRows: filteredDispensing,
        requestRows: filteredRequests,
        otherProgramsRows,
        year: selectedDate.getFullYear(),
        month: selectedDate.getMonth() + 1,
        facilityName: headerFacilityName,
        pharmacistName: profile?.full_name || "ROSEMIE ANN GETUTUA",
        choDoctorName: "DR. CAMILLE F. PENALOSA",
      });
    } catch (err) {
      console.error("Export Monthly Inventory failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading && dispensingRows.length === 0 && inventoryRows.length === 0) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
          <span className="text-xs font-medium text-[#42474e]">Loading reports & analytics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4.5 p-1 max-w-[1400px] mx-auto">
      {/* Top Header */}
      <ReportHeader
        facilities={facilities}
        selectedFacilityId={selectedFacilityId}
        onSelectFacility={setSelectedFacilityId}
        selectedDate={selectedDate}
        facilityName={headerFacilityName}
        onExportRis={handleExportRis}
        onExportInventory={handleExportInventory}
        isExporting={isExporting}
      />

      {/* Top Row: 4 KPI Cards + Clean Minimalist Calendar */}
      <div className="flex flex-col lg:flex-row gap-3.5 items-stretch">
        <ReportSummaryCards kpis={kpis} />
        <ReportCalendarWidget
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      </div>

      {/* Middle Row: Top Medicines Bar Chart + Facility Distribution Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        <div className="lg:col-span-7">
          <TopMedicinesChart data={topMedicines} />
        </div>
        <div className="lg:col-span-5">
          <FacilityDistributionChart data={facilityDistribution} />
        </div>
      </div>

      {/* Bottom Row: Daily Dispensing Trend across the month */}
      <div>
        <DailyTrendChart data={dailyTrend} monthName={monthName} />
      </div>
    </div>
  );
}
