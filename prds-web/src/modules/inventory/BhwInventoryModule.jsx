import { Link } from "react-router-dom";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { useInventoryData } from "./inventoryData";
import {
  AlertCircleIcon,
  ClockIcon,
  DownloadIcon,
  InventoryTable,
  LayersIcon,
  MetricCard,
  RequestIcon,
  SearchIcon,
  TriangleIcon,
} from "./inventoryComponents";
import { formatNumber } from "./inventoryUtils";
import { BhwStockModal } from "./components/BhwStockModal";

export default function BhwInventoryModule() {
  const { profile } = useAuth();
  const data = useInventoryData({ isBhw: true });

  const {
    today,
    consumptionByMedicine,
    summary,
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
    relatedStock,
    hasActiveFilters,
    handleSort,
    clearFilters,
    toggleStockFilter,
    handleExportCsv,
    openItemModal,
    closeModal,
  } = data;

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {inventoryError && !modalMode && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {inventoryError}
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Total Items"
          value={formatNumber(summary.totalItems)}
          tone="emerald"
          onClick={() => toggleStockFilter("ALL")}
          active={stockFilter === "ALL"}
        >
          <LayersIcon />
        </MetricCard>
        <MetricCard
          label="Critical Stock"
          value={formatNumber(summary.critical)}
          sub={
            summary.stockedOut > 0
              ? `${formatNumber(summary.stockedOut)} fully stocked out`
              : "needs immediate restock"
          }
          tone="red"
          onClick={() => toggleStockFilter("CRITICAL")}
          active={stockFilter === "CRITICAL"}
        >
          <AlertCircleIcon />
        </MetricCard>
        <MetricCard
          label="Low Stock"
          value={formatNumber(summary.low)}
          sub="restock recommended"
          tone="orange"
          onClick={() => toggleStockFilter("LOW")}
          active={stockFilter === "LOW"}
        >
          <TriangleIcon />
        </MetricCard>
        <MetricCard
          label="Expiring Soon"
          value={formatNumber(summary.expiring)}
          sub={
            summary.expired > 0
              ? `${formatNumber(summary.expired)} already expired`
              : "within the next 30 days"
          }
          tone="amber"
          onClick={() => toggleStockFilter("EXPIRING")}
          active={stockFilter === "EXPIRING"}
        >
          <ClockIcon />
        </MetricCard>
      </div>

      <section className="mt-5 overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-neutral-200/40">
        <div className="flex flex-col gap-3 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
          <h2 className="text-base font-black text-[#0d1117]">
            Inventory List{" "}
            <span className="font-semibold text-neutral-400">
              ({filteredInventory.length} items)
            </span>
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block sm:w-72">
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
                placeholder="Search medicine, brand, batch..."
                className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-4 text-sm font-black text-neutral-700 shadow-sm hover:bg-neutral-50"
              >
                <DownloadIcon />
                Export CSV
              </button>
              <Link
                to="/requests"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d1117]"
              >
                <RequestIcon />
                Request Stock
              </Link>
            </div>
          </div>
        </div>

        <InventoryTable
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
          relatedStock={relatedStock}
          consumptionByMedicine={consumptionByMedicine}
          error={inventoryError}
          onClose={closeModal}
        />
      )}
    </AdminShell>
  );
}
