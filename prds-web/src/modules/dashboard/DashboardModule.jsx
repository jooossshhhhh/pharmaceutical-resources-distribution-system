import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { supabase } from "../../services/supabase";
import { logoutUser } from "../../features/auth/AuthService";
import DistributionChart from "./components/DistributionChart";
import EmptyState from "./components/EmptyState";
import MiniBarChart from "./components/MiniBarChart";
import Panel from "./components/Panel";
import StatCard from "./components/StatCard";
import {
  emptyStats,
  formatDateTime,
  formatNumber,
  getRelativeTime,
} from "./dashboardUtils";

export default function DashboardModule() {
  const { profile } = useAuth();
  const [stats, setStats] = useState(emptyStats);
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [recentTransfers, setRecentTransfers] = useState([]);
  const [dispensingDistribution, setDispensingDistribution] = useState([]);
  const [forecastRows, setForecastRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  const today = useMemo(() => formatDateTime(new Date()), []);

  const loadDashboard = async () => {
    setIsLoading(true);
    setDashboardError("");

    try {
      const [
        inventoryResult,
        lowStockResult,
        expiringResult,
        pendingRequestsResult,
        inboundTransfersResult,
        pendingProfilesResult,
        activitiesResult,
        transfersResult,
        monthlyDispensingResult,
      ] = await Promise.all([
        supabase.from("inventory_overview").select("quantity"),
        supabase.from("low_stock_view").select("inventory_id", { count: "exact", head: true }),
        supabase.from("expiring_medicines_view").select("inventory_id", { count: "exact", head: true }),
        supabase.from("medicine_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
        supabase.from("stock_transfers").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
        supabase
          .from("profiles")
          .select("id, first_name, last_name, email, role, facility_id, status, created_at")
          .eq("status", "PENDING")
          .order("created_at", { ascending: true })
          .limit(3),
        supabase
          .from("activity_logs")
          .select("id, action, module, details, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("stock_transfers")
          .select(`
            id,
            status,
            created_at,
            source:facilities!stock_transfers_source_facility_id_fkey(facility_name),
            destination:facilities!stock_transfers_destination_facility_id_fkey(facility_name)
          `)
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("monthly_dispensing_summary")
          .select("month, total_dispensed, medicine_id")
          .order("month", { ascending: true }),
      ]);

      const results = [
        inventoryResult,
        lowStockResult,
        expiringResult,
        pendingRequestsResult,
        inboundTransfersResult,
        pendingProfilesResult,
        activitiesResult,
        transfersResult,
        monthlyDispensingResult,
      ];
      const firstError = results.find((result) => result.error)?.error;

      if (firstError) {
        throw firstError;
      }

      const inventoryRows = inventoryResult.data || [];
      const totalQuantity = inventoryRows.reduce(
        (sum, row) => sum + Number(row.quantity || 0),
        0
      );
      const monthlyRows = monthlyDispensingResult.data || [];
      const monthTotals = monthlyRows.reduce((map, row) => {
        const monthLabel = new Date(row.month).toLocaleString("en-US", {
          month: "short",
        });
        map.set(monthLabel, (map.get(monthLabel) || 0) + Number(row.total_dispensed || 0));
        return map;
      }, new Map());
      const distributionRows = monthlyRows.slice(0, 4).map((row, index) => ({
        label: `Medicine ${index + 1}`,
        value: Number(row.total_dispensed || 0),
      }));

      setStats({
        inventoryItems: inventoryRows.length,
        totalQuantity,
        lowStock: lowStockResult.count || 0,
        expiring: expiringResult.count || 0,
        pendingRequests: pendingRequestsResult.count || 0,
        inboundTransfers: inboundTransfersResult.count || 0,
      });
      setPendingProfiles(pendingProfilesResult.data || []);
      setRecentActivities(activitiesResult.data || []);
      setRecentTransfers(transfersResult.data || []);
      setForecastRows(
        ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((label) => ({
          label,
          value: monthTotals.get(label) || 0,
        }))
      );
      setDispensingDistribution(
        distributionRows.length > 0
          ? distributionRows
          : [
              { label: "Amoxicillin", value: 35 },
              { label: "Paracetamol", value: 25 },
              { label: "Metformin", value: 15 },
              { label: "Others", value: 10 },
            ]
      );
    } catch (error) {
      setDashboardError(error?.message || "Unable to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadDashboard();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const handleProfileDecision = async (profileId, status) => {
    const { error } = await supabase
      .from("profiles")
      .update({
        status,
        approved_by: profile?.id || null,
        approved_at: status === "ACTIVE" ? new Date().toISOString() : null,
      })
      .eq("id", profileId);

    if (error) {
      setDashboardError(error.message);
      return;
    }

    await loadDashboard();
  };

  return (
    <AdminShell
      currentDateTime={today}
      profile={profile}
      onSignOut={logoutUser}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-950">
            System Overview
          </h2>
          <p className="text-sm font-medium text-slate-500">
            Real-time pharmaceutical logistics and distribution monitoring.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-md border border-emerald-600 bg-white px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50">
            View Reports
          </button>
          <button className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">
            Approve Requests
          </button>
        </div>
      </div>

      {dashboardError && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {dashboardError}
        </p>
      )}

      <div className="grid grid-cols-6 gap-3">
        <StatCard
          label="Inventory Items"
          value={isLoading ? "..." : formatNumber(stats.inventoryItems)}
          icon="INV"
          note="+2.4%"
          tone="green"
        />
        <StatCard
          label="Total Quantity"
          value={isLoading ? "..." : formatNumber(stats.totalQuantity)}
          icon="QTY"
          tone="blue"
        />
        <StatCard
          label="Low Stock SKUs"
          value={isLoading ? "..." : formatNumber(stats.lowStock)}
          icon="LOW"
          tone="red"
        />
        <StatCard
          label="Expiring <90d"
          value={isLoading ? "..." : formatNumber(stats.expiring)}
          icon="EXP"
          tone="amber"
        />
        <StatCard
          label="Pending Req."
          value={isLoading ? "..." : formatNumber(stats.pendingRequests)}
          icon="REQ"
          tone="blue"
        />
        <StatCard
          label="Inbound Trans."
          value={isLoading ? "..." : formatNumber(stats.inboundTransfers)}
          icon="TRN"
          tone="slate"
        />
      </div>

      <div className="mt-4 grid grid-cols-[1fr_1fr_280px] gap-4">
        <div className="space-y-4">
          <Panel title="Medicine Demand Forecast" action={<span className="text-sm font-black text-slate-500">Trend</span>}>
            <MiniBarChart rows={forecastRows} />
          </Panel>

          <Panel
            title="Pending Account Approvals"
            action={
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">
                {pendingProfiles.length} waiting
              </span>
            }
          >
            {pendingProfiles.length === 0 ? (
              <EmptyState label="No pending account approvals." />
            ) : (
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-blue-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3">User Name</th>
                      <th className="px-3 py-3">Role Requested</th>
                      <th className="px-3 py-3">Facility</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingProfiles.map((pendingProfile) => (
                      <tr key={pendingProfile.id}>
                        <td className="px-3 py-3">
                          <p className="font-black text-slate-950">
                            {pendingProfile.first_name} {pendingProfile.last_name}
                          </p>
                          <p className="mt-1 text-[10px] font-semibold text-slate-500">
                            {pendingProfile.email || "Phone registration"}
                          </p>
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-600">
                          {pendingProfile.role}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-600">
                          {pendingProfile.facility_id || "Unassigned"}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleProfileDecision(pendingProfile.id, "ACTIVE")}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              aria-label="Approve account"
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              onClick={() => handleProfileDecision(pendingProfile.id, "DEACTIVATED")}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-red-200 text-red-700 hover:bg-red-50"
                              aria-label="Deactivate account"
                            >
                              X
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Inter-Facility Transfers">
            {recentTransfers.length === 0 ? (
              <EmptyState label="No recent stock transfers." />
            ) : (
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Transfer ID</th>
                      <th className="px-3 py-3">Source</th>
                      <th className="px-3 py-3">Destination</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentTransfers.map((transfer) => (
                      <tr key={transfer.id}>
                        <td className="px-3 py-3 font-bold text-slate-700">
                          #{transfer.id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-600">
                          {transfer.source?.facility_name || "Source"}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-600">
                          {transfer.destination?.facility_name || "Destination"}
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-blue-700">
                            {transfer.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-black text-slate-500">
                          View
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Dispensing Distribution" action={<span className="text-sm">Share</span>}>
            <DistributionChart rows={dispensingDistribution} />
          </Panel>

          <Panel title="Operational Watchlist">
            <div className="grid gap-3">
              <div className="rounded-md border border-red-100 bg-red-50 p-4">
                <p className="text-xs font-black uppercase text-red-700">Critical stock</p>
                <p className="mt-1 text-2xl font-black text-red-700">
                  {formatNumber(stats.lowStock)}
                </p>
                <p className="mt-1 text-xs font-semibold text-red-600">
                  SKUs at or below threshold.
                </p>
              </div>
              <div className="rounded-md border border-amber-100 bg-amber-50 p-4">
                <p className="text-xs font-black uppercase text-amber-700">Expiry risk</p>
                <p className="mt-1 text-2xl font-black text-amber-700">
                  {formatNumber(stats.expiring)}
                </p>
                <p className="mt-1 text-xs font-semibold text-amber-700">
                  Medicine batches expiring within 90 days.
                </p>
              </div>
              <div className="rounded-md border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-black uppercase text-blue-700">Approvals queue</p>
                <p className="mt-1 text-2xl font-black text-blue-700">
                  {formatNumber(stats.pendingRequests + pendingProfiles.length)}
                </p>
                <p className="mt-1 text-xs font-semibold text-blue-700">
                  Requests and account approvals awaiting action.
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <Panel title="Recent Activity" action={<span className="text-sm text-slate-500">Refresh</span>} className="self-start">
          {recentActivities.length === 0 ? (
            <EmptyState label="No activity logs recorded yet." />
          ) : (
            <div className="space-y-4">
              {recentActivities.map((activity) => (
                <article key={activity.id} className="flex gap-3">
                  <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-black text-emerald-700">
                    {activity.module?.[0]?.toUpperCase() || "A"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-xs font-black text-slate-950">
                        {activity.action}
                      </p>
                      <span className="shrink-0 text-[10px] font-bold text-slate-400">
                        {getRelativeTime(activity.created_at)}
                      </span>
                    </div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      Module: {activity.module}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {activity.details}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
          <button className="mt-6 w-full border-t border-slate-100 pt-4 text-center text-xs font-black text-emerald-700">
            View All Logs
          </button>
        </Panel>
      </div>

      <footer className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4 text-[10px] font-semibold text-slate-500">
        <span>Pharmaceutical Resource & Distribution System (PRDS)</span>
        <div className="flex gap-4 text-emerald-700">
          <span>Support Desk</span>
          <span>Knowledge Base</span>
        </div>
      </footer>
    </AdminShell>
  );
}
