import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AdminShell from "../../components/layout/AdminShell";
import ModalShell from "../../components/ModalShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";
import { formatFacilityType } from "../facilities/facilityFormat";
import DemandPanel from "./demandPanel";
import { buildChannelSeries, computeDaysOfSupply, computeStockOutDate } from "./demandUtils";
import { useInventoryData } from "./inventoryData";
import {
  AlertCircleIcon,
  BuildingIcon,
  ClockIcon,
  Detail,
  DownloadIcon,
  InventoryTable,
  LayersIcon,
  MetricCard,
  RequestIcon,
  SearchIcon,
  TriangleIcon,
} from "./inventoryComponents";
import {
  formatCurrency,
  formatNumber,
  getMedicineName,
  getStockStatus,
} from "./inventoryUtils";

const safeFetch = async (request) => {
  const result = await request;
  return result.error ? [] : result.data || [];
};

export default function BhwInventoryModule() {
  const { profile } = useAuth();
  const data = useInventoryData({ isBhw: true });

  const {
    ownFacilityName,
    today,
    selectedFacility,
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

      <section className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-sm shadow-neutral-200/40">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <BuildingIcon />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#42474e]">
              My Facility
            </p>
            <h2 className="mt-0.5 truncate text-lg font-black text-[#0d1117]">
              {ownFacilityName}
            </h2>
            <p className="truncate text-sm font-medium text-neutral-500">
              {selectedFacility
                ? `${selectedFacility.facility_code} · ${formatFacilityType(selectedFacility.facility_type)}`
                : "Stock at your assigned facility"}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Total Items"
          value={formatNumber(summary.totalItems)}
          sub={`at ${ownFacilityName}`}
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
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
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
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
            >
              <RequestIcon />
              Request Stock
            </Link>
          }
        />
      </section>

      {modalMode && (
        <BhwInventoryModal
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

function BhwInventoryModal({
  mode,
  selectedItem,
  relatedStock,
  consumptionByMedicine,
  error,
  onClose,
}) {
  const isReadOnly = mode === "view";

  const [demand, setDemand] = useState(null);
  const [isDemandLoading, setIsDemandLoading] = useState(true);

  useEffect(() => {
    if (!selectedItem) {
      return undefined;
    }

    let active = true;

    const medicineId = selectedItem.medicine_id;

    safeFetch(
      supabase
        .from("medicine_dispensing")
        .select("id, facility_id, medicine_id, quantity, dispensing_type, dispense_date")
        .eq("medicine_id", medicineId)
        .limit(2000)
    ).then((dispensing) => {
      if (!active) {
        return;
      }

      setDemand({ dispensing });
      setIsDemandLoading(false);
    });

    return () => {
      active = false;
    };
  }, [selectedItem]);

  const channelSeries = useMemo(
    () => (demand ? buildChannelSeries(demand.dispensing) : []),
    [demand]
  );
  const adc = consumptionByMedicine?.[selectedItem?.medicine_id] ?? null;
  const daysOfSupply = selectedItem ? computeDaysOfSupply(selectedItem.quantity, adc) : null;
  const stockOutDate = computeStockOutDate(daysOfSupply);

  return (
    <ModalShell
      labelledBy="bhw-inventory-modal-title"
      onClose={onClose}
      panelClassName="max-w-3xl"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="border-b border-neutral-100 px-6 py-5">
          <h3 id="bhw-inventory-modal-title" className="text-xl font-black text-black">Stock Details</h3>
          <p className="text-sm font-medium text-neutral-500">
            Review medicine inventory details
          </p>
        </div>

        <div className="prds-modal-scrollbar flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          {isReadOnly && selectedItem && (
            <>
              <div className="rounded-xl border border-[#d8dadc] bg-[#fbfaf8] p-4">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-neutral-400">
                    Medicine
                  </p>
                  <p className="truncate text-lg font-black text-[#0d1117]">
                    {getMedicineName(selectedItem)}
                  </p>
                  <p className="truncate text-xs font-semibold text-neutral-400">
                    {selectedItem.medicine?.brand_name || "No brand"}
                    {selectedItem.medicine?.unit_of_measure
                      ? ` · ${selectedItem.medicine.unit_of_measure}`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 rounded-xl border border-[#d8dadc] bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Batch" value={selectedItem.batch_number} />
                <Detail
                  label="Facility"
                  value={selectedItem.facility?.facility_name || "-"}
                />
                <Detail label="Supplier" value={selectedItem.supplier?.supplier_name || "-"} />
                <Detail
                  label="Stock Quantity"
                  value={`${formatNumber(selectedItem.quantity)} ${
                    selectedItem.medicine?.unit_of_measure || ""
                  }`.trim()}
                />
                <Detail label="Status" value={getStockStatus(selectedItem).label} />
                <Detail
                  label="Estimated Value"
                  value={formatCurrency(
                    Number(selectedItem.quantity || 0) *
                      Number(selectedItem.medicine?.unit_cost || 0)
                  )}
                />
              </div>

              <div className="mt-5">
                {isDemandLoading ? (
                  <div className="rounded-xl border border-[#d8dadc] bg-white p-4">
                    <div className="h-5 w-44 animate-pulse rounded bg-neutral-100" />
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {Array.from({ length: 3 }, (_, index) => (
                        <div key={index} className="h-20 animate-pulse rounded-lg bg-neutral-100" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <DemandPanel
                    title="Consumption Overview"
                    adc={adc}
                    daysOfSupply={daysOfSupply}
                    stockOutDate={stockOutDate}
                    channelSeries={channelSeries}
                  />
                )}
              </div>

              {relatedStock.length > 0 && (
                <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                    Also stocked elsewhere
                  </p>
                  <ul className="mt-3 space-y-2">
                    {relatedStock.map((item) => {
                      const status = getStockStatus(item);

                      return (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="font-semibold text-neutral-700">
                            {item.facility?.facility_name || "-"}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="font-black text-black">
                              {formatNumber(item.quantity)}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-bold ${status.badgeClass}`}
                            >
                              {status.label}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-neutral-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-neutral-100 px-6 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
