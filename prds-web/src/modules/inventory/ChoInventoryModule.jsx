import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import {
  AlertCircleIcon,
  ClockIcon,
  DownloadIcon,
  FacilityPicker,
  InventoryTable,
  LayersIcon,
  MetricCard,
  PlusIcon,
  RequestIcon,
  SearchIcon,
  TriangleIcon,
} from "./inventoryComponents";
import { formatNumber } from "./inventoryUtils";
import { useInventoryData } from "./inventoryData";
import { ChoStockModal } from "./components/ChoStockModal";

export default function ChoInventoryModule() {
  const { profile } = useAuth();
  const data = useInventoryData({ isBhw: false });

  const {
    canManage,
    ownFacilityName,
    today,
    facilities,
    medicines,
    suppliers,
    consumptionByMedicine,
    facilityOptions,
    selectedFacility,
    viewingOwnFacility,
    summary,
    reorderQtyByItemId,
    searchTerm,
    setSearchTerm,
    facilityFilter,
    stockFilter,
    inventorySort,
    currentPage,
    setCurrentPage,
    isLoading,
    isSaving,
    inventoryError,
    modalMode,
    selectedItem,
    formValues,
    filteredInventory,
    paginatedInventory,
    totalPages,
    hasActiveFilters,
    openCreateModal,
    handleSort,
    selectFacility,
    clearFilters,
    toggleStockFilter,
    handleExportCsv,
    openItemModal,
    closeModal,
    handleFieldChange,
    handleSaveInventory,
    fetchStockHistory,
  } = data;

  const totalItemsSub = `at ${selectedFacility?.facility_name || ownFacilityName}`;

  const criticalSub = summary.stockedOut > 0 ? `${formatNumber(summary.stockedOut)} fully stocked out` : "needs immediate restock";

  const reorderCount = Object.keys(reorderQtyByItemId).length;

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {inventoryError && !modalMode && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {inventoryError}
        </p>
      )}

      <section className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-sm shadow-neutral-200/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 lg:flex-1">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
              Central stock command
            </p>
            <h2 className="mt-1 text-xl font-black text-[#0d1117]">CHO Inventory</h2>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Monitor central stock batches, thresholds, expirations, and reorder needs.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {selectedFacility?.facility_code && (
              <span className="inline-flex h-10 items-center rounded-lg border border-neutral-200 bg-[#fbfaf8] px-3 text-xs font-black uppercase tracking-[0.12em] text-neutral-500">
                {selectedFacility.facility_code}
              </span>
            )}
            <FacilityPicker
              facilities={facilityOptions}
              value={facilityFilter}
              onSelect={selectFacility}
              selectedLabel="Select Facility"
              className="sm:w-60"
              dropdownClassName="sm:w-80 md:w-96"
            />
          </div>
        </div>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="All Stock"
          value={formatNumber(summary.totalItems)}
          sub={totalItemsSub}
          tone="emerald"
          onClick={() => toggleStockFilter("ALL")}
          active={stockFilter === "ALL"}
          compact
        >
          <LayersIcon />
        </MetricCard>
        <MetricCard
          label="Critical Stock"
          value={formatNumber(summary.critical)}
          sub={criticalSub}
          tone="red"
          onClick={() => toggleStockFilter("CRITICAL")}
          active={stockFilter === "CRITICAL"}
          compact
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
          compact
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
          compact
        >
          <ClockIcon />
        </MetricCard>
        <MetricCard
          label="Needs Reorder"
          value={formatNumber(reorderCount)}
          sub={
            reorderCount > 0
              ? "below 30-day demand"
              : "all items have sufficient stock"
          }
          tone="teal"
          onClick={() => toggleStockFilter("REORDER")}
          active={stockFilter === "REORDER"}
          compact
        >
          <RequestIcon />
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
              {canManage && viewingOwnFacility && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-black px-4 text-sm font-black text-white shadow-sm transition hover:bg-neutral-800"
                >
                  <PlusIcon />
                  Add Stock
                </button>
              )}
            </div>
          </div>
        </div>

        <InventoryTable
          variant="choBatch"
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
        />
      </section>

      {modalMode && (
        <ChoStockModal
          key={modalMode === "create" ? "create" : `${modalMode}-${selectedItem?.id || "stock"}`}
          mode={modalMode}
          selectedItem={selectedItem}
          formValues={formValues}
          facilities={facilities}
          medicines={medicines}
          suppliers={suppliers}
          consumptionByMedicine={consumptionByMedicine}
          error={inventoryError}
          isSaving={isSaving}
          onClose={closeModal}
          onChange={handleFieldChange}
          onSubmit={handleSaveInventory}
          onEdit={() => selectedItem && openItemModal(selectedItem, "edit")}
          onCancelEdit={() => selectedItem && openItemModal(selectedItem, "view")}
          canEdit={canManage}
          fetchStockHistory={fetchStockHistory}
        />
      )}
    </AdminShell>
  );
}
