import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";
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
  getDashboardLayoutGroups,
  getDashboardRoleConfig,
  getDashboardStatCards,
} from "./dashboardUtils";

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
    activeFacilities: iconMap.facilities,
    expiringSoon: iconMap.expiring,
    lowStock: iconMap.alerts,
    medicineCatalog: iconMap.medicine,
    pendingApprovals: iconMap.approvals,
    pendingRequests: iconMap.requests,
    transfersCompleted: iconMap.transfers,
  };

  return iconByKey[key] || iconMap.requests;
};

const getDisplayValue = (value) => {
  return typeof value === "number" ? formatNumber(value) : value;
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
  const [stats, setStats] = useState(emptyStats);
  const [facilities, setFacilities] = useState([]);
  const [forecastRows, setForecastRows] = useState([]);
  const [recentRequests, setRecentRequests] = useState([]);
  const [lowStockRows, setLowStockRows] = useState([]);
  const [expiringRows, setExpiringRows] = useState([]);
  const [dispensingRows, setDispensingRows] = useState([]);
  const [requestStatus, setRequestStatus] = useState(defaultRequestStatus);
  const [stockStatusByFacility, setStockStatusByFacility] = useState({});
  const [inventoryRows, setInventoryRows] = useState([]);
  const [demandByFacility, setDemandByFacility] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

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
        onClick: () => navigate(`${inventoryPath}?stock=low`),
        tone: "red",
        value: stats.lowStock,
      },
      {
        label: "Expiring Soon",
        onClick: () => navigate(inventoryPath),
        tone: "amber",
        value: stats.expiringSoon,
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
    stats.expiringSoon,
    stats.lowStock,
    stats.pendingApprovals,
    stats.pendingRequests,
  ]);

  const loadDashboard = async () => {
    setIsLoading(true);
    setDashboardError("");

    const scope = (query) => (isBhw && myFacilityId ? query.eq("facility_id", myFacilityId) : query);

    try {
      const [
        medicinesResult,
        lowStockCountResult,
        lowStockResult,
        pendingRequestsResult,
        facilitiesResult,
        facilityRowsResult,
        inventoryResult,
        transfersResult,
        forecastResult,
        pendingApprovalsResult,
        requestRowsResult,
        recentRequestsResult,
        expiringCountResult,
        expiringRowsResult,
        dispensingResult,
      ] = await Promise.all([
        supabase.from("medicines").select("id", { count: "exact", head: true }),
        scope(supabase.from("low_stock_view").select("inventory_id", { count: "exact", head: true })),
        scope(
          supabase
            .from("low_stock_view")
            .select("inventory_id, generic_name, dosage, facility_name, quantity, threshold")
            .limit(5)
        ),
        scope(
          supabase
            .from("medicine_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "PENDING")
        ),
        supabase.from("facilities").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
        supabase
          .from("facilities")
          .select("id, facility_name, facility_code, facility_type, address, status, latitude, longitude")
          .eq("status", "ACTIVE")
          .order("facility_name", { ascending: true }),
        scope(
          supabase.from("inventory").select(`
            id,
            facility_id,
            quantity,
            threshold,
            medicine:medicines(generic_name, brand_name, dosage)
          `)
        ),
        supabase
          .from("stock_transfers")
          .select("id", { count: "exact", head: true })
          .eq("status", "COMPLETED"),
        scope(
          supabase
            .from("forecasting")
            .select("id, predicted_quantity, forecast_month, facility_id")
            .order("forecast_month", { ascending: false })
            .limit(24)
        ),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
        scope(supabase.from("medicine_requests").select("id, status")),
        scope(
          supabase
            .from("medicine_requests")
            .select(`
              id,
              facility_id,
              status,
              request_date,
              facility:facilities(facility_name),
              items:medicine_request_items(
                quantity,
                medicine:medicines(generic_name, dosage)
              )
            `)
            .order("request_date", { ascending: false })
            .limit(5)
        ),
        scope(supabase.from("expiring_medicines_view").select("inventory_id", { count: "exact", head: true })),
        scope(
          supabase
            .from("expiring_medicines_view")
            .select("inventory_id, generic_name, dosage, facility_name, expiration_date, facility_id")
            .order("expiration_date", { ascending: true })
            .limit(5)
        ),
        scope(supabase.from("monthly_dispensing_summary").select("facility_id, month, total_dispensed")),
      ]);

      const results = [
        medicinesResult,
        lowStockCountResult,
        lowStockResult,
        pendingRequestsResult,
        facilitiesResult,
        facilityRowsResult,
        inventoryResult,
        transfersResult,
        forecastResult,
        pendingApprovalsResult,
        requestRowsResult,
        recentRequestsResult,
        expiringCountResult,
        expiringRowsResult,
        dispensingResult,
      ];
      const firstError = results.find((result) => result.error)?.error;

      if (firstError) {
        throw firstError;
      }

      const scopedFacilities = isBhw
        ? (facilityRowsResult.data || []).filter((facility) => facility.id === myFacilityId)
        : facilityRowsResult.data || [];
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

        return {
          date: request.request_date ? new Date(request.request_date).toISOString().slice(0, 10) : "",
          facility: request.facility?.facility_name || "Facility not assigned",
          id: request.id,
          medicine: `${medicine?.generic_name || "Medicine request"} ${medicine?.dosage || ""}`.trim(),
          quantity: request.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
          status: request.status,
        };
      });

      setStats({
        activeFacilities: facilitiesResult.count || 0,
        expiringSoon: expiringCountResult.count || 0,
        lowStock: lowStockCountResult.count || 0,
        medicineCatalog: medicinesResult.count || 0,
        pendingApprovals: pendingApprovalsResult.count || 0,
        pendingRequests: pendingRequestsResult.count || 0,
        transfersCompleted: transfersResult.count || 0,
      });
      setFacilities(scopedFacilities);
      setForecastRows(forecastResult.data || []);
      setLowStockRows(lowStockResult.data || []);
      setExpiringRows(expiringRowsResult.data || []);
      setDispensingRows(dispensingResult.data || []);
      setRequestStatus(statusSummary);
      setStockStatusByFacility(buildFacilityStockStatus(inventoryResult.data || []));
      setInventoryRows(inventoryResult.data || []);
      setDemandByFacility(buildFacilityDemand(forecastResult.data || []));
      setRecentRequests(requestRows);
    } catch (error) {
      setDashboardError(error?.message || "Unable to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timerId = window.setTimeout(loadDashboard, 0);
    return () => window.clearTimeout(timerId);
    // loadDashboard intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {dashboardError && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {dashboardError}
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
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("/requests")}
              className="rounded-lg bg-[#0d1117] px-3.5 py-2 text-xs font-black text-white shadow-sm transition hover:bg-[#00a36c]"
            >
              View Requests
            </button>
            <button
              type="button"
              onClick={() => navigate(`${inventoryPath}?stock=low`)}
              className="rounded-lg border border-[#d8dadc] bg-white px-3.5 py-2 text-xs font-black text-[#0d1117] shadow-sm transition hover:border-[#6be9c2] hover:bg-[#eff4ff]"
            >
              Stock Watch
            </button>
          </div>
        </div>
      </section>

      <section className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(145px,1fr))] gap-2.5">
        {summaryCards.map((card) => (
          <StatCard
            key={card.key}
            description={card.description}
            icon={getStatIcon(card.key)}
            isLoading={isLoading}
            label={card.label}
            onClick={() => navigate(card.to)}
            tone={card.tone}
            value={getDisplayValue(card.value)}
          />
        ))}
      </section>

      <section className="mt-3 grid gap-3">
        {!isBhw && (
          <ForecastMapPreview
            compact
            fitToCoverage
            mapClassName="min-h-[28rem] md:min-h-[32rem]"
            demandByFacility={demandByFacility}
            description="City-wide facility locations, demand, and stock status."
            eyebrow="Forecasting Snapshot"
            facilities={facilities}
            forecastTotal={forecastTotal}
            inventoryRows={inventoryRows}
            lowStockCount={stats.lowStock}
            previewMode
            showExpand={false}
            showMetrics={false}
            stockStatusByFacility={stockStatusByFacility}
            title={dashboardConfig.coverageLabel}
          />
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <Panel
            className="min-h-[220px]"
            title="Request Status"
            action={<p className="text-xs font-bold text-neutral-500">Current period</p>}
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
        </div>
      </section>

      <section className="mt-3 grid gap-3 xl:grid-cols-2">
        <Panel
          className="min-h-[190px]"
          title={isBhw ? "My Facility Stock Watch" : "Low Stock Alerts"}
          action={
            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black text-orange-700">
              {formatNumber(lowStockRows.length)} alerts
            </span>
          }
        >
          {lowStockRows.length === 0 ? (
            <EmptyState
              title="No low stock alerts right now"
              hint="Items at or below threshold will appear here."
            />
          ) : (
            <div className="divide-y divide-neutral-100">
              {lowStockRows.slice(0, 4).map((row) => (
                <LowStockRow key={row.inventory_id} row={row} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          className="min-h-[190px]"
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
            <div className="divide-y divide-neutral-100">
              {recentRequests.slice(0, 4).map((request) => (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => navigate("/requests")}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-2 py-2 text-left transition hover:bg-[#eff4ff]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-black">{request.medicine}</p>
                    <p className="truncate text-[11px] font-medium text-neutral-500">
                      {request.facility}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                      statusClass[request.status] || "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {formatRequestStatus(request.status)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <section className="mt-3">
        <Panel
          className="min-h-[320px]"
          title="Consumption Trend"
          action={<p className="text-xs font-bold text-neutral-500">Dispensed units by month</p>}
        >
          <MonthlyDispensingChart rows={dispensingRows} />
        </Panel>
      </section>

      <section className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
        <Panel
          title={isBhw ? "My Facility Expiring Medicines" : "Expiring Medicines"}
          action={
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
              {formatNumber(stats.expiringSoon)} within 90 days
            </span>
          }
        >
          {expiringRows.length === 0 ? (
            <EmptyState
              title="No expiring medicines"
              hint="Batches expiring within 90 days will appear here."
            />
          ) : (
            <div className="divide-y divide-neutral-100">
              {expiringRows.map((row) => {
                const days = daysUntil(row.expiration_date);

                return (
                  <article
                    key={row.inventory_id}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-black">
                        {row.generic_name} {row.dosage}
                      </p>
                      <p className="truncate text-xs font-medium text-neutral-500">
                        {row.facility_name}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <p className="font-semibold text-black">
                        {row.expiration_date || "-"}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${expiringTone(days)}`}>
                      {days == null ? "Unknown" : `${days} days`}
                    </span>
                  </article>
                );
              })}
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
    </AdminShell>
  );
}

function LowStockRow({ row }) {
  const threshold = Number(row.threshold || 1);
  const quantity = Number(row.quantity || 0);
  const percent = Math.min(100, Math.round((quantity / threshold) * 100));
  const isCritical = percent <= 35;

  return (
    <article className="py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-black">
            {row.generic_name} {row.dosage}
          </p>
          <p className="truncate text-xs font-medium text-neutral-500">
            {row.facility_name}
          </p>
        </div>
        <div className="shrink-0 text-right text-sm">
          <p className={isCritical ? "font-black text-red-500" : "font-black text-orange-500"}>
            {formatNumber(quantity)}
          </p>
          <p className="text-neutral-400">/ {formatNumber(threshold)}</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full ${isCritical ? "bg-red-500" : "bg-orange-500"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </article>
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
