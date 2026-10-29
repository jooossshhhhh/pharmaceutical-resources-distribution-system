import { useState, useMemo, useEffect } from "react";
import { useLocation } from "react-router-dom";
import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import {
  DisposeStockModal,
  DownloadIcon,
  FacilityPicker,
  InventoryTabToggle,
  InventoryTable,
  MedicineOrderToggle,
  MetricCard,
  PlusIcon,
  SearchIcon,
} from "./inventoryComponents";
import { formatCurrency, formatDate, formatNumber } from "@shared/utils/inventoryUtils";
import { useInventoryData } from "@backend/services/inventoryData";
import { ChoStockModal } from "./components/ChoStockModal";
import { MedicineStockDetailsView } from "./components/MedicineStockDetailsView";

export default function ChoInventoryModule() {
  const { profile } = useAuth();
  const data = useInventoryData({ isBhw: false });
  const [disposingLot, setDisposingLot] = useState(null);
  const [isDisposing, setIsDisposing] = useState(false);
  const [viewingMedicine, setViewingMedicine] = useState(null);

  const {
    inventory,
    canManage,
    ownFacilityId,
    ownFacilityName,
    today,
    facilities,
    facilityOptions,
    facilityFilter,
    selectFacility,
    selectedFacility,
    viewingOwnFacility,
    medicines,
    suppliers,
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
    handleMedicineOrder,
    clearFilters,
    toggleStockFilter,
    handleExportExcel,
    openItemModal,
    closeModal,
    handleFieldChange,
    handlePoItemChange,
    handleAddPoItem,
    handleRemovePoItem,
    handleSaveInventory,
    handleDisposeStock,
  } = data;

  const location = useLocation();

  useEffect(() => {
    if (location.state?.filterMedicineName) {
      setSearchTerm(location.state.filterMedicineName);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, setSearchTerm]);

  const headerTitle =
    inventoryTab === "EXPIRED"
      ? "Expired Stocks Quarantine"
      : selectedFacility
        ? `${selectedFacility.facility_name} Inventory`
        : "All Health Centers Inventory";

  const headerDescription =
    inventoryTab === "EXPIRED"
      ? "Quarantined expired medicines pending condemnation protocol and disposal."
      : selectedFacility
        ? `Track medicine stock levels and lot batches for ${selectedFacility.facility_name}.`
        : "City-wide view of medicine stock levels across all Naga City health centers.";

  const totalItemsSub =
    inventoryTab === "EXPIRED"
      ? "quarantined for disposal"
      : selectedFacility
        ? `in ${selectedFacility.facility_name}`
        : "across all Naga health centers";

  const criticalSub = summary.stockedOut > 0 ? `${formatNumber(summary.stockedOut)} fully stocked out` : "needs immediate restock";

  const activeViewingItem = useMemo(() => {
    if (!viewingMedicine) return null;
    return (
      filteredInventory.find(
        (item) => item.medicine_id === viewingMedicine.medicine_id || item.id === viewingMedicine.id
      ) || viewingMedicine
    );
  }, [filteredInventory, viewingMedicine]);

  const handleSelectTab = (tab) => {
    setViewingMedicine(null);
    selectInventoryTab(tab);
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {inventoryError && !modalMode && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
          {inventoryError}
        </p>
      )}

      {activeViewingItem ? (
        <MedicineStockDetailsView
          item={activeViewingItem}
          canManage={canManage}
          isBhw={false}
          facilityName={activeViewingItem?.facility?.facility_name || selectedFacility?.facility_name || "City Health Office - City of Naga"}
          onBack={() => setViewingMedicine(null)}
          onEditLot={(lot) => openItemModal(lot, "edit")}
          onDisposeLot={(lot) => setDisposingLot(lot)}
          onAddBatch={() => openCreateModal("PROCUREMENT", activeViewingItem?.medicine_id)}
        />
      ) : (
        <>
          <section className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] px-4 py-3 shadow-xs">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black leading-none text-[#1B2B30]">{headerTitle}</h2>
                <p className="mt-1 text-xs font-semibold text-[#5B7077]">
                  {headerDescription}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {inventoryTab !== "EXPIRED" && (
                  <FacilityPicker
                    facilities={facilityOptions}
                    value={facilityFilter}
                    onSelect={selectFacility}
                    className="w-full sm:w-64"
                  />
                )}
                <InventoryTabToggle
                  activeTab={inventoryTab}
                  onSelectTab={handleSelectTab}
                />
              </div>
            </div>
          </section>

      {inventoryTab === "EXPIRED" ? (
        <div className="mt-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-4">
          <MetricCard
            label="Expired Medicines"
            value={formatNumber(expiredSummary.totalItems)}
            sub={totalItemsSub}
            compact
          />
          <MetricCard
            label="Total Expired Units"
            value={formatNumber(expiredSummary.totalUnits)}
            sub="locked from dispensing"
            compact
          />
          <MetricCard
            label="Estimated Loss Value"
            value={formatCurrency(expiredSummary.totalLossValue)}
            sub="based on unit acquisition cost"
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
            sub={totalItemsSub}
            onClick={() => toggleStockFilter("ALL")}
            active={stockFilter === "ALL"}
            compact
          />
          <MetricCard
            label="Critical Stock"
            value={formatNumber(summary.critical)}
            sub={criticalSub}
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

      <section className="mt-3.5 overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs">
        <div className="flex flex-col gap-2.5 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <h2 className="text-base font-black text-[#1B2B30]">
            {inventoryTab === "EXPIRED"
              ? "Expired Stocks List"
              : "Dispensable Stock List"}
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
                className="h-9 w-full rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] pl-9 pr-3 text-sm font-medium text-[#1B2B30] outline-none transition placeholder:text-[#5B7077] focus:border-[#34769B] focus:ring-2 focus:ring-[#34769B]/20"
              />
            </label>
            <div className="flex items-center gap-2">
              <MedicineOrderToggle
                direction={inventorySort.key === "medicine" ? inventorySort.direction : "ASC"}
                onToggle={handleMedicineOrder}
              />
              {inventoryTab !== "EXPIRED" && (
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="btn-secondary inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-bold shadow-xs transition cursor-pointer"
                >
                  <DownloadIcon />
                  Export
                </button>
              )}
              {canManage && (
                inventoryTab === "EXPIRED" ? (
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    title="Export official quarantine list of expired medicines for COA and DOH condemnation"
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#D9826B]/40 bg-[#FBE9E3] px-4 text-sm font-bold text-[#8F3F2B] shadow-xs hover:bg-[#FBE9E3]/80 transition cursor-pointer"
                  >
                    <DownloadIcon />
                    Condemnation Report
                  </button>
                ) : (
                  (viewingOwnFacility || !selectedFacility || facilityFilter === "ALL") && (
                    <button
                      type="button"
                      onClick={() => openCreateModal("PROCUREMENT")}
                      className="btn-primary inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-bold text-white shadow-sm transition active:scale-[0.99] cursor-pointer"
                    >
                      <PlusIcon />
                      Add Stock
                    </button>
                  )
                )
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
          showFacility={inventoryTab === "EXPIRED" || !selectedFacility || facilityFilter === "ALL"}
        />
      </section>
    </>
  )}

      {modalMode && modalMode !== "view" && (
        <ChoStockModal
          key={modalMode === "create" ? "create" : `${modalMode}-${selectedItem?.id || "stock"}`}
          mode={modalMode}
          selectedItem={selectedItem}
          formValues={formValues}
          inventory={inventory}
          facilities={facilities}
          medicines={medicines}
          suppliers={suppliers}
          consumptionByMedicine={consumptionByMedicine}
          error={inventoryError}
          isSaving={isSaving}
          onClose={closeModal}
          onChange={handleFieldChange}
          onPoItemChange={handlePoItemChange}
          onAddPoItem={handleAddPoItem}
          onRemovePoItem={handleRemovePoItem}
          onSubmit={handleSaveInventory}
          onEditLot={(lot) => openItemModal(lot, "edit")}
          onDisposeLot={(lot) => setDisposingLot(lot)}
          onCancelEdit={closeModal}
          canEdit={canManage}
        />
      )}

      <DisposeStockModal
        lot={disposingLot}
        isOpen={Boolean(disposingLot)}
        onClose={() => setDisposingLot(null)}
        onConfirm={async (lot, { method, remarks }) => {
          setIsDisposing(true);
          await handleDisposeStock(lot, { method, remarks });
          setIsDisposing(false);
          setDisposingLot(null);
        }}
        isSubmitting={isDisposing}
      />
    </AdminShell>
  );
}
