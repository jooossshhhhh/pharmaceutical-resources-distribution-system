import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";
import InventoryFlowChart from "./components/InventoryFlowChart";
import Panel from "./components/Panel";
import RequestStatusChart from "./components/RequestStatusChart";
import StatCard from "./components/StatCard";
import { emptyStats, formatDateTime, formatNumber } from "./dashboardUtils";

const defaultRequestStatus = {
  APPROVED: 0,
  PENDING: 0,
  DISPENSED: 0,
  REJECTED: 0,
};

const defaultRecentRequests = [
  {
    id: "sample-1",
    medicine: "No recent medicine request",
    facility: "Requests will appear here once submitted",
    quantity: 0,
    date: "",
    status: "PENDING",
  },
];

const iconMap = {
  medicines: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m10 21 9-9a4 4 0 0 0-6-6l-9 9a4 4 0 0 0 6 6Z" />
      <path d="m8 11 5 5" />
    </svg>
  ),
  requests: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M7 3h8l4 4v14H7V3Z" />
      <path d="M14 3v5h5M10 13h6M10 17h4" />
    </svg>
  ),
  alerts: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 4.3 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z" />
    </svg>
  ),
  facilities: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6M9 10h.01M15 10h.01" />
    </svg>
  ),
  patients: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="10" cy="8" r="4" />
      <path d="M3 21a7 7 0 0 1 14 0M19 8v6M16 11h6" />
    </svg>
  ),
  transfers: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M7 7h11l-3-3M18 7l-3 3M17 17H6l3 3M6 17l3-3" />
    </svg>
  ),
};

const getDisplayName = (profile) => {
  const fullName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
  return fullName || "Pharma User";
};

const statusClass = {
  APPROVED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  DISPENSED: "bg-blue-100 text-blue-700",
  REJECTED: "bg-red-100 text-red-700",
};

const formatRequestStatus = (status) => {
  if (status === "COMPLETED") {
    return "Dispensed";
  }

  return status?.charAt(0) + status?.slice(1).toLowerCase();
};

