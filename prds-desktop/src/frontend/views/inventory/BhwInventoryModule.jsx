import { useState, useMemo, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Boxes,
  AlertOctagon,
  AlertTriangle,
  Clock,
  PackageX,
  Archive,
  ShieldAlert,
} from "lucide-react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { useInventoryData } from "@backend/services/inventoryData";
import {
  DownloadIcon,
  InventoryTabToggle,
  InventoryTable,
  MedicineOrderToggle,
  MetricCard,
  RequestIcon,
  SearchIcon,
} from "./inventoryComponents";
import { formatNumber } from "@shared/utils/inventoryUtils";
import { MedicineStockDetailsView } from "./components/MedicineStockDetailsView";

export default function BhwInventoryModule() {
  const { profile } = useAuth();
  const location = useLocation();
  const data = useInventoryData({ isBhw: true });
  const [viewingMedicine, setViewingMedicine] = useState(null);

  const {
    today,
    consumptionByMedicine,
    inventoryTab,
    selectInventoryTab,
    dispensableItemCount,
    expiredItemCount,
    summary,
    expiredSummary,
    searchTerm,
    setSearchTerm,
    stockFilter,
    setStockFilter,
    inventorySort,
    currentPage,
    setCurrentPage,
    isLoading,
    inventoryError,
    filteredInventory,
    paginatedInventory,
    totalPages,
    hasActiveFilters,
    handleSort,
    handleMedicineOrder,
    clearFilters,
    toggleStockFilter,
    handleExportExcel,
    handleUpdateThreshold,
  } = data;

  const navigate = useNavigate();

  useEffect(() => {
    const state = location.state;
    if (!state) return;
    if (state.filterMedicineName) {
      setSearchTerm(state.filterMedicineName);
    }
    if (state.stockFilter) {
      setStockFilter(state.stockFilter);
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate, setSearchTerm, setStockFilter]);

  const activeViewingItem = useMemo(() => {
    if (!viewingMedicine) return null;
    return (
      filteredInventory.find(
        (item) =>
          item.medicine_id === viewingMedicine.medicine_id ||
          item.id === viewingMedicine.id
      ) || viewingMedicine
    );
  }, [filteredInventory, viewingMedicine]);

  const handleSelectTab = (tab) => {
    setViewingMedicine(null);
    selectInventoryTab(tab);
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {inventoryError && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
          {inventoryError}
        </p>
      )}

      {activeViewingItem ? (
        <MedicineStockDetailsView
          item={activeViewingItem}
          canManage={false}
          isBhw={true}
          facilityName={profile?.facility_name || "Barangay Health Station"}
          onBack={() => setViewingMedicine(null)}
          onUpdateThreshold={handleUpdateThreshold}
          consumptionByMedicine={consumptionByMedicine}
        />
      ) : (
        <>
          <section className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] px-4 py-2.5 shadow-xs">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-black leading-none text-[#1B2B30]">
                  {profile?.facility_name || "Barangay Health Station"}
                </h2>
              </div>
              <div>
                <InventoryTabToggle
                  activeTab={inventoryTab}
                  onSelectTab={handleSelectTab}
                  showReturnsTab={false}
                />
              </div>
            </div>
          </section>

          {inventoryTab === "EXPIRED" ? (
            <div className="mt-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-4">
              <MetricCard
                label="Expired Medicines"
                value={formatNumber(expiredSummary.totalItems)}
                icon={<AlertOctagon className="h-4 w-4" />}
                tone="red"
                sub="in your health station"
                compact
              />
              <MetricCard
                label="Total Expired Units"
                value={formatNumber(expiredSummary.totalUnits)}
                icon={<PackageX className="h-4 w-4" />}
                tone="orange"
                sub="locked from dispensing"
                compact
              />
              <MetricCard
                label="Quarantined Batches"
                value={formatNumber(expiredSummary.totalLots ?? expiredSummary.totalItems)}
                icon={<Archive className="h-4 w-4" />}
                tone="blue"
                sub="batches requiring return"
                compact
              />
              <MetricCard
                label="Disposal Status"
                value={expiredSummary.status}
                icon={<ShieldAlert className="h-4 w-4" />}
                tone="amber"
                sub="quarantined for disposal"
                compact
              />
            </div>
          ) : (
            <div className="mt-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-4">
              <MetricCard
                label="All Stock"
                value={formatNumber(summary.totalItems)}
                icon={<Boxes className="h-4 w-4" />}
                tone="blue"
                sub="in your health station"
                onClick={() => {
                  setStockFilter("ALL");
                  setCurrentPage(1);
                }}
                active={stockFilter === "ALL"}
                compact
              />
              <MetricCard
                label="Critical Stock"
                value={formatNumber(summary.critical)}
                icon={<AlertOctagon className="h-4 w-4" />}
                tone="red"
                sub={
                  summary.stockedOut > 0
                    ? `${formatNumber(summary.stockedOut)} fully stocked out`
                    : "needs immediate restock"
                }
                onClick={() => toggleStockFilter("CRITICAL")}
                active={stockFilter === "CRITICAL"}
                compact
              />
              <MetricCard
                label="Low Stock"
                value={formatNumber(summary.low)}
                icon={<AlertTriangle className="h-4 w-4" />}
                tone="amber"
                sub="restock recommended"
                onClick={() => toggleStockFilter("LOW")}
                active={stockFilter === "LOW"}
                compact
              />
              <MetricCard
                label="Near Expiry"
                value={formatNumber(summary.expiring)}
                icon={<Clock className="h-4 w-4" />}
                tone="orange"
                sub="within the next 30 days"
                onClick={() => toggleStockFilter("EXPIRING")}
                active={stockFilter === "EXPIRING"}
                compact
              />
            </div>
          )}

          <section className="mt-3.5 overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs">
            <div className="flex flex-col gap-2.5 px-4 py-3 xl:flex-row xl:items-center xl:justify-between border-b border-[#CFDDE0]/60">
              <h2 className="text-base font-black text-[#1B2B30]">
                {inventoryTab === "EXPIRED" ? "Expired Stocks List" : "Dispensable Stock List"}
              </h2>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative block sm:w-80">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5B7077]">
                    <SearchIcon />
                  </span>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search medicine, brand, lot number..."
                    className="h-9 w-full rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] pl-9 pr-3 text-sm font-medium text-[#1B2B30] outline-none transition placeholder:text-[#5B7077]/70 focus:border-[#34769B] focus:ring-2 focus:ring-[#E3EEF5]"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <MedicineOrderToggle
                    direction={inventorySort.key === "medicine" ? inventorySort.direction : "ASC"}
                    onToggle={handleMedicineOrder}
                  />
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-4 text-sm font-bold text-[#1B2B30] shadow-xs hover:bg-[#E5EFF1] hover:border-[#CFDDE0] transition cursor-pointer"
                  >
                    <DownloadIcon />
                    Export
                  </button>
                  {inventoryTab !== "EXPIRED" && (
                    <Link
                      to="/requests"
                      className="btn-primary inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-black text-white shadow-xs transition active:scale-[0.99]"
                    >
                      <RequestIcon />
                      Request Stock
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <InventoryTable
              variant="medicine"
              rows={paginatedInventory}
              isLoading={isLoading}
              totalCount={filteredInventory.length}
              hasActiveFilters={hasActiveFilters}
              sortKey={inventorySort.key}
              sortDirection={inventorySort.direction}
              onSort={handleSort}
              onOpenItem={(item) => setViewingMedicine(item)}
              onClearFilters={clearFilters}
              consumptionByMedicine={consumptionByMedicine}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              isExpiredTab={inventoryTab === "EXPIRED"}
              emptyHint="Request stock from your Provincial/City Health Office to start tracking medicine inventory."
              emptyAction={
                <Link
                  to="/requests"
                  className="btn-primary mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black text-white shadow-xs transition active:scale-[0.99]"
                >
                  <RequestIcon />
                  Request Stock
                </Link>
              }
            />
          </section>
        </>
      )}
    </AdminShell>
  );
}
