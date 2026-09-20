import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { supabase } from "@backend/client/supabase";
import { saveSnapshot, getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { isCurrentNetworkOnline, useNetworkStatus } from "@backend/sync/networkStatus";
import { fetchAllRows } from "@backend/sync/syncUtils";
import EmptyState from "./components/EmptyState";
import ForecastDemandBars from "./components/ForecastDemandBars";
import ForecastMapPreview from "./components/ForecastMapPreview";
import MonthlyDispensingChart from "./components/InventoryFlowChart";
import Panel from "./components/Panel";
import RequestStatusChart from "./components/RequestStatusChart";
import StatCard from "./components/StatCard";
import {
  buildFacilityDemand,
  buildFacilityStockStatus,
  emptyStats,
  formatDateTime,
  formatNumber,
  getDashboardInventoryMetrics,
  getDashboardLayoutGroups,
  getDashboardRoleConfig,
  getDashboardStatCards,
  getMonthlyDispensedQuantity,
  getStockStatus,
} from "@shared/utils/dashboardUtils";

const defaultRequestStatus = {
  APPROVED: 0,
  PENDING: 0,
  DISPENSED: 0,
  REJECTED: 0,
};

const iconMap = {
  approvals: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m16 11 2 2 4-4" />
    </svg>
  ),
  alerts: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 4.3 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z" />
    </svg>
  ),
  expiring: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 8v4l3 3" />
      <path d="M3 5h18M5 5v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5" />
    </svg>
  ),
  facilities: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6M9 10h.01M15 10h.01" />
    </svg>
  ),
  medicine: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m10 21 8.5-8.5a4 4 0 0 0-5.66-5.66L4.34 15.34A4 4 0 0 0 10 21Z" />
      <path d="m8 12 4 4" />
    </svg>
  ),
  requests: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M7 3h8l4 4v14H7V3Z" />
      <path d="M14 3v5h5M10 13h6M10 17h4" />
    </svg>
  ),
  transfers: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M7 7h11l-3-3M17 17H6l3 3" />
    </svg>
  ),
};

const statusClass = {
  APPROVED: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  DISPENSED: "bg-blue-100 text-blue-700",
  PENDING: "bg-orange-100 text-orange-700",
  REJECTED: "bg-red-100 text-red-700",
};

const getStatIcon = (key) => {
  const iconByKey = {
    stockedBatches: iconMap.medicine,
    dispensedThisMonth: iconMap.transfers,
    activePatients: iconMap.facilities,
    criticalStock: iconMap.alerts,
    lowStock: iconMap.alerts,
    pendingRequests: iconMap.requests,
  };

  return iconByKey[key] || iconMap.requests;
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
    return "bg-neutral-100 text-neutral-600";
  }

  if (days <= 30) {
    return "bg-red-100 text-red-700";
  }

  if (days <= 60) {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-neutral-100 text-neutral-600";
};