export default function DashboardModule() {
  const { profile } = useAuth();
  const [stats, setStats] = useState(emptyStats);
  const [recentRequests, setRecentRequests] = useState(defaultRecentRequests);
  const [lowStockRows, setLowStockRows] = useState([]);
  const [requestStatus, setRequestStatus] = useState(defaultRequestStatus);
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  const today = useMemo(() => formatDateTime(new Date()), []);
  const roleLabel = profile?.role || "Pharmacist";

  const loadDashboard = async () => {
    setIsLoading(true);
    setDashboardError("");

    try {
      const [
        medicinesResult,
        lowStockResult,
        pendingRequestsResult,
        facilitiesResult,
        patientsResult,
        transfersResult,
        requestRowsResult,
        recentRequestsResult,
      ] = await Promise.all([
        supabase.from("medicines").select("id", { count: "exact", head: true }),
        supabase
          .from("low_stock_view")
          .select("inventory_id, generic_name, dosage, facility_name, quantity, threshold")
          .limit(5),
        supabase
          .from("medicine_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING"),
        supabase.from("facilities").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
        supabase.from("patients").select("id", { count: "exact", head: true }),
        supabase
          .from("stock_transfers")
          .select("id", { count: "exact", head: true })
          .eq("status", "COMPLETED"),
        supabase.from("medicine_requests").select("id, status"),
        supabase
          .from("medicine_requests")
          .select(`
            id,
            status,
            request_date,
            facility:facilities(facility_name),
            items:medicine_request_items(
              quantity,
              medicine:medicines(generic_name, dosage)
            )
          `)
          .order("request_date", { ascending: false })
          .limit(5),
      ]);

      const results = [
        medicinesResult,
        lowStockResult,
        pendingRequestsResult,
        facilitiesResult,
        patientsResult,
        transfersResult,
        requestRowsResult,
        recentRequestsResult,
      ];
      const firstError = results.find((result) => result.error)?.error;

      if (firstError) {
        throw firstError;
      }

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
          id: request.id,
          medicine: `${medicine?.generic_name || "Medicine request"} ${
            medicine?.dosage || ""
          }`.trim(),
          facility: request.facility?.facility_name || "Facility not assigned",
          quantity: request.items?.reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
          ),
          date: request.request_date
            ? new Date(request.request_date).toISOString().slice(0, 10)
            : "",
          status: request.status,
        };
      });

      setStats({
        inventoryItems: medicinesResult.count || 0,
        totalQuantity: patientsResult.count || 0,
        lowStock: lowStockResult.data?.length || 0,
        expiring: facilitiesResult.count || 0,
        pendingRequests: pendingRequestsResult.count || 0,
        inboundTransfers: transfersResult.count || 0,
      });
      setLowStockRows(lowStockResult.data || []);
      setRequestStatus(statusSummary);
      setRecentRequests(requestRows.length > 0 ? requestRows : defaultRecentRequests);
    } catch (error) {
      setDashboardError(error?.message || "Unable to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timerId = window.setTimeout(loadDashboard, 0);
    return () => window.clearTimeout(timerId);
  }, []);

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {dashboardError && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {dashboardError}
        </p>
      )}

      <section className="relative mb-5 overflow-hidden rounded-xl bg-black px-6 py-5 text-white">
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-400">
              Good Morning
            </p>
            <h2 className="mt-2 text-xl font-black">
              {getDisplayName(profile)}, {roleLabel}
            </h2>
            <p className="mt-1 text-sm font-medium text-neutral-200">
              {profile?.facility_name || "Palompon District Health Office"} - You have{" "}
              <span className="font-black text-orange-400">
                {formatNumber(stats.pendingRequests)} pending requests
              </span>{" "}
              and{" "}
              <span className="font-black text-red-400">
                {formatNumber(stats.lowStock)} low stock alerts
              </span>{" "}
              today.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700">
              View Requests
            </button>
            <button className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-black text-white ring-1 ring-white/10 hover:bg-neutral-800">
              Restock Alert
            </button>
          </div>
        </div>
        <svg
          aria-hidden="true"
          className="absolute -right-7 -top-7 h-40 w-40 text-emerald-500/10"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          viewBox="0 0 100 100"
        >
          <path d="M12 54h18l8-28 14 54 10-26h26" />
          <circle cx="50" cy="50" r="42" />
        </svg>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          icon={iconMap.medicines}
          label="Total Medicines"
          value={isLoading ? "..." : formatNumber(stats.inventoryItems)}
          note="+12"
          tone="emerald"
        />
        <StatCard
          icon={iconMap.requests}
          label="Pending Requests"
          value={isLoading ? "..." : formatNumber(stats.pendingRequests)}
          note="+5"
          tone="orange"
        />
        <StatCard
          icon={iconMap.alerts}
          label="Low Stock Alerts"
          value={isLoading ? "..." : formatNumber(stats.lowStock)}
          note="+3"
          tone="red"
        />
        <StatCard
          icon={iconMap.facilities}
          label="Active Facilities"
          value={isLoading ? "..." : formatNumber(stats.expiring)}
          tone="blue"
        />
        <StatCard
          icon={iconMap.patients}
          label="Total Patients"
          value={isLoading ? "..." : formatNumber(stats.totalQuantity)}
          note="+28"
          tone="teal"
        />
        <StatCard
          icon={iconMap.transfers}
          label="Transfers Done"
          value={isLoading ? "..." : formatNumber(stats.inboundTransfers)}
          note="+7"
          tone="blue"
        />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[2fr_1fr]">
        <Panel
          title="Inventory Flow"
          action={
            <div className="text-right">
              <p className="text-sm font-medium text-neutral-500">Received vs Dispensed</p>
              <select className="mt-2 rounded-lg border border-neutral-200 bg-[#faf9f7] px-3 py-2 text-xs font-semibold text-neutral-600 outline-none">
                <option>Last 7 months</option>
              </select>
            </div>
          }
        >
          <InventoryFlowChart />
        </Panel>

        <Panel
          title="Request Status"
          action={<p className="text-sm font-medium text-neutral-500">Current period breakdown</p>}
        >
          <RequestStatusChart rows={requestStatus} />
        </Panel>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Panel
          title="Recent Requests"
          action={
            <button className="text-sm font-bold text-emerald-700 hover:text-emerald-800">
              View all
            </button>
          }
        >
          <div className="divide-y divide-neutral-100">
            {recentRequests.map((request) => (
              <article
                key={request.id}
                className="grid grid-cols-[36px_1fr_auto_auto] items-center gap-4 py-3"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  {iconMap.requests}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-black">{request.medicine}</p>
                  <p className="truncate text-xs font-medium text-neutral-500">
                    {request.facility} - {request.id.startsWith("sample") ? "No request id" : `REQ-${request.id.slice(0, 8)}`}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold text-black">
                    {formatNumber(request.quantity)} units
                  </p>
                  <p className="text-neutral-400">{request.date}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    statusClass[request.status] || "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {formatRequestStatus(request.status)}
                </span>
              </article>
            ))}
          </div>
        </Panel>

        <Panel
          title="Low Stock Alerts"
          action={
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-700">
              {formatNumber(lowStockRows.length)} alerts
            </span>
          }
        >
          {lowStockRows.length === 0 ? (
            <p className="rounded-lg bg-neutral-50 px-4 py-8 text-center text-sm font-semibold text-neutral-500">
              No low stock alerts right now.
            </p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {lowStockRows.map((row) => {
                const threshold = Number(row.threshold || 1);
                const quantity = Number(row.quantity || 0);
                const percent = Math.min(100, Math.round((quantity / threshold) * 100));
                const isCritical = percent <= 35;

                return (
                  <article key={row.inventory_id} className="py-3">
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
                        className={`h-full rounded-full ${
                          isCritical ? "bg-red-500" : "bg-orange-500"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <button className="mt-5 text-sm font-bold text-emerald-700 hover:text-emerald-800">
            Create restock requests -&gt;
          </button>
        </Panel>
      </section>
    </AdminShell>
  );
}
