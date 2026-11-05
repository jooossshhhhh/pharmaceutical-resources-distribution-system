import { useEffect, useState, useMemo, useCallback, useContext, useRef } from "react";
import { getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { getDispensingHistory } from "@backend/services/dispensingService";
import { getRequestsData } from "@backend/services/requestsService";
import { fetchStockReturns } from "@backend/services/stockReturnsService";
import { fetchOtherPrograms } from "@backend/services/otherProgramsService";
import { useAuth } from "../../context/useAuth";
import ModalContainerContext from "@frontend/context/ModalContainerContext";
import { useNetworkStatus } from "@backend/sync/networkStatus";
import ReportModuleSkeleton from "./components/ReportModuleSkeleton";
import ReportHeader from "./components/ReportHeader";
import ReportSummaryCards from "./components/ReportSummaryCards";
import ReportCalendarWidget from "./components/ReportCalendarWidget";
import TopMedicinesChart from "./components/TopMedicinesChart";
import FacilityDistributionChart from "./components/FacilityDistributionChart";
import ReportScopeToggle from "./components/ReportScopeToggle";
import MonthYearSelector from "./components/MonthYearSelector";
import MonthlyReconciliationKpis from "./components/MonthlyReconciliationKpis";
import AreaProgramsAllocationPanel from "./components/AreaProgramsAllocationPanel";
import MonthlyInventoryLedgerTable from "./components/MonthlyInventoryLedgerTable";
import MonthlyDispensingDistributionChart from "./components/MonthlyDispensingDistributionChart";
import DailyHourlyFlowChart from "./components/DailyHourlyFlowChart";
import DailyDispensingLogTable from "./components/DailyDispensingLogTable";
import {
  calculateReportKpis,
  aggregateTopMedicines,
  aggregateFacilityDistribution,
  aggregateMonthlyDispensingDistribution,
  aggregateHourlyDispensingFlow,
  getDailyDispensingTransactions,
  formatReportDate,
} from "@shared/utils/reportUtils";
import {
  exportDailyRisExcel,
  exportMonthlyInventoryExcel,
  processMonthlyInventoryData,
} from "@shared/utils/reportExportUtils";
import { exportDetailedInventoryExcel } from "@shared/utils/inventoryDetailedExportUtils";

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

const enrichOtherProgramsRows = (rawPrograms = [], inventoryList = [], medicinesMap = new Map()) => {
  return (rawPrograms || []).map((prog) => {
    let rawMeds = prog.medicines;
    if (!Array.isArray(rawMeds) && prog.items) rawMeds = prog.items;
    if (!Array.isArray(rawMeds) && prog.data_json) {
      try {
        const parsed = typeof prog.data_json === "string" ? JSON.parse(prog.data_json) : prog.data_json;
        rawMeds = parsed?.medicines || parsed?.items || [];
      } catch {
        rawMeds = [];
      }
    }
    if (!Array.isArray(rawMeds)) rawMeds = [];

    return {
      ...prog,
      medicines: rawMeds.map((pm) => {
        const medId = String(pm.medicine_id || pm.medicine?.id || "");
        const catMed = medicinesMap.get(medId) || {};
        const candidates = (inventoryList || []).filter((inv) => String(inv.medicine_id) === medId);
        candidates.sort((a, b) => {
          const aCost = Number(a.unit_cost) > 0 ? 1 : 0;
          const bCost = Number(b.unit_cost) > 0 ? 1 : 0;
          if (aCost !== bCost) return bCost - aCost;
          const aQty = Number(a.quantity) > 0 ? 1 : 0;
          const bQty = Number(b.quantity) > 0 ? 1 : 0;
          if (aQty !== bQty) return bQty - aQty;
          return (a.expiration_date || "9999-99-99").localeCompare(b.expiration_date || "9999-99-99");
        });
        const invMatch = candidates[0];
        const unitCost = Number(pm.unit_cost ?? invMatch?.unit_cost ?? pm.medicine?.unit_cost ?? catMed.unit_cost ?? 0);
        const brandName = pm.brand_name || invMatch?.brand_name || catMed.brand_name || "";
        const batchNo = pm.batch_number || pm.lot_no || invMatch?.batch_number || invMatch?.lot_no || "";
        const expDate = pm.expiration_date || invMatch?.expiration_date || "";
        const unitOfMeasure = pm.unit_of_measure || invMatch?.unit_of_measure || catMed.unit_of_measure || "";

        return {
          ...pm,
          batch_number: batchNo,
          lot_no: batchNo,
          expiration_date: expDate,
          brand_name: brandName,
          unit_of_measure: unitOfMeasure,
          unit_cost: unitCost,
          medicine: {
            ...catMed,
            ...(pm.medicine || {}),
            brand_name: brandName,
            unit_cost: unitCost,
          },
        };
      }),
    };
  });
};

export default function ChoReportModule() {
  const { profile } = useAuth();
  const modalContext = useContext(ModalContainerContext);
  const isViewActive = modalContext?.isViewActive ?? true;
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
  const [otherProgramsRows, setOtherProgramsRows] = useState(() => {
    const raw = getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []);
    const meds = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    const inv = getSnapshot(STORAGE_KEYS.INVENTORY, []);
    const medsMap = new Map(meds.map((m) => [String(m.id), m]));
    return enrichOtherProgramsRows(raw, inv, medsMap);
  });
  const [inventoryRows, setInventoryRows] = useState(() => {
    const rawInv = getSnapshot(STORAGE_KEYS.INVENTORY, []);
    const meds = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    return enrichInventoryRows(rawInv, meds);
  });
  const [stockReturnsRows, setStockReturnsRows] = useState(() => getSnapshot(STORAGE_KEYS.STOCK_RETURNS, []));
  const [selectedFacilityId, setSelectedFacilityId] = useState("ALL");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [reportScope, setReportScope] = useState("daily"); // 'daily' | 'monthly'
  const [selectedPeriod, setSelectedPeriod] = useState(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  }));
  const [selectedProgramFilter, setSelectedProgramFilter] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const isOnline = useNetworkStatus();
  const hasExistingData = useMemo(() => {
    return (
      (inventoryRows && inventoryRows.length > 0) ||
      (dispensingRows && dispensingRows.length > 0) ||
      (requestRows && requestRows.length > 0) ||
      (otherProgramsRows && otherProgramsRows.length > 0) ||
      (stockReturnsRows && stockReturnsRows.length > 0)
    );
  }, [inventoryRows, dispensingRows, requestRows, otherProgramsRows, stockReturnsRows]);

  const [showSkeleton, setShowSkeleton] = useState(false);

  // Skeleton loading screen triggers ONLY when:
  // 1. Actively loading data from the network (isLoading)
  // 2. User has an active online internet connection (isOnline)
  // 3. There is NO data already available to display (!hasExistingData)
  // 4. Noticeable network lag persists past the debounce threshold (> 150ms)
  // If offline or data is already present, skeleton will not trigger.
  useEffect(() => {
    let timer;
    if (isLoading && isOnline && !hasExistingData) {
      timer = setTimeout(() => {
        setShowSkeleton(true);
      }, 150);
    } else {
      timer = setTimeout(() => {
        setShowSkeleton(false);
      }, 0);
    }
    return () => clearTimeout(timer);
  }, [isLoading, isOnline, hasExistingData]);

  // Fetch updated data from services with instant snapshot fallback
  useEffect(() => {
    let isMounted = true;

    async function loadReportData() {
      setIsLoading(true);
      try {
        const [dispensingRes, requestsDataRes, stockReturnsRes] = await Promise.allSettled([
          getDispensingHistory(),
          getRequestsData(),
          fetchStockReturns(),
        ]);

        if (isMounted) {
          if (stockReturnsRes.status === "fulfilled" && Array.isArray(stockReturnsRes.value)) {
            setStockReturnsRows(stockReturnsRes.value);
          }
          const medicinesSnapshot = getSnapshot(STORAGE_KEYS.MEDICINES, []);
          const medicinesMap = new Map(medicinesSnapshot.map((m) => [String(m.id), m]));

          let fetchedInventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
          if (requestsDataRes.status === "fulfilled" && requestsDataRes.value) {
            const {
              requests = [],
              facilities: fetchedFacilities = [],
              inventoryRows: invRows = [],
              medicines: fetchedMedicines = [],
            } = requestsDataRes.value;

            if (fetchedMedicines.length > 0) {
              fetchedMedicines.forEach((m) => medicinesMap.set(String(m.id), m));
            }

            if (fetchedFacilities.length > 0) {
              setFacilities(fetchedFacilities);
            }

            const medsList = Array.from(medicinesMap.values());
            if (Array.isArray(invRows) && invRows.length > 0) {
              fetchedInventory = invRows;
              setInventoryRows(enrichInventoryRows(fetchedInventory, medsList));
            } else {
              setInventoryRows(enrichInventoryRows(fetchedInventory, medsList));
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

              const invMatch =
                (r.inventory_id ? fetchedInventory.find((inv) => String(inv.id) === String(r.inventory_id)) : null) ||
                (r.batch_number ? fetchedInventory.find((inv) => (inv.batch_number || "").trim().toUpperCase() === (r.batch_number || "").trim().toUpperCase()) : null) ||
                (r.medicine_id ? fetchedInventory.find((inv) => String(inv.medicine_id) === String(r.medicine_id) && Number(inv.unit_cost) > 0) : null);

              const resolvedCost =
                Number(r.unit_cost_at_dispense) > 0
                  ? Number(r.unit_cost_at_dispense)
                  : Number(r.batch?.unit_cost) > 0
                  ? Number(r.batch.unit_cost)
                  : Number(invMatch?.unit_cost) > 0
                  ? Number(invMatch.unit_cost)
                  : Number(r.unit_cost) > 0
                  ? Number(r.unit_cost)
                  : Number(med.unit_cost ?? 0);

              return {
                ...r,
                unit_cost_at_dispense: resolvedCost,
                unit_cost: resolvedCost,
                medicine: {
                  ...med,
                  generic_name: med.generic_name || r.generic_name || invMatch?.medicine?.generic_name || "",
                  brand_name: med.brand_name || r.brand_name || invMatch?.brand_name || invMatch?.medicine?.brand_name || "",
                  dosage: med.dosage || r.dosage || invMatch?.dosage || invMatch?.medicine?.dosage || "",
                  unit_of_measure: med.unit_of_measure || r.unit_of_measure || invMatch?.unit_of_measure || invMatch?.medicine?.unit_of_measure || "",
                  unit_cost: resolvedCost,
                },
              };
            });
            setDispensingRows(enrichedDispensing);
          }

          try {
            const progData = await fetchOtherPrograms();
            if (progData && isMounted) {
              const enriched = enrichOtherProgramsRows(progData, fetchedInventory, medicinesMap);
              setOtherProgramsRows(enriched);
            }
          } catch (progErr) {
            console.warn("fetchOtherPrograms fallback in reports:", progErr);
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

  // Resilient, smooth refresh for Other Programs and Inventory without flickering loaders
  const refreshOtherProgramsAndInventory = useCallback(async () => {
    // 1. Immediately sync latest local snapshot for instant 0ms UI update
    const latestSnapshotProgs = getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []);
    const latestSnapshotInv = getSnapshot(STORAGE_KEYS.INVENTORY, []);
    const medicinesSnapshot = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    const medicinesMap = new Map(medicinesSnapshot.map((m) => [String(m.id), m]));
    const medsList = Array.from(medicinesMap.values());

    if (latestSnapshotProgs.length > 0) {
      const enrichedSnapshot = enrichOtherProgramsRows(latestSnapshotProgs, latestSnapshotInv, medicinesMap);
      setOtherProgramsRows(enrichedSnapshot);
    }
    if (latestSnapshotInv.length > 0) {
      setInventoryRows(enrichInventoryRows(latestSnapshotInv, medsList));
    }

    // 2. Smoothly fetch fresh data in background from server/SQLite
    try {
      const [progDataRes, requestsDataRes] = await Promise.allSettled([
        fetchOtherPrograms(),
        getRequestsData(),
      ]);

      let freshInventory = latestSnapshotInv;
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
        if (fetchedInventory.length > 0) {
          freshInventory = fetchedInventory;
          setInventoryRows(enrichInventoryRows(freshInventory, Array.from(medicinesMap.values())));
        }
        if (requests.length > 0) {
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
      }

      if (progDataRes.status === "fulfilled" && Array.isArray(progDataRes.value)) {
        const enrichedFresh = enrichOtherProgramsRows(progDataRes.value, freshInventory, medicinesMap);
        setOtherProgramsRows(enrichedFresh);
      }
    } catch (err) {
      console.warn("Smooth background refresh error in ChoReportModule:", err);
    }
  }, []);

  // Sync when Reports view becomes active again in keep-alive layout
  const prevIsViewActiveRef = useRef(isViewActive);
  useEffect(() => {
    let timer;
    if (isViewActive && !prevIsViewActiveRef.current) {
      timer = setTimeout(() => {
        refreshOtherProgramsAndInventory();
      }, 0);
    }
    prevIsViewActiveRef.current = isViewActive;
    return () => clearTimeout(timer);
  }, [isViewActive, refreshOtherProgramsAndInventory]);

  // Sync when switching to monthly tab or changing month/year period
  useEffect(() => {
    let timer;
    if (reportScope === "monthly") {
      timer = setTimeout(() => {
        refreshOtherProgramsAndInventory();
      }, 0);
    }
    return () => clearTimeout(timer);
  }, [reportScope, selectedPeriod.year, selectedPeriod.month, refreshOtherProgramsAndInventory]);

  // Listen to program completion/cancellation events and window focus
  useEffect(() => {
    const handleProgramChange = () => {
      refreshOtherProgramsAndInventory();
    };

    const handleInventoryChange = () => {
      refreshOtherProgramsAndInventory();
    };

    const handleWindowFocus = () => {
      if (reportScope === "monthly") {
        refreshOtherProgramsAndInventory();
      }
    };

    window.addEventListener("prds:other-programs-changed", handleProgramChange);
    window.addEventListener("prds:inventory-changed", handleInventoryChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.removeEventListener("prds:other-programs-changed", handleProgramChange);
      window.removeEventListener("prds:inventory-changed", handleInventoryChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [refreshOtherProgramsAndInventory, reportScope]);

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
    if (reportScope === "monthly") {
      return "Vicente Mendiola Center for Health (City Health Office)";
    }
    if (selectedFacility) {
      return selectedFacility.facility_name;
    }
    return "Vicente Mendiola Center for Health (City Health Office)";
  }, [selectedFacility, reportScope]);

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
      inventoryRows: filteredInventory,
      selectedDate,
      limit: 5,
    });
  }, [filteredDispensing, filteredRequests, filteredInventory, selectedDate]);

  const facilityDistribution = useMemo(() => {
    return aggregateFacilityDistribution({
      dispensingRows: filteredDispensing,
      requestRows: filteredRequests,
      selectedDate,
    });
  }, [filteredDispensing, filteredRequests, selectedDate]);

  const formattedSelectedDate = useMemo(() => {
    return formatReportDate(selectedDate);
  }, [selectedDate]);

  const hourlyFlow = useMemo(() => {
    return aggregateHourlyDispensingFlow({
      dispensingRows: filteredDispensing,
      requestRows: filteredRequests,
      inventoryRows: filteredInventory,
      selectedDate,
    });
  }, [filteredDispensing, filteredRequests, filteredInventory, selectedDate]);

  const dailyTransactions = useMemo(() => {
    return getDailyDispensingTransactions({
      dispensingRows: filteredDispensing,
      requestRows: filteredRequests,
      inventoryRows: filteredInventory,
      selectedDate,
    });
  }, [filteredDispensing, filteredRequests, filteredInventory, selectedDate]);

  // For Monthly Inventory Reconciliation, the statutory ledger represents the
  // City Health Office (CHO) central warehouse stock (Sole Source of Truth).
  // If choFacility is identified, scope to CHO warehouse rows; otherwise fallback to filteredInventory.
  const monthlyInventory = useMemo(() => {
    if (choFacility) {
      const choId = String(choFacility.id);
      const choRows = inventoryRows.filter((r) => String(r.facility_id || r.facility?.id || "") === choId);
      if (choRows.length > 0) return choRows;
    }
    return filteredInventory;
  }, [inventoryRows, choFacility, filteredInventory]);

  // Central warehouse walk-in dispensing for monthly statutory ledgers
  const choWarehouseDispensing = useMemo(() => {
    if (choFacility) {
      const choId = String(choFacility.id);
      return dispensingRows.filter((r) => !r.facility_id || String(r.facility_id || r.facility?.id || "") === choId);
    }
    return dispensingRows;
  }, [dispensingRows, choFacility]);

  // Central warehouse completed requests to barangays
  const choWarehouseRequests = useMemo(() => {
    return requestRows;
  }, [requestRows]);

  // Monthly Inventory Reconciliation Calculation
  const monthlyData = useMemo(() => {
    const res = processMonthlyInventoryData({
      inventoryRows: monthlyInventory,
      dispensingRows: choWarehouseDispensing,
      requestRows: choWarehouseRequests,
      otherProgramsRows,
      stockReturnsRows,
      facilities,
      year: selectedPeriod.year,
      month: selectedPeriod.month,
    });

    const targetMonthPrefix = `${selectedPeriod.year}-${String(selectedPeriod.month).padStart(2, "0")}`;
    const activeProgs = (otherProgramsRows || []).filter((p) => {
      if (p.status === "CANCELLED") return false;
      const pDate = p.program_date || p.completed_at || p.created_at || "";
      return String(pDate).startsWith(targetMonthPrefix);
    });

    let totalBegQty = 0;
    let totalAddQty = 0;
    let totalIssuedQty = 0;
    let totalProgQty = 0;
    let totalExpiredQty = 0;
    let totalRemQty = 0;

    res.items.forEach((item) => {
      totalBegQty += item.beginningQty || 0;
      totalAddQty += item.additionalQty || 0;
      totalIssuedQty += item.issuedQty || 0;
      totalProgQty += item.programQty || 0;
      totalExpiredQty += item.expiredQty || 0;
      totalRemQty += item.remainingQty || 0;
    });

    return {
      items: res.items,
      totals: {
        ...res.totals,
        totalBegQty,
        totalAddQty,
        totalIssuedQty,
        totalProgQty,
        totalExpiredQty,
        totalRemQty,
      },
      activeProgramCount: activeProgs.length,
    };
  }, [monthlyInventory, choWarehouseDispensing, choWarehouseRequests, otherProgramsRows, stockReturnsRows, facilities, selectedPeriod]);

  // Monthly Dispensing Distribution across the 3 workflows:
  // 1. Medicine Requests (Barangay Health Stations)
  // 2. Walk-in in the CHO (Direct Patient Dispensing)
  // 3. Other Programs (Special Area Allocations & Health Missions)
  const monthlyDistribution = useMemo(() => {
    return aggregateMonthlyDispensingDistribution({
      dispensingRows: choWarehouseDispensing,
      requestRows: choWarehouseRequests,
      otherProgramsRows,
      inventoryRows: monthlyInventory,
      year: selectedPeriod.year,
      month: selectedPeriod.month,
    });
  }, [choWarehouseDispensing, choWarehouseRequests, otherProgramsRows, monthlyInventory, selectedPeriod]);

  // Export handlers
  const handleExportRis = async () => {
    setIsExporting(true);
    try {
      await exportDailyRisExcel({
        dispensingRows: filteredDispensing,
        requestRows: filteredRequests,
        selectedDate,
        facilityName: isChoSelected || selectedFacilityId === "ALL" ? "VICENTE MENDIOLA CENTER FOR HEALTH" : selectedFacility?.facility_name,
        facilityId: isChoSelected ? choFacility?.id : (selectedFacilityId !== "ALL" ? selectedFacilityId : null),
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
      const latestSnapshotProgs = getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []);
      const mergedProgs = [...otherProgramsRows];
      const existingProgIds = new Set(otherProgramsRows.map((p) => String(p.id)));
      latestSnapshotProgs.forEach((p) => {
        if (!existingProgIds.has(String(p.id))) {
          mergedProgs.push(p);
        }
      });

      await exportMonthlyInventoryExcel({
        inventoryRows: monthlyInventory,
        dispensingRows: choWarehouseDispensing,
        requestRows: choWarehouseRequests,
        otherProgramsRows: mergedProgs,
        stockReturnsRows,
        facilities,
        year: selectedPeriod.year,
        month: selectedPeriod.month,
        facilityName: "VMCH MEDICINE SUPPLIES",
        pharmacistName: profile?.full_name || "ROSEMIE ANN GETUTUA",
        choDoctorName: "DR. CAMILLE F. PENALOSA",
      });
    } catch (err) {
      console.error("Export Monthly Inventory failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportDetailedInventory = async () => {
    setIsExporting(true);
    try {
      const today = new Date();
      let mode = "recent";
      let expYear = selectedPeriod.year;
      let expMonth = selectedPeriod.month;
      let expDate = today;

      const isPastMonth =
        selectedPeriod.year < today.getFullYear() ||
        (selectedPeriod.year === today.getFullYear() && selectedPeriod.month < today.getMonth() + 1);

      if (isPastMonth) {
        mode = "monthly";
        expYear = selectedPeriod.year;
        expMonth = selectedPeriod.month;
        expDate = new Date(selectedPeriod.year, selectedPeriod.month - 1, 1);
      } else {
        // Current month (e.g. November): use recent template addressing "as of [today]"
        mode = "recent";
        expYear = today.getFullYear();
        expMonth = today.getMonth() + 1;
        expDate = today;
      }

      const latestSnapshotProgs = getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []);
      const mergedProgs = [...otherProgramsRows];
      const existingProgIds = new Set(otherProgramsRows.map((p) => String(p.id)));
      latestSnapshotProgs.forEach((p) => {
        if (!existingProgIds.has(String(p.id))) {
          mergedProgs.push(p);
        }
      });

      await exportDetailedInventoryExcel({
        inventoryRows: monthlyInventory,
        dispensingRows: choWarehouseDispensing,
        requestRows: choWarehouseRequests,
        stockReturnsRows,
        otherProgramsRows: mergedProgs,
        facilities,
        medicines: getSnapshot(STORAGE_KEYS.MEDICINES, []),
        mode,
        selectedDate: expDate,
        year: expYear,
        month: expMonth,
      });
    } catch (err) {
      console.error("Export Detailed Inventory failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  if (showSkeleton) {
    return <ReportModuleSkeleton scope={reportScope} />;
  }

  return (
    <div className="space-y-4.5 p-1 max-w-[1400px] mx-auto">
      {/* Top Header */}
      <ReportHeader
        facilities={facilities}
        selectedFacilityId={selectedFacilityId}
        onSelectFacility={setSelectedFacilityId}
        selectedDate={selectedDate}
        reportScope={reportScope}
        selectedPeriod={selectedPeriod}
        facilityName={headerFacilityName}
        onExportRis={handleExportRis}
        onExportInventory={handleExportInventory}
        onExportDetailedInventory={handleExportDetailedInventory}
        isExporting={isExporting}
      />

      {/* Scope Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <ReportScopeToggle
          scope={reportScope}
          onScopeChange={(newScope) => {
            setReportScope(newScope);
            setSelectedProgramFilter(null);
          }}
        />
      </div>

      {reportScope === "daily" ? (
        <>
          {/* Daily Mode: 4 KPI Cards + Clean Minimalist Calendar */}
          <div className="flex flex-col lg:flex-row gap-3.5 items-stretch">
            <ReportSummaryCards kpis={kpis} />
            <ReportCalendarWidget
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </div>

          {/* Analytics Row: Hourly Dispensing Rush Hours + Facility Allocations */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
            <div className="lg:col-span-7">
              <DailyHourlyFlowChart
                flowData={hourlyFlow}
                formattedDate={formattedSelectedDate}
              />
            </div>
            <div className="lg:col-span-5">
              <FacilityDistributionChart data={facilityDistribution} />
            </div>
          </div>

          {/* Top 5 Medicines Dispensed Today */}
          <div>
            <TopMedicinesChart data={topMedicines} />
          </div>

          {/* Today's Dispensing & Issuance Transaction Log Table */}
          <div>
            <DailyDispensingLogTable
              transactions={dailyTransactions}
              formattedDate={formattedSelectedDate}
            />
          </div>
        </>
      ) : (
        <>
          {/* Monthly Mode: Month/Year Period Controller */}
          <MonthYearSelector
            year={selectedPeriod.year}
            month={selectedPeriod.month}
            onChangePeriod={setSelectedPeriod}
          />

          {/* 6-Stage Inventory Reconciliation KPIs */}
          <MonthlyReconciliationKpis monthlyData={monthlyData} />

          {/* Monthly Dispensing Distribution Chart (3 Workflows: Medicine Requests, Walk-in in the CHO, Other Programs) */}
          <MonthlyDispensingDistributionChart
            data={monthlyDistribution}
            monthName={new Intl.DateTimeFormat("en-US", { month: "long" }).format(
              new Date(selectedPeriod.year, selectedPeriod.month - 1, 1)
            )}
            year={selectedPeriod.year}
          />

          {/* Area / Health Programs Allocation Panel */}
          <AreaProgramsAllocationPanel
            otherPrograms={otherProgramsRows}
            year={selectedPeriod.year}
            month={selectedPeriod.month}
            selectedProgramFilter={selectedProgramFilter}
            onSelectProgramFilter={setSelectedProgramFilter}
            medicines={getSnapshot(STORAGE_KEYS.MEDICINES, [])}
          />

          {/* Interactive On-Screen Monthly Inventory Ledger Table */}
          <MonthlyInventoryLedgerTable
            items={monthlyData.items}
            totals={monthlyData.totals}
            selectedProgramFilter={selectedProgramFilter}
            onClearProgramFilter={() => setSelectedProgramFilter(null)}
            onExportExcel={handleExportInventory}
            isExporting={isExporting}
            year={selectedPeriod.year}
            month={selectedPeriod.month}
          />
        </>
      )}
    </div>
  );
}