export default function DashboardModule() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const cachedDashboard = useMemo(() => getSnapshot(STORAGE_KEYS.DASHBOARD, null), []);
  const [stats, setStats] = useState(() => getCachedDashboardStats(cachedDashboard));
  const [facilities, setFacilities] = useState(() => cachedDashboard?.facilities || []);
  const [forecastRows, setForecastRows] = useState(() => cachedDashboard?.forecastRows || []);
  const [recentRequests, setRecentRequests] = useState(() => cachedDashboard?.recentRequests || []);
  const [stockAlertRows, setStockAlertRows] = useState(() => cachedDashboard?.stockAlertRows || cachedDashboard?.lowStockRows || []);
  const [expiringRows, setExpiringRows] = useState(() => cachedDashboard?.expiringRows || []);
  const [dispensingRows, setDispensingRows] = useState(() => cachedDashboard?.dispensingRows || []);
  const [requestStatus, setRequestStatus] = useState(() => cachedDashboard?.requestStatus || defaultRequestStatus);
  const [stockStatusByFacility, setStockStatusByFacility] = useState(() => cachedDashboard?.stockStatusByFacility || {});
  const [inventoryRows, setInventoryRows] = useState(() => cachedDashboard?.inventoryRows || []);
  const [demandByFacility, setDemandByFacility] = useState(() => cachedDashboard?.demandByFacility || {});
  const [isLoading, setIsLoading] = useState(() => !cachedDashboard);
  const [dashboardError, setDashboardError] = useState("");
  const isOffline = !useNetworkStatus();
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => cachedDashboard?.refreshedAt || null);
  const visibleDashboardError = dashboardError || (
    isOffline && !cachedDashboard
      ? "Dashboard data is unavailable offline. Connect to the network to load it."
      : ""
  );
  const isDashboardLoading = isLoading && !isOffline;

  const isBhw = profile?.role === "BHW";
  const myFacilityId = profile?.facility_id || null;
  const inventoryPath = isBhw ? "/inventory-bhw" : "/inventory";
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
  const workItems = useMemo(() => {
    const items = [
      {
        label: dashboardConfig.requestLabel,
        onClick: () => navigate("/requests?status=pending"),
        tone: "orange",
        value: stats.pendingRequests,
      },
      {
        label: "Stock Watch",
        onClick: () => navigate(inventoryPath),
        tone: "red",
        value: stats.criticalStock + stats.lowStock,
      },
    ];

    if (dashboardConfig.canReviewUsers) {
      items.splice(1, 0, {
        label: "Account Approval",
        onClick: () => navigate("/users"),
        tone: "emerald",
        value: stats.pendingApprovals,
      });
    }

    return items;
  }, [
    dashboardConfig.canReviewUsers,
    dashboardConfig.requestLabel,
    inventoryPath,
    navigate,
    stats.lowStock,
    stats.pendingApprovals,
    stats.pendingRequests,
    stats.criticalStock,
  ]);

  const loadDashboard = async () => {
    if (!isCurrentNetworkOnline()) {
      setIsLoading(false);
      if (!cachedDashboard) {
        setDashboardError("Dashboard data is unavailable offline. Connect to the network to load it.");
      }
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
            threshold,
            batch_number,
            expiration_date,
            medicine:medicines(generic_name, brand_name, dosage, unit_of_measure),
            facility:facilities(id, facility_name, facility_code)
          `)
            .order("expiration_date", { ascending: true })
            .order("id", { ascending: true })
        )),
        scope(
          supabase
            .from("forecasting")
            .select("id, predicted_quantity, forecast_month, facility_id")
            .order("forecast_month", { ascending: false })
            .limit(24)
        ),
        dashboardConfig.canReviewUsers
          ? supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "PENDING")
          : Promise.resolve({ data: [], count: 0, error: null }),
        fetchAllRows(() => scope(
          supabase
            .from("medicine_requests")
            .select("id, status")
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
            .select("id, dispense_date, quantity, record_type, voided_at")
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
      const inventoryData = inventoryResult || [];
      const inventoryMetrics = getDashboardInventoryMetrics(inventoryData);
      const stockedRows = inventoryData.filter((row) => Number(row.quantity || 0) > 0);
      const riskRank = { CRITICAL: 0, LOW: 1 };
      const expiringCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90);
      const todayDate = formatLocalDate(now);
      const cutoffDate = formatLocalDate(expiringCutoff);
      const expiringRows = stockedRows
        .filter((row) => row.expiration_date >= todayDate && row.expiration_date <= cutoffDate)
        .slice(0, 5);
      const stockAlertRows = inventoryData
        .filter((row) => ["CRITICAL", "LOW"].includes(getStockStatus(row)))
        .sort((first, second) =>
          riskRank[getStockStatus(first)] - riskRank[getStockStatus(second)] ||
          Number(first.quantity || 0) - Number(second.quantity || 0)
        )
        .slice(0, 5);
      const statusSummary = (requestRowsResult.data || []).reduce(
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
        dispensedThisMonth: getMonthlyDispensedQuantity(dispensingResult || [], now),
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
        requestStatus: statusSummary,
        stockStatusByFacility: buildFacilityStockStatus(inventoryData),
        inventoryRows: inventoryData,
        demandByFacility: buildFacilityDemand(forecastResult.data || []),
        recentRequests: requestRows,
        refreshedAt,
      });
    } catch (error) {
      console.warn("Dashboard online fetch failed, using snapshot:", error);
      const fallbackSnapshot = getSnapshot(STORAGE_KEYS.DASHBOARD, null);
      if (fallbackSnapshot) {
        setStats(getCachedDashboardStats(fallbackSnapshot));
        setFacilities(fallbackSnapshot.facilities || []);
        setForecastRows(fallbackSnapshot.forecastRows || []);
        setStockAlertRows(fallbackSnapshot.stockAlertRows || fallbackSnapshot.lowStockRows || []);
        setExpiringRows(fallbackSnapshot.expiringRows || []);
        setDispensingRows(fallbackSnapshot.dispensingRows || []);
        setRequestStatus(fallbackSnapshot.requestStatus || defaultRequestStatus);
        setStockStatusByFacility(fallbackSnapshot.stockStatusByFacility || {});
        setInventoryRows(fallbackSnapshot.inventoryRows || []);
        setDemandByFacility(fallbackSnapshot.demandByFacility || {});
        setRecentRequests(fallbackSnapshot.recentRequests || []);
        setLastRefreshedAt(fallbackSnapshot.refreshedAt || null);
        setDashboardError(`Refresh failed; showing saved dashboard data. ${error?.message || "Unable to refresh."}`);
      } else {
        setDashboardError(error?.message || "Unable to load dashboard data.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOffline) return undefined;
    const timerId = window.setTimeout(loadDashboard, 0);
    return () => window.clearTimeout(timerId);
    // Re-fetch when network availability changes; the callback uses current module state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline]);

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {visibleDashboardError && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {visibleDashboardError}
        </p>
      )}
      {isOffline && cachedDashboard && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Offline view{lastRefreshedAt ? ` · Last refreshed ${formatDateTime(new Date(lastRefreshedAt))}` : " · Showing saved data"}
        </p>
      )}

      <section className="rounded-xl border border-[#d8dadc] bg-white px-3.5 py-3 shadow-sm shadow-neutral-200/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {dashboardConfig.scopeLabel && (
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                {dashboardConfig.scopeLabel}
              </p>
            )}
            <h2 className="mt-0.5 text-xl font-black tracking-tight text-[#0d1117]">
              {dashboardConfig.title}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-[#42474e]">
              {dashboardConfig.subtitle}
            </p>
            {lastRefreshedAt && !isOffline && (
              <p className="mt-1 text-[11px] text-neutral-500">
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
              className="inline-flex items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-3.5 py-2 text-xs font-black text-[#0d1117] shadow-sm transition hover:border-[#6be9c2] hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate("/requests")}
              className="rounded-lg bg-[#0d1117] px-3.5 py-2 text-xs font-black text-white shadow-sm transition hover:bg-[#00a36c]"
            >
              View Requests
            </button>
            <button
              type="button"
              onClick={() => navigate(inventoryPath)}
              className="rounded-lg border border-[#d8dadc] bg-white px-3.5 py-2 text-xs font-black text-[#0d1117] shadow-sm transition hover:border-[#6be9c2] hover:bg-[#eff4ff]"
            >
              Stock Watch
            </button>
          </div>
        </div>
      </section>

      <section className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(155px,1fr))] gap-2.5">
        {summaryCards.map((card) => (
          <StatCard
            key={card.key}
            description={card.description}
            icon={getStatIcon(card.key)}
            isLoading={isDashboardLoading}
            label={card.label}
            onClick={() => navigate(card.to)}
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
            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black text-orange-700">
              {formatNumber(stats.criticalStock + stats.lowStock)} alerts
            </span>
          }
        >
          {stockAlertRows.length === 0 ? (
            <EmptyState
              title="No low stock alerts right now"
              hint="Items at or below threshold will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="border-b border-neutral-200 text-[10px] uppercase text-neutral-500">
                  <tr><th className="py-2 pr-3">Medicine</th><th className="px-3 py-2">Facility</th><th className="px-3 py-2">Batch</th><th className="px-3 py-2 text-right">Qty / threshold</th><th className="py-2 pl-3">Risk</th></tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {stockAlertRows.map((row) => {
                    const risk = getStockStatus(row);
                    return (
                      <tr key={row.id || row.inventory_id}>
                        <td className="py-2.5 pr-3 font-semibold text-[#0d1117]">{row.medicine?.generic_name || row.generic_name} {row.medicine?.dosage || row.dosage}</td>
                        <td className="px-3 py-2.5 text-neutral-600">{row.facility?.facility_name || row.facility_name || "-"}</td>
                        <td className="px-3 py-2.5 text-neutral-600">{row.batch_number || "-"}</td>
                        <td className="px-3 py-2.5 text-right font-bold">{formatNumber(row.quantity)} / {formatNumber(row.threshold)}</td>
                        <td className="py-2.5 pl-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${risk === "CRITICAL" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>{risk === "CRITICAL" ? "Critical" : "Low"}</span></td>
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
              className="text-xs font-black text-emerald-700 hover:text-emerald-800"
            >
              View all
            </button>
          }
        >
          {recentRequests.length === 0 ? (
            <EmptyState title="No recent requests" hint="Submitted requests will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[490px] text-left text-xs">
                <thead className="border-b border-neutral-200 text-[10px] uppercase text-neutral-500">
                  <tr><th className="py-2 pr-3">Request</th><th className="px-3 py-2">Medicine</th><th className="px-3 py-2 text-right">Qty</th><th className="py-2 pl-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {recentRequests.map((request) => (
                    <tr key={request.id}>
                      <td className="py-2.5 pr-3 font-semibold text-[#0d1117]">{request.shortId}<span className="block text-[10px] font-normal text-neutral-500">{request.date}</span></td>
                      <td className="px-3 py-2.5"><span className="block max-w-44 truncate">{request.medicine}</span><span className="text-[10px] text-neutral-500">{request.facility}</span></td>
                      <td className="px-3 py-2.5 text-right font-semibold">{formatNumber(request.quantity)}</td>
                      <td className="py-2.5 pl-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass[request.status] || "bg-neutral-100 text-neutral-600"}`}>{formatRequestStatus(request.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      {/* Operational Analytics: Request Status & Forecast Demand */}
      <section className="mt-3 grid gap-3 md:grid-cols-2">
        <Panel
          className="min-h-[220px]"
          title="Request Status"
          action={<p className="text-xs font-bold text-neutral-500">All requests</p>}
        >
          <RequestStatusChart rows={requestStatus} />
        </Panel>

        <Panel
          className="min-h-[220px]"
          title="Forecast Demand"
          action={
            <button
              type="button"
              onClick={() => navigate("/forecasting")}
              className="text-xs font-black text-emerald-700 hover:text-emerald-800"
            >
              Full view
            </button>
          }
        >
          <ForecastDemandBars rows={forecastRows} />
        </Panel>
      </section>

      {/* Consumption Trend */}
      <section className="mt-3">
        <Panel
          className="min-h-[320px]"
          title="Consumption Trend"
          action={<p className="text-xs font-bold text-neutral-500">Dispensed units by month</p>}
        >
          <MonthlyDispensingChart rows={dispensingRows} />
        </Panel>
      </section>

      {/* Expiring Medicines & Operational Worklist */}
      <section className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
        <Panel
          title={isBhw ? "My Facility Expiring Medicines" : "Expiring Medicines"}
          action={
            <span className="text-xs font-semibold text-neutral-500">In stock · next 90 days</span>
          }
        >
          {expiringRows.length === 0 ? (
            <EmptyState
              title="No expiring medicines"
              hint="Batches expiring within 90 days will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="border-b border-neutral-200 text-[10px] uppercase text-neutral-500">
                  <tr><th className="py-2 pr-3">Medicine</th><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Facility</th><th className="px-3 py-2 text-right">Quantity</th><th className="py-2 pl-3">Expiry</th></tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
              {expiringRows.map((row) => {
                const days = daysUntil(row.expiration_date);

                return (
                  <tr key={row.id}>
                    <td className="py-2.5 pr-3 font-semibold">{row.medicine?.generic_name || row.generic_name} {row.medicine?.dosage || row.dosage}</td>
                    <td className="px-3 py-2.5 text-neutral-600">{row.batch_number || "-"}</td>
                    <td className="px-3 py-2.5 text-neutral-600">{row.facility?.facility_name || row.facility_name || "-"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{formatNumber(row.quantity)}</td>
                    <td className="py-2.5 pl-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${expiringTone(days)}`}>{row.expiration_date || "-"} · {days == null ? "Unknown" : `${days}d`}</span></td>
                  </tr>
                );
              })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title="Operational Worklist"
          action={<p className="text-xs font-bold text-neutral-500">Needs attention</p>}
        >
          <div className="grid gap-2">
            {workItems.map((item) => (
              <WorkItem key={item.label} {...item} />
            ))}
          </div>
        </Panel>
      </section>

      {/* Strategic Geographic Health Network (Final Section of Dashboard) */}
      {!isBhw && (
        <section className="mt-3">
          <ForecastMapPreview
            compact={false}
            fitToCoverage
            mapClassName="min-h-[26rem] md:min-h-[30rem]"
            demandByFacility={demandByFacility}
            description="Facility locations, stock health, and projected demand from current system records."
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

function WorkItem({ label, onClick, tone, value }) {
  const toneClass =
    tone === "red"
      ? "border-red-100 bg-red-50 text-red-700"
      : tone === "orange"
        ? "border-orange-100 bg-orange-50 text-orange-700"
        : tone === "amber"
          ? "border-amber-100 bg-amber-50 text-amber-700"
          : "border-emerald-100 bg-emerald-50 text-emerald-700";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${toneClass}`}
    >
      <p className="text-2xl font-black">{formatNumber(value)}</p>
      <p className="mt-1.5 text-xs font-black uppercase tracking-[0.14em]">
        {label}
      </p>
    </button>
  );
}
