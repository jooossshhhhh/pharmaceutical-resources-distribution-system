import { Link } from "react-router-dom";

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
import { BhwStockModal } from "./components/BhwStockModal";

export default function BhwInventoryModule() {
  const { profile } = useAuth();
  const data = useInventoryData({ isBhw: true });

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
    inventorySort,
    currentPage,
    setCurrentPage,
    isLoading,
    inventoryError,
    modalMode,
    selectedItem,
    filteredInventory,
    paginatedInventory,
    totalPages,
    hasActiveFilters,
    handleSort,
    handleMedicineOrder,
    clearFilters,
    toggleStockFilter,
    handleExportExcel,
    openItemModal,
    closeModal,
  } = data;

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {inventoryError && !modalMode && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
          {inventoryError}
        </p>
      )}

      <section className="rounded-xl border border-[#d8dadc] bg-white px-4 py-2.5 shadow-xs">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-black leading-none text-[#0d1117]">
              {profile?.facility_name || "Barangay Health Station"}
            </h2>
          </div>
          <div>
            <InventoryTabToggle
              activeTab={inventoryTab}
              onSelectTab={selectInventoryTab}
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
              sub="in your health station"
              compact
            />
            <MetricCard
              label="Total Expired Units"
              value={formatNumber(expiredSummary.totalUnits)}
              sub="locked from dispensing"
              compact
            />
            <MetricCard
              label="Quarantined Batches"
              value={formatNumber(expiredSummary.totalLots ?? expiredSummary.totalItems)}
              sub="batches requiring return"
              compact
            />
            <MetricCard
              label="Disposal Status"
              value={expiredSummary.status}
              sub="quarantined for disposal"
              compact
            />
          </div>
      ) : (
        <div className="mt-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-4">
          <MetricCard
            label="All Stock"
            value={formatNumber(summary.totalItems)}
            sub="in your health station"
            onClick={() => toggleStockFilter("ALL")}
            active={stockFilter === "ALL"}
            compact
          />
          <MetricCard
            label="Critical Stock"
            value={formatNumber(summary.critical)}
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
            sub="restock recommended"
            onClick={() => toggleStockFilter("LOW")}
            active={stockFilter === "LOW"}
            compact
          />
          <MetricCard
            label="Near Expiry"
            value={formatNumber(summary.expiring)}
            sub="within the next 30 days"
            onClick={() => toggleStockFilter("EXPIRING")}
            active={stockFilter === "EXPIRING"}
            compact
          />
        </div>
      )}

      <section className="mt-3.5 overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-xs">
        <div className="flex flex-col gap-2.5 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <h2 className="text-base font-black text-[#0d1117]">
            {inventoryTab === "EXPIRED" ? "Expired Stocks List" : "Dispensable Stock List"}
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block sm:w-80">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
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
                className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-4 text-sm font-bold text-neutral-700 shadow-xs hover:bg-neutral-50 hover:border-neutral-300 transition cursor-pointer"
              >
                <DownloadIcon />
                Export
              </button>
              {inventoryTab !== "EXPIRED" && (
                <Link
                  to="/requests"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117]"
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
          onOpenItem={(item) => openItemModal(item, "view")}
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
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117]"
            >
              <RequestIcon />
              Request Stock
            </Link>
          }
        />
      </section>

      {modalMode && (
        <BhwStockModal
          key={modalMode === "create" ? "create" : selectedItem?.id}
          mode={modalMode}
          selectedItem={selectedItem}
          error={inventoryError}
          onClose={closeModal}
        />
      )}
    </AdminShell>
  );
}
