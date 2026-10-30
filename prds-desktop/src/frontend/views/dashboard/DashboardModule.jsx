import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Package,
  Pill,
  RefreshCw,
  Users,
} from "lucide-react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { supabase } from "@backend/client/supabase";
import { saveSnapshot, getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { isCurrentNetworkOnline, setNetworkOnlineState, useNetworkStatus } from "@backend/sync/networkStatus";
import { fetchAllRows, getFriendlyDashboardErrorMessage } from "@backend/sync/syncUtils";
import EmptyState from "./components/EmptyState";
import ForecastMapPreview from "./components/ForecastMapPreview";
import Panel from "./components/Panel";
import RequestStatusChart from "./components/RequestStatusChart";
import StatCard from "./components/StatCard";
import DailyTrendChart from "../reports/components/DailyTrendChart";
import TopMedicinesChart from "../reports/components/TopMedicinesChart";
import FacilityDistributionChart from "../reports/components/FacilityDistributionChart";
import ForecastPreviewPanel from "./components/ForecastPreviewPanel";
import {
  aggregateDailyDispensingTrend,
  aggregateFacilityDistribution,
  aggregateTopMedicines,
} from "@shared/utils/reportUtils";
import { buildForecastAnalytics } from "@shared/utils/forecastingUtils";
import {
  buildFacilityDemand,
  buildFacilityStockStatus,
  compileDashboardSnapshot,
  emptyStats,
  formatDateTime,
  formatNumber,
  getDashboardInventoryMetrics,
  getDashboardLayoutGroups,
  getDashboardRoleConfig,
  getDashboardStatCards,
  getDashboardStockAlertRows,
  getMonthlyDispensedQuantity,
  getStockStatus,
} from "@shared/utils/dashboardUtils";
import { formatFacilityName } from "@shared/utils/facilityFormat";
import { reconcileConfirmedReturnsIntoInventory } from "@backend/services/stockReturnsService";

const defaultRequestStatus = {
  APPROVED: 0,
  PENDING: 0,
  DISPENSED: 0,
  REJECTED: 0,
};

const statusClass = {
  APPROVED: "bg-[#E2F3EC] text-[#226048] border border-[#4C9F80]/20",
  COMPLETED: "bg-[#E2F3EC] text-[#226048] border border-[#4C9F80]/20",
  DISPENSED: "bg-[#E2F3EC] text-[#226048] border border-[#4C9F80]/20",
  PENDING: "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/25",
  REJECTED: "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/30",
};

const getStatIcon = (key) => {
  const iconByKey = {
    stockedBatches: <Package className="h-4 w-4" />,
    dispensedThisMonth: <Pill className="h-4 w-4" />,
    activePatients: <Users className="h-4 w-4" />,
    pendingRequests: <Clock className="h-4 w-4" />,
    criticalStock: <AlertCircle className="h-4 w-4" />,
    lowStock: <AlertTriangle className="h-4 w-4" />,
  };

  return iconByKey[key] || <Clock className="h-4 w-4" />;
};

const getDisplayValue = (value) => {
  return typeof value === "number" ? formatNumber(value) : (value ?? "-");
};

const getCachedDashboardStats = (snapshot) => {
  if (!snapshot) return emptyStats;
  const cachedStats = snapshot.stats || {};
  return {
    ...emptyStats,
    ...cachedStats,
    ...getDashboardInventoryMetrics(snapshot.inventoryRows || []),
    dispensedThisMonth: cachedStats.dispensedThisMonth ?? null,
    activePatients: cachedStats.activePatients ?? null,
  };
};

const formatRequestStatus = (status) => {
  if (status === "COMPLETED") {
    return "Dispensed";
  }

  return status?.charAt(0) + status?.slice(1).toLowerCase();
};

const daysUntil = (dateString) => {
  if (!dateString) {
    return null;
  }

  return Math.ceil((new Date(dateString) - new Date()) / 86400000);
};

const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const expiringTone = (days) => {
  if (days == null) {
    return "bg-[#E5EFF1] text-[#5B7077]";
  }

  if (days <= 30) {
    return "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/25";
  }

  if (days <= 60) {
    return "bg-[#E3EEF5] text-[#1F4A66] border border-[#34769B]/25";
  }

  return "bg-[#E5EFF1] text-[#5B7077]";
};

export default function DashboardModule() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isOffline = !useNetworkStatus();
  const isBhw = profile?.role === "BHW";
  const myFacilityId = profile?.facility_id || null;
  const inventoryPath = isBhw ? "/inventory-bhw" : "/inventory";

  const cachedDashboard = useMemo(() => {
    const direct = getSnapshot(STORAGE_KEYS.DASHBOARD, null);
    if (direct?.stats && (!isBhw || direct.facilityId === myFacilityId)) {
      return direct;
    }
    return compileDashboardSnapshot({
      inventory: getSnapshot(STORAGE_KEYS.INVENTORY, []) || [],
      facilities: getSnapshot(STORAGE_KEYS.FACILITIES, []) || [],
      patients: getSnapshot(STORAGE_KEYS.PATIENTS, []) || [],
      requests: getSnapshot(STORAGE_KEYS.REQUESTS, []) || [],
      dispensing: getSnapshot(STORAGE_KEYS.DISPENSING, []) || [],
      forecasting: getSnapshot(STORAGE_KEYS.FORECASTING, []) || [],
      users: getSnapshot(STORAGE_KEYS.USERS, []) || [],
      facilityId: myFacilityId,
      role: profile?.role,
    });
  }, [isBhw, myFacilityId, profile?.role]);

  const [stats, setStats] = useState(() => getCachedDashboardStats(cachedDashboard));
  const [facilities, setFacilities] = useState(() => cachedDashboard?.facilities || []);
  const [forecastRows, setForecastRows] = useState(() => cachedDashboard?.forecastRows || []);
  const [recentRequests, setRecentRequests] = useState(() => cachedDashboard?.recentRequests || []);
  const [stockAlertRows, setStockAlertRows] = useState(() => cachedDashboard?.stockAlertRows || cachedDashboard?.lowStockRows || []);
  const [expiringRows, setExpiringRows] = useState(() => cachedDashboard?.expiringRows || []);
  const [dispensingRows, setDispensingRows] = useState(() => cachedDashboard?.dispensingRows || []);
  const [rawDispensing, setRawDispensing] = useState(() => cachedDashboard?.rawDispensing || getSnapshot(STORAGE_KEYS.DISPENSING, []) || []);
  const [allRequests, setAllRequests] = useState(() => cachedDashboard?.allRequests || getSnapshot(STORAGE_KEYS.REQUESTS, []) || []);
  const [requestStatus, setRequestStatus] = useState(() => cachedDashboard?.requestStatus || defaultRequestStatus);
  const [stockStatusByFacility, setStockStatusByFacility] = useState(() => cachedDashboard?.stockStatusByFacility || {});
  const [inventoryRows, setInventoryRows] = useState(() => cachedDashboard?.inventoryRows || []);
  const [demandByFacility, setDemandByFacility] = useState(() => cachedDashboard?.demandByFacility || {});
  const [isLoading, setIsLoading] = useState(() => !cachedDashboard);
  const [dashboardError, setDashboardError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => cachedDashboard?.refreshedAt || null);

  const currentMonthName = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date());
  }, []);

  const dailyTrendData = useMemo(() => {
    const now = new Date();
    return aggregateDailyDispensingTrend({
      dispensingRows: rawDispensing,
      requestRows: allRequests,
      inventoryRows,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    });
  }, [rawDispensing, allRequests, inventoryRows]);

  const topMedicinesData = useMemo(() => {
    const now = new Date();
    return aggregateTopMedicines({
      dispensingRows: rawDispensing,
      requestRows: allRequests,
      inventoryRows,
      monthScope: true,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      limit: 5,
    });
  }, [rawDispensing, allRequests, inventoryRows]);

  const forecastPreviewData = useMemo(() => {
    const summaryMap = new Map();

    (rawDispensing || []).forEach((row) => {
      if (row.voided_at || !row.medicine_id) return;
      const dateStr = row.dispense_date || row.created_at;
      if (!dateStr) return;
      const monthKey = `${String(dateStr).slice(0, 7)}-01`;
      const key = `${row.medicine_id}:${monthKey}`;
      const cur = summaryMap.get(key) || {
        medicine_id: row.medicine_id,
        month: monthKey,
        total_dispensed: 0,
      };
      cur.total_dispensed += Number(row.quantity || 0);
      summaryMap.set(key, cur);
    });

    (allRequests || []).forEach((req) => {
      if (req.status !== "COMPLETED" && req.status !== "DISPENSED") return;
      const dateStr = req.approved_at || req.request_date;
      if (!dateStr) return;
      const monthKey = `${String(dateStr).slice(0, 7)}-01`;
      (req.items || []).forEach((item) => {
        if (!item.medicine_id) return;
        const key = `${item.medicine_id}:${monthKey}`;
        const cur = summaryMap.get(key) || {
          medicine_id: item.medicine_id,
          month: monthKey,
          total_dispensed: 0,
        };
        cur.total_dispensed += Number(item.quantity || 0);
        summaryMap.set(key, cur);
      });
    });

    const dispensingSummaryRows = Array.from(summaryMap.values());

    return buildForecastAnalytics({
      dispensingRows: dispensingSummaryRows,
      forecastRows,
      inventoryRows,
      facilities,
      monthWindow: 1,
    });
  }, [rawDispensing, allRequests, forecastRows, inventoryRows, facilities]);

  const totalProjectedDemand = useMemo(() => {
    return (forecastPreviewData?.trendingMedicines || []).reduce(
      (sum, row) => sum + Number(row.nextMonthDemand || row.projectedDemand || 0),
      0
    );
  }, [forecastPreviewData]);

  const forecastRiskCount = useMemo(() => {
    return (forecastPreviewData?.trendingMedicines || []).filter(
      (row) =>
        row.circularRisk?.type === "stockout" ||
        (row.coverageMonths !== null && row.coverageMonths < 1.0)
    ).length;
  }, [forecastPreviewData]);

  const facilityDistributionData = useMemo(() => {
    const now = new Date();
    return aggregateFacilityDistribution({
      dispensingRows: rawDispensing,
      requestRows: allRequests,
      monthScope: true,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    });
  }, [rawDispensing, allRequests]);

  const hasOfflineData = Boolean(
    cachedDashboard?.inventoryRows?.length ||
    cachedDashboard?.stats?.stockedBatches ||
    inventoryRows?.length ||
    facilities?.length
  );

  const visibleDashboardError = dashboardError || (
    isOffline && !hasOfflineData
      ? "Dashboard records are unavailable while offline. Please connect to the internet to load data."
      : ""
  );
  const isDashboardLoading = isLoading && !isOffline;
  const today = useMemo(() => formatDateTime(new Date()), []);
  const forecastTotal = useMemo(
    () => forecastRows.reduce((sum, row) => sum + Number(row.predicted_quantity || 0), 0),
    [forecastRows]
  );
  const myFacility = useMemo(() => {
    const fromProfile = profile?.facility_name
      ? {
          facility_name: profile.facility_name,
          facility_code: profile.facility_code || "",
        }
      : null;

    return (
      facilities.find((facility) => facility.id === myFacilityId) ||
      fromProfile ||
      facilities[0] ||
      null
    );
  }, [facilities, myFacilityId, profile]);
  const dashboardConfig = useMemo(
    () =>
      getDashboardRoleConfig({
        facilityName: myFacility?.facility_name,
        facilityCode: myFacility?.facility_code,
        role: profile?.role,
      }),
    [myFacility?.facility_code, myFacility?.facility_name, profile?.role]
  );
  const statCards = useMemo(
    () =>
      getDashboardStatCards({
        config: dashboardConfig,
        inventoryPath,
        stats,
      }),
    [dashboardConfig, inventoryPath, stats]
  );
  const { summaryCards } = useMemo(
    () => getDashboardLayoutGroups(statCards),
    [statCards]
  );

  const loadDashboardFromLocal = () => {
    const direct = getSnapshot(STORAGE_KEYS.DASHBOARD, null);
    let dashboardData = direct;
    if (!dashboardData?.stats || (isBhw && dashboardData.facilityId !== myFacilityId)) {
      dashboardData = compileDashboardSnapshot({
        inventory: getSnapshot(STORAGE_KEYS.INVENTORY, []) || [],
        facilities: getSnapshot(STORAGE_KEYS.FACILITIES, []) || [],
        patients: getSnapshot(STORAGE_KEYS.PATIENTS, []) || [],
        requests: getSnapshot(STORAGE_KEYS.REQUESTS, []) || [],
        dispensing: getSnapshot(STORAGE_KEYS.DISPENSING, []) || [],
        forecasting: getSnapshot(STORAGE_KEYS.FORECASTING, []) || [],
        users: getSnapshot(STORAGE_KEYS.USERS, []) || [],
        facilityId: myFacilityId,
        role: profile?.role,
      });
    }

    if (dashboardData) {
      setStats(getCachedDashboardStats(dashboardData));
      setFacilities(dashboardData.facilities || []);
      setForecastRows(dashboardData.forecastRows || []);
      setStockAlertRows(dashboardData.stockAlertRows || dashboardData.lowStockRows || []);
      setExpiringRows(dashboardData.expiringRows || []);
      setDispensingRows(dashboardData.dispensingRows || []);
      setRawDispensing(
        dashboardData.rawDispensing ||
        getSnapshot(STORAGE_KEYS.DISPENSING, []) ||
        []
      );
      setAllRequests(
        dashboardData.allRequests ||
        getSnapshot(STORAGE_KEYS.REQUESTS, []) ||
        []
      );
      setRequestStatus(dashboardData.requestStatus || defaultRequestStatus);
      setStockStatusByFacility(dashboardData.stockStatusByFacility || {});
      setInventoryRows(dashboardData.inventoryRows || []);
      setDemandByFacility(dashboardData.demandByFacility || {});
      setRecentRequests(dashboardData.recentRequests || []);
      setLastRefreshedAt(dashboardData.refreshedAt || localStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME) || null);
    }
    setIsLoading(false);
    return dashboardData;
  };

  const loadDashboard = async () => {
    if (!isCurrentNetworkOnline()) {
      loadDashboardFromLocal();
      setDashboardError("");
      return;
    }
    if (isBhw && !myFacilityId) {
      setIsLoading(false);
      setDashboardError("Your account needs an assigned facility before dashboard data can be loaded.");
      return;
    }

    setIsLoading(true);
    setDashboardError("");

    const scope = (query) => (isBhw && myFacilityId ? query.eq("facility_id", myFacilityId) : query);
    const now = new Date();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const chartStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    try {
      const [
        pendingRequestsResult,
        facilityRowsResult,
        inventoryResult,
        forecastResult,
        pendingApprovalsResult,
        requestRowsResult,
        recentRequestsResult,
        dispensingResult,
        activePatientsResult,
      ] = await Promise.all([
        scope(
          supabase
            .from("medicine_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "PENDING")
        ),
        (isBhw && myFacilityId
          ? supabase.from("facilities").select("id, facility_name, facility_code, facility_type, address, status, latitude, longitude").eq("id", myFacilityId)
          : supabase
          .from("facilities")
          .select("id, facility_name, facility_code, facility_type, address, status, latitude, longitude")
          .eq("status", "ACTIVE")
          .order("facility_name", { ascending: true })),
        fetchAllRows(() => scope(
          supabase.from("inventory").select(`
            id,
            facility_id,
            medicine_id,
            quantity,
            batch_number,
            expiration_date,
            unit_cost,
            medicine:medicines(generic_name, dosage, unit_of_measure),
            facility:facilities!inventory_facility_id_fkey(id, facility_name, facility_code)
          `)
            .order("expiration_date", { ascending: true })
            .order("id", { ascending: true })
        )),
        scope(
          supabase
            .from("forecasting")
            .select(`
              id,
              medicine_id,
              facility_id,
              forecast_month,
              predicted_quantity,
              medicine:medicines(generic_name, dosage, unit_of_measure)
            `)
            .order("forecast_month", { ascending: false })
            .limit(48)
        ),
        dashboardConfig.canReviewUsers
          ? supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "PENDING")
          : Promise.resolve({ data: [], count: 0, error: null }),
        fetchAllRows(() => scope(
          supabase
            .from("medicine_requests")
            .select(`
              id,
              facility_id,
              status,
              request_date,
              approved_at,
              items:medicine_request_items(
                id,
                medicine_id,
                quantity,
                medicine:medicines(generic_name, dosage, unit_of_measure)
              ),
              facility:facilities(id, facility_name, facility_code)
            `)
            .order("request_date", { ascending: false })
            .order("id", { ascending: false })
        )),
        scope(
          supabase
            .from("medicine_requests")
            .select(`
              id,
              facility_id,
              status,
              request_date,
              items:medicine_request_items(
                quantity,
                medicine:medicines(generic_name, dosage)
              ),
              facility:facilities(facility_name)
            `)
            .order("request_date", { ascending: false })
            .limit(5)
        ),
        fetchAllRows(() => scope(
          supabase
            .from("medicine_dispensing")
            .select(`
              id,
              dispense_date,
              quantity,
              record_type,
              voided_at,
              unit_cost_at_dispense,
              medicine_id,
              medicine:medicines(generic_name, dosage, unit_of_measure)
            `)
            .gte("dispense_date", chartStart.toISOString())
            .lt("dispense_date", nextMonthStart.toISOString())
            .is("voided_at", null)
            .neq("record_type", "HISTORY_ONLY")
            .order("dispense_date", { ascending: true })
            .order("id", { ascending: true })
        )),
        scope(
          supabase
            .from("patients")
            .select("id", { count: "exact", head: true })
            .is("archived_at", null)
        ),
        scope(
          supabase
            .from("facility_medicine_thresholds")
            .select("facility_id, medicine_id, threshold")
        ),
      ]);

      const results = [
        pendingRequestsResult,
        facilityRowsResult,
        inventoryResult,
        forecastResult,
        pendingApprovalsResult,
        requestRowsResult,
        recentRequestsResult,
        dispensingResult,
        activePatientsResult,
      ];
      const firstError = results.find((result) => result?.error)?.error;

      if (firstError) {
        throw firstError;
      }

      const scopedFacilities = facilityRowsResult.data || [];
      const thresholdMap = new Map();
      (thresholdsResult?.data || []).forEach((t) => {
        if (t.facility_id && t.medicine_id) {
          thresholdMap.set(`${t.facility_id}:${t.medicine_id}`, Number(t.threshold || 0));
        }
      });
      const rawInventoryData = (inventoryResult || []).map((row) => ({
        ...row,
        threshold: thresholdMap.get(`${row.facility_id}:${row.medicine_id}`) ?? 0,
      }));
      const inventoryData = await reconcileConfirmedReturnsIntoInventory(rawInventoryData, {
        facilities: scopedFacilities,
      });
      const inventoryMetrics = getDashboardInventoryMetrics(inventoryData);
      const stockedRows = inventoryData.filter((row) => Number(row.quantity || 0) > 0);
      const riskRank = { CRITICAL: 0, LOW: 1 };
      const expiringCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90);
      const todayDate = formatLocalDate(now);
      const cutoffDate = formatLocalDate(expiringCutoff);
      const expiringRows = stockedRows
        .filter((row) => row.expiration_date >= todayDate && row.expiration_date <= cutoffDate)
        .slice(0, 5);
      const stockAlertRows = getDashboardStockAlertRows(inventoryData);
      const requestRowsData = Array.isArray(requestRowsResult)
        ? requestRowsResult
        : (requestRowsResult?.data || []);

      const statusSummary = requestRowsData.reduce(
        (summary, row) => {
          const status = row.status === "COMPLETED" ? "DISPENSED" : row.status;
          if (summary[status] !== undefined) {
            summary[status] += 1;
          }
          return summary;
        },
        { ...defaultRequestStatus }
      );
      const requestRows = (recentRequestsResult.data || []).map((request) => {
        const firstItem = request.items?.[0];
        const medicine = firstItem?.medicine;

        const medicineLabel = medicine
          ? `${medicine.generic_name || "Medicine"} ${medicine.dosage || ""}`.trim()
          : "Medicine request";
        return {
          date: request.request_date ? new Date(request.request_date).toISOString().slice(0, 10) : "",
          facility: request.facility?.facility_name || "Facility not assigned",
          id: request.id,
          shortId: request.id.slice(0, 8).toUpperCase(),
          itemCount: request.items?.length || 0,
          medicine: request.items?.length > 1 ? `${medicineLabel} + ${request.items.length - 1} more` : medicineLabel,
          quantity: request.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
          status: request.status,
        };
      });
      const chartMonthRows = new Map();
      for (const row of dispensingResult || []) {
        const date = new Date(row.dispense_date);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
        chartMonthRows.set(month, (chartMonthRows.get(month) || 0) + Number(row.quantity || 0));
      }
      const dispensingChartData = [...chartMonthRows].map(([month, total_dispensed]) => ({ month, total_dispensed }));

      const compiledStats = {
        ...inventoryMetrics,
        dispensedThisMonth: getMonthlyDispensedQuantity(
          dispensingResult || [],
          requestRowsData,
          now
        ),
        activePatients: activePatientsResult.count || 0,
        pendingRequests: pendingRequestsResult.count || 0,
        pendingApprovals: pendingApprovalsResult.count || 0,
      };

      setStats(compiledStats);
      setFacilities(scopedFacilities);
      setForecastRows(forecastResult.data || []);
      setStockAlertRows(stockAlertRows);
      setExpiringRows(expiringRows);
      setDispensingRows(dispensingChartData);
      setRawDispensing(dispensingResult || []);
      setAllRequests(requestRowsData);
      setRequestStatus(statusSummary);
      setStockStatusByFacility(buildFacilityStockStatus(inventoryData));
      setInventoryRows(inventoryData);
      setDemandByFacility(buildFacilityDemand(forecastResult.data || []));
      setRecentRequests(requestRows);
      const refreshedAt = new Date().toISOString();
      setLastRefreshedAt(refreshedAt);

      saveSnapshot(STORAGE_KEYS.DASHBOARD, {
        stats: compiledStats,
        facilities: scopedFacilities,
        forecastRows: forecastResult.data || [],
        stockAlertRows,
        expiringRows,
        dispensingRows: dispensingChartData,
        rawDispensing: dispensingResult || [],
        allRequests: requestRowsData,
        requestStatus: statusSummary,
        stockStatusByFacility: buildFacilityStockStatus(inventoryData),
        inventoryRows: inventoryData,
        demandByFacility: buildFacilityDemand(forecastResult.data || []),
        recentRequests: requestRows,
        refreshedAt,
      });
    } catch (error) {
      console.warn("Dashboard online fetch failed, using snapshot:", error);
      const isConnError =
        !isCurrentNetworkOnline() ||
        error?.message?.toLowerCase().includes("failed to fetch") ||
        error?.message?.toLowerCase().includes("network") ||
        error?.message?.toLowerCase().includes("timeout");

      if (isConnError) {
        setNetworkOnlineState(false);
      }

      const localData = loadDashboardFromLocal();
      const hasLocalRecords = Boolean(
        localData?.inventoryRows?.length ||
        localData?.stats?.stockedBatches ||
        localData?.facilities?.length
      );

      if (hasLocalRecords) {
        if (isConnError) {
          setDashboardError("");
        } else {
          setDashboardError(getFriendlyDashboardErrorMessage(error, true));
        }
      } else {
        setDashboardError(getFriendlyDashboardErrorMessage(error, false));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOffline) {
      loadDashboardFromLocal();
      return undefined;
    }
    const timerId = window.setTimeout(loadDashboard, 0);
    return () => window.clearTimeout(timerId);
    // Re-fetch when network availability changes; the callback uses current module state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline, myFacilityId, profile?.role]);

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {visibleDashboardError && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {visibleDashboardError}
        </p>
      )}
      {isOffline && hasOfflineData && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Offline view{lastRefreshedAt ? ` · Last refreshed ${formatDateTime(new Date(lastRefreshedAt))}` : " · Showing saved data"}
        </p>
      )}

      <section className="rounded-xl border border-[#CFDDE0] bg-[var(--grad-hero)] px-3.5 py-3 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {dashboardConfig.scopeLabel && (
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#34769B]">
                {dashboardConfig.scopeLabel}
              </p>
            )}
            <h2 className="mt-0.5 text-xl font-black tracking-tight text-[#1B2B30]">
              {dashboardConfig.title}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-[#5B7077]">
              {dashboardConfig.subtitle}
            </p>
            {lastRefreshedAt && !isOffline && (
              <p className="mt-1 text-[11px] text-[#5B7077]">
                Last refreshed {formatDateTime(new Date(lastRefreshedAt))}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadDashboard}
              disabled={isOffline || isLoading}
              title="Refresh dashboard data"
              className="inline-flex items-center gap-2 rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3.5 py-2 text-xs font-black text-[#1B2B30] shadow-xs transition hover:bg-[#E5EFF1] hover:border-[#CFDDE0] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate("/requests")}
              className="btn-primary rounded-lg px-3.5 py-2 text-xs font-black text-white shadow-xs transition active:scale-[0.99]"
            >
              View Requests
            </button>
            <button
              type="button"
              onClick={() => navigate(inventoryPath)}
              className="rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3.5 py-2 text-xs font-black text-[#1B2B30] shadow-xs transition hover:bg-[#E5EFF1]"
            >
              Stock Watch
            </button>
          </div>
        </div>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {summaryCards.map((card) => (
          <StatCard
            key={card.key}
            description={card.description}
            icon={getStatIcon(card.key)}
            isLoading={isDashboardLoading}
            label={card.label}
            onClick={() => {
              if (card.key === "lowStock") {
                navigate(card.to, { state: { stockFilter: "LOW" } });
              } else if (card.key === "criticalStock") {
                navigate(card.to, { state: { stockFilter: "CRITICAL" } });
              } else if (card.key === "stockedBatches") {
                navigate(card.to, { state: { stockFilter: "ALL" } });
              } else {
                navigate(card.to);
              }
            }}
            tone={card.tone}
            value={getDisplayValue(card.value)}
          />
        ))}
      </section>

      {/* Stock risks and real recent request rows */}
      <section className="mt-3 grid gap-3 xl:grid-cols-2">
        <Panel
          className="min-w-0"
          title={isBhw ? "My Facility Stock Alerts" : "Stock Alerts"}
          action={
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#FBE9E3] border border-[#D9826B]/25 px-2.5 py-1 text-[10px] font-black text-[#8F3F2B]">
                {formatNumber(stats.criticalStock + stats.lowStock)}{" "}
                {stats.criticalStock + stats.lowStock === 1 ? "alert" : "alerts"}
              </span>
              <button
                type="button"
                onClick={() => navigate(inventoryPath)}
                className="text-xs font-black text-[#34769B] hover:text-[#1F4A66]"
              >
                View all
              </button>
            </div>
          }
        >
          {stockAlertRows.length === 0 ? (
            <EmptyState
              title="No low stock alerts right now"
              hint="Items at or below threshold will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#CFDDE0]/80 bg-[#F9FBFB] text-[10px] font-bold uppercase tracking-wider text-[#5B7077]">
                  <tr>
                    <th className="py-2 pr-3">Medicine</th>
                    <th className="px-3 py-2">Facility</th>
                    <th className="px-3 py-2 text-right">Stock / Limit</th>
                    <th className="py-2 pl-3">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CFDDE0]/40">
                  {stockAlertRows.map((row) => {
                    const risk = row.riskStatus || getStockStatus(row);
                    return (
                      <tr
                        key={row.id || row.inventory_id}
                        title="Click to view in inventory"
                        onClick={() => {
                          const medName = row.medicine?.generic_name || row.generic_name;
                          const facId = row.facility_id || row.facility?.id;
                          navigate(isBhw ? "/inventory-bhw" : "/inventory", {
                            state: {
                              filterMedicineName: medName,
                              facilityFilter: isBhw ? undefined : (facId || "ALL"),
                              stockFilter: risk === "CRITICAL" ? "CRITICAL" : "LOW",
                            },
                          });
                        }}
                        className="cursor-pointer hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-2.5 pr-3 font-semibold text-[#1B2B30]">
                          <span className="block max-w-44 truncate">
                            {row.medicine?.generic_name || row.generic_name} {row.medicine?.dosage || row.dosage}
                          </span>
                          <span className="text-[10px] font-normal text-[#5B7077]">
                            Batch: {row.batch_number || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[#5B7077]">
                          <span className="block max-w-36 truncate">
                            {formatFacilityName(row.facility?.facility_name || row.facility_name) || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-[#1B2B30]">
                          <span>{formatNumber(row.quantity)}</span>
                          <span className="block text-[10px] font-normal text-[#5B7077]">
                            Limit: {formatNumber(row.threshold)}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              risk === "CRITICAL"
                                ? "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/30"
                                : "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/25"
                            }`}
                          >
                            {risk === "CRITICAL" ? "Critical" : "Low"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          className="min-w-0"
          title={isBhw ? "My Recent Requests" : "Recent Requests"}
          action={
            <button
              type="button"
              onClick={() => navigate("/requests")}
              className="text-xs font-black text-[#34769B] hover:text-[#1F4A66]"
            >
              View all
            </button>
          }
        >
          {recentRequests.length === 0 ? (
            <EmptyState title="No recent requests" hint="Submitted requests will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#CFDDE0]/80 bg-[#F9FBFB] text-[10px] font-bold uppercase tracking-wider text-[#5B7077]">
                  <tr><th className="py-2 pr-3">Request</th><th className="px-3 py-2">Medicine</th><th className="px-3 py-2 text-right">Qty</th><th className="py-2 pl-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-[#CFDDE0]/40">
                  {recentRequests.map((request) => (
                    <tr key={request.id}>
                      <td className="py-2.5 pr-3 font-semibold text-[#1B2B30]">{request.shortId}<span className="block text-[10px] font-normal text-[#5B7077]">{request.date}</span></td>
                      <td className="px-3 py-2.5 text-[#1B2B30]"><span className="block max-w-44 truncate">{request.medicine}</span><span className="text-[10px] text-[#5B7077]">{formatFacilityName(request.facility)}</span></td>
                      <td className="px-3 py-2.5 text-right font-semibold text-[#1B2B30]">{formatNumber(request.quantity)}</td>
                      <td className="py-2.5 pl-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass[request.status] || "bg-[#E5EFF1] text-[#5B7077]"}`}>{formatRequestStatus(request.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      {/* Consumption Trend (Daily Area Chart from Report Module) */}
      <section className="mt-3">
        <DailyTrendChart data={dailyTrendData} monthName={currentMonthName} />
      </section>

      {/* Analytics & Pipeline (Report Module Top Medicines, Facility Distribution, & Request Pipeline) */}
      <section className="mt-3 grid gap-3 lg:grid-cols-3">
        <TopMedicinesChart
          data={topMedicinesData}
          title="Top Dispensed Medicines"
          subtitle={`${currentMonthName} by volume`}
          emptyMessage="No dispensing recorded for this month yet."
        />
        <FacilityDistributionChart
          data={facilityDistributionData}
          title="Distribution by Health Center"
          subtitle="CHO vs. Barangay Centers"
          emptyMessage="No distribution records for this month yet."
        />
        <RequestStatusChart
          rows={requestStatus}
          title="Request Status Pipeline"
          subtitle="All requests"
        />
      </section>

      {/* Demand Forecasting & Stock Runway Preview (Replaced Expiring Medicines) */}
      <section className="mt-3">
        <ForecastPreviewPanel
          items={forecastPreviewData?.trendingMedicines || []}
          totalProjectedDemand={totalProjectedDemand}
          riskCount={forecastRiskCount}
          onNavigate={() => navigate("/forecasting")}
          isBhw={isBhw}
        />
      </section>

      {/* Strategic Geographic Health Network (Final Section of Dashboard) */}
      {!isBhw && (
        <section className="mt-3">
          <ForecastMapPreview
            compact={false}
            fitToCoverage
            mapClassName="min-h-[26rem] md:min-h-[30rem]"
            demandByFacility={demandByFacility}
            description="Facility locations, stock health, and coverage across Naga City health network."
            eyebrow="Geographic Health Network"
            facilities={facilities}
            forecastTotal={forecastTotal}
            inventoryRows={inventoryRows}
            lowStockCount={stats.criticalStock + stats.lowStock}
            previewMode={false}
            showExpand={true}
            showMetrics={true}
            stockStatusByFacility={stockStatusByFacility}
            title={dashboardConfig.coverageLabel || "City of Naga Health Center Coverage & Facility Network"}
          />
        </section>
      )}

      </AdminShell>
  );
}
