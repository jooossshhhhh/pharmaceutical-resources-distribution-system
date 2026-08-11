import { useEffect, useMemo, useRef, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import ModalShell from "../../components/ModalShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";
import DemandPanel from "./demandPanel";
import {
  buildChannelSeries,
  computeDaysOfSupply,
  computeReorderQty,
  computeStockOutDate,
  forecastSummary,
  sumDispensedByFacilityType,
} from "./demandUtils";
import { useInventoryData } from "./inventoryData";
import {
  AlertCircleIcon,
  ClockIcon,
  Detail,
  DownloadIcon,
  FacilityPicker,
  Field,
  InventoryTable,
  LayersIcon,
  MetricCard,
  PlusIcon,
  RequestIcon,
  SearchIcon,
  SelectField,
  TriangleIcon,
  UploadIcon,
} from "./inventoryComponents";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  getMedicineName,
  getStockStatus,
  inventoryImportTemplate,
} from "./inventoryUtils";

const safeFetch = async (request) => {
  const result = await request;
  return result.error ? [] : result.data || [];
};

export default function ChoInventoryModule() {
  const { profile } = useAuth();
  const data = useInventoryData({ isBhw: false });

  const {
    canManage,
    ownFacilityId,
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
    relatedStock,
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
    handleDeleteItem,
    fetchStockHistory,
    handleImportCsv,
  } = data;

  const totalItemsSub = `at ${selectedFacility?.facility_name || ownFacilityName}`;

  const criticalSub = summary.stockedOut > 0 ? `${formatNumber(summary.stockedOut)} fully stocked out` : "needs immediate restock";

  const reorderCount = Object.keys(reorderQtyByItemId).length;

  const [importResult, setImportResult] = useState(null);

  const importInputRef = useRef(null);

  const runImportCsv = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const result = await handleImportCsv(file);
    setImportResult(result);
  };

  const downloadTemplate = () => {
    const blob = new Blob([`\ufeff${inventoryImportTemplate}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-import-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {inventoryError && !modalMode && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {inventoryError}
        </p>
      )}

      <section className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-sm shadow-neutral-200/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-[#0d1117]">
              {selectedFacility?.facility_name || ownFacilityName}
            </h2>
            <p className="mt-0.5 truncate text-sm font-medium text-neutral-500">
              {selectedFacility?.facility_code || "—"}
            </p>
          </div>
          <FacilityPicker
            facilities={facilityOptions}
            value={facilityFilter}
            onSelect={selectFacility}
          />
        </div>
      </section>

      {importResult && (
        <div className="mt-5 rounded-xl border border-[#d8dadc] bg-white p-4 shadow-sm shadow-neutral-200/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p
                className={`text-sm font-black ${
                  importResult.failed === 0 ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {importResult.cancelled
                  ? "Import cancelled — no rows were valid."
                  : `Imported ${importResult.imported} record${importResult.imported === 1 ? "" : "s"}, ${importResult.failed} failed.`}
              </p>
              {!importResult.cancelled && importResult.imported > 0 && (
                <p className="mt-1 text-xs font-semibold text-neutral-500">
                  Stock added at{" "}
                  {selectedFacility?.facility_name || ownFacilityName}.{" "}
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="font-bold text-emerald-700 underline underline-offset-2"
                  >
                    Download template
                  </button>{" "}
                  for the next import.
                </p>
              )}
              {importResult.errors.length > 0 && (
                <ul className="prds-modal-scrollbar mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-red-50/60 p-3">
                  {importResult.errors.slice(0, 10).map((item, index) => (
                    <li key={index} className="text-xs font-semibold text-red-700">
                      {item.row > 0 ? `Row ${item.row}: ` : ""}
                      {item.message}
                    </li>
                  ))}
                  {importResult.errors.length > 10 && (
                    <li className="text-xs font-bold text-red-600">
                      …and {importResult.errors.length - 10} more.
                    </li>
                  )}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => setImportResult(null)}
              aria-label="Dismiss import result"
              className="shrink-0 rounded-md p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Total Items"
          value={formatNumber(summary.totalItems)}
          sub={totalItemsSub}
          tone="emerald"
          onClick={() => toggleStockFilter("ALL")}
          active={stockFilter === "ALL"}
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
                <>
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-4 text-sm font-black text-neutral-700 shadow-sm hover:bg-neutral-50"
                  >
                    <UploadIcon />
                    Import CSV
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={runImportCsv}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
                  >
                    <PlusIcon />
                    Add Stock
                  </button>
                </>
              )}
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
        />
      </section>

      {modalMode && (
        <ChoInventoryModal
          key={modalMode === "create" ? "create" : selectedItem?.id}
          mode={modalMode}
          selectedItem={selectedItem}
          formValues={formValues}
          facilities={facilities}
          medicines={medicines}
          suppliers={suppliers}
          relatedStock={relatedStock}
          consumptionByMedicine={consumptionByMedicine}
          ownFacilityId={ownFacilityId}
          ownFacilityName={ownFacilityName}
          error={inventoryError}
          isSaving={isSaving}
          onClose={closeModal}
          onChange={handleFieldChange}
          onSubmit={handleSaveInventory}
          canEdit={canManage}
          canDelete={profile?.role === "PHARMA_II"}
          onDelete={handleDeleteItem}
          fetchStockHistory={fetchStockHistory}
        />
      )}
    </AdminShell>
  );
}

function ChoInventoryModal({
  mode,
  selectedItem,
  formValues,
  facilities,
  medicines,
  suppliers,
  relatedStock = [],
  consumptionByMedicine = {},
  ownFacilityId,
  ownFacilityName,
  error,
  isSaving,
  onClose,
  onChange,
  onSubmit,
  canEdit,
  canDelete,
  onDelete,
  fetchStockHistory,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [history, setHistory] = useState(null);

  const isReadOnly = mode === "view" && !isEditing;
  const isHistoryLoading = mode === "view" && history === null;
  const title =
    mode === "create" ? "Add New Stock" : isEditing ? "Edit Stock" : "Stock Details";
  const subtitle =
    mode === "create"
      ? "Enter medicine inventory details from the inventory schema"
      : isEditing
        ? "Update medicine inventory details"
        : "Review medicine inventory details";

  useEffect(() => {
    if (mode !== "view" || !selectedItem || !fetchStockHistory) {
      return undefined;
    }

    let active = true;

    fetchStockHistory(selectedItem)
      .then((rows) => {
        if (!active) {
          return;
        }
        setHistory(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setHistory([]);
      });

    return () => {
      active = false;
    };
  }, [mode, selectedItem, fetchStockHistory]);

  const handleDelete = async () => {
    const removed = await onDelete(selectedItem);
    if (!removed) {
      setConfirmingDelete(false);
    }
  };

  const facilityTypeById = useMemo(
    () => new Map(facilities.map((facility) => [facility.id, facility.facility_type])),
    [facilities]
  );

  const [demand, setDemand] = useState(null);
  const isDemandLoading = Boolean(selectedItem) && demand === null;

  useEffect(() => {
    if (!selectedItem) {
      return undefined;
    }

    let active = true;

    const medicineId = selectedItem.medicine_id;

    Promise.all([
      safeFetch(
        supabase
          .from("medicine_dispensing")
          .select("id, facility_id, medicine_id, quantity, dispensing_type, dispense_date")
          .eq("medicine_id", medicineId)
          .limit(2000)
      ),
      safeFetch(
        supabase
          .from("forecasting")
          .select("id, medicine_id, facility_id, forecast_month, predicted_quantity")
          .eq("medicine_id", medicineId)
      ),
      safeFetch(
        supabase
          .from("medicine_request_items")
          .select(`
            id,
            quantity,
            medicine_id,
            request:medicine_requests(id, facility_id, request_date, status, facility:facilities(facility_name))
          `)
          .eq("medicine_id", medicineId)
          .eq("request.status", "PENDING")
      ),
    ])
      .then(([dispensing, forecast, requests]) => {
        if (!active) {
          return;
        }

        setDemand({
          dispensing: Array.isArray(dispensing) ? dispensing : [],
          forecast: Array.isArray(forecast) ? forecast : [],
          requests: Array.isArray(requests) ? requests : [],
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setDemand({ dispensing: [], forecast: [], requests: [] });
      });

    return () => {
      active = false;
    };
  }, [selectedItem]);

  const channelSeries = useMemo(
    () => (demand ? buildChannelSeries(demand.dispensing || []) : []),
    [demand]
  );
  const split = useMemo(
    () =>
      demand ? sumDispensedByFacilityType(demand.dispensing || [], facilityTypeById) : null,
    [demand, facilityTypeById]
  );
  const forecast = useMemo(() => (demand ? forecastSummary(demand.forecast || []) : null), [demand]);
  const pendingRequests = useMemo(
    () =>
      demand
        ? (demand.requests || []).filter((item) => item.request?.status === "PENDING")
        : [],
    [demand]
  );
  const adc = consumptionByMedicine?.[selectedItem?.medicine_id] ?? null;
  const daysOfSupply = selectedItem ? computeDaysOfSupply(selectedItem.quantity, adc) : null;
  const stockOutDate = computeStockOutDate(daysOfSupply);
  const reorderQty = selectedItem ? computeReorderQty(selectedItem.quantity, adc) : null;

  return (
    <ModalShell
      labelledBy="cho-inventory-modal-title"
      onClose={onClose}
      overlayClassName="bg-white/95 backdrop-blur-sm"
      panelClassName="max-w-3xl"
    >
      <form
        onSubmit={onSubmit}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="border-b border-neutral-100 px-6 py-5">
          <h3 id="cho-inventory-modal-title" className="text-xl font-black text-black">{title}</h3>
          <p className="text-sm font-medium text-neutral-500">{subtitle}</p>
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
                    adc={adc}
                    daysOfSupply={daysOfSupply}
                    stockOutDate={stockOutDate}
                    channelSeries={channelSeries}
                    split={split}
                    forecast={forecast}
                    pendingRequests={pendingRequests}
                    reorderQty={reorderQty}
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
                      const itemAdc = consumptionByMedicine[item.medicine_id];
                      const itemDays = itemAdc
                        ? computeDaysOfSupply(item.quantity, itemAdc)
                        : null;

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
                            {itemDays != null && (
                              <span className="text-xs font-bold text-neutral-400">
                                ~{formatNumber(itemDays)}d
                              </span>
                            )}
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

              <div className="mt-5 rounded-xl border border-[#d8dadc] bg-white p-4">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                  Stock History
                </p>
                {isHistoryLoading ? (
                  <div className="mt-3 space-y-2">
                    {Array.from({ length: 3 }, (_, index) => (
                      <div
                        key={index}
                        className="h-10 animate-pulse rounded-lg bg-neutral-100"
                      />
                    ))}
                  </div>
                ) : !history || history.length === 0 ? (
                  <p className="mt-3 text-sm font-medium text-neutral-400">
                    No activity recorded for batch {selectedItem.batch_number}.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-neutral-100">
                    {history.map((entry) => (
                      <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-[#0d1117]">
                            {entry.action}
                            <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-500">
                              {entry.user?.role?.replace("_", " ") || "Unknown"}
                            </span>
                          </p>
                          <p className="mt-0.5 truncate text-xs font-medium text-neutral-500">
                            {entry.details}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-neutral-400">
                          {formatDateTime(entry.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {!isReadOnly && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Medicine"
                  name="medicine_id"
                  value={formValues.medicine_id}
                  onChange={onChange}
                  disabled={isEditing}
                  required
                >
                  <option value="">
                    {isEditing ? getMedicineName(selectedItem) : "Select medicine"}
                  </option>
                  {medicines.map((medicine) => (
                    <option key={medicine.id} value={medicine.id}>
                      {medicine.generic_name} {medicine.dosage}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  label="Facility"
                  name="facility_id"
                  value={formValues.facility_id}
                  onChange={onChange}
                  disabled={isReadOnly || isEditing || mode === "create"}
                  required
                >
                  {mode === "create" ? (
                    <option value={ownFacilityId}>{ownFacilityName}</option>
                  ) : (
                    facilities.map((facility) => (
                      <option key={facility.id} value={facility.id}>
                        {facility.facility_name}
                      </option>
                    ))
                  )}
                </SelectField>

                <SelectField
                  label="Supplier"
                  name="supplier_id"
                  value={formValues.supplier_id}
                  onChange={onChange}
                  disabled={isReadOnly}
                  required
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.supplier_name}
                    </option>
                  ))}
                </SelectField>

                <Field
                  label="Batch Number"
                  name="batch_number"
                  value={formValues.batch_number}
                  onChange={onChange}
                  disabled={isReadOnly}
                  required
                />

                <Field
                  label="Stock Quantity"
                  name="quantity"
                  type="number"
                  min="0"
                  value={formValues.quantity}
                  onChange={onChange}
                  disabled={isReadOnly}
                  required
                />

                <Field
                  label="Minimum Threshold"
                  name="threshold"
                  type="number"
                  min="0"
                  value={formValues.threshold}
                  onChange={onChange}
                  disabled={isReadOnly}
                  required
                />

                <Field
                  label="Date Received"
                  name="date_received"
                  type="date"
                  value={formValues.date_received}
                  onChange={onChange}
                  disabled={isReadOnly}
                  required
                />

                <Field
                  label="Expiration Date"
                  name="expiration_date"
                  type="date"
                  value={formValues.expiration_date}
                  onChange={onChange}
                  disabled={isReadOnly}
                  required
                />
              </div>

              {mode === "create" && (
                <p className="mt-4 rounded-lg bg-emerald-50/60 px-3 py-2.5 text-xs font-semibold leading-5 text-emerald-700">
                  Stock enters the system at the CHO facility. Health centers receive medicine
                  through requests and transfers.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-6 py-4">
          <div>
            {isReadOnly && canDelete && selectedItem && (
              confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-red-700">
                    Delete this batch permanently?
                  </span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isSaving}
                    className="h-10 rounded-lg bg-red-600 px-4 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                  >
                    {isSaving ? "Deleting..." : "Confirm Delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="h-10 rounded-lg bg-neutral-100 px-4 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
                  >
                    Keep Stock
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="h-10 rounded-lg border border-red-200 bg-white px-4 text-sm font-black text-red-600 hover:bg-red-50"
                >
                  Delete Stock
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={isEditing ? () => setIsEditing(false) : onClose}
              className="h-10 rounded-lg bg-neutral-100 px-6 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
            >
              {isReadOnly ? "Close" : "Cancel"}
            </button>
            {isReadOnly ? (
              canEdit ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="h-10 rounded-lg bg-emerald-600 px-6 text-sm font-black text-white hover:bg-emerald-700"
                >
                  Edit Stock
                </button>
              ) : null
            ) : (
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-6 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                <PlusIcon />
                {isSaving
                  ? "Saving..."
                  : isEditing
                    ? "Save Changes"
                    : "Add to Inventory"}
              </button>
            )}
          </div>
        </div>
      </form>
    </ModalShell>
  );
}
