import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Package,
  Plus,
  ShieldAlert,
  Sliders,
} from "lucide-react";
import { InventoryLotTable } from "../inventoryComponents";
import BatchDetailsModal from "./BatchDetailsModal";
import BhwThresholdModal from "./BhwThresholdModal";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  getExpiryStatus,
  getMedicineName,
  getStockStatus,
  isLotExpired,
} from "@shared/utils/inventoryUtils";
import { formatMedicineCategories } from "@shared/utils/medicineUtils";
import { isChoFacility } from "@shared/utils/facilityUtils";

export default function MedicineStockDetailsView({
  item,
  canManage = false,
  isBhw = false,
  onBack,
  onEditLot,
  onDisposeLot,
  onAddBatch,
  onUpdateThreshold,
  consumptionByMedicine = {},
  facilityName = "CHO Naga",
}) {
  const resolvedFacilityName =
    (typeof item?.facility === "string" ? item.facility : item?.facility?.facility_name) ||
    (typeof facilityName === "string" ? facilityName : facilityName?.facility_name) ||
    "CHO Naga";
  const effectiveFacility = item?.facility || resolvedFacilityName;
  const isBarangayFacility = isBhw || (Boolean(effectiveFacility) && !isChoFacility(effectiveFacility));

  const [selectedBatchLot, setSelectedBatchLot] = useState(null);
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);
  const selectedBatchLotRef = useRef(selectedBatchLot);
  useEffect(() => {
    selectedBatchLotRef.current = selectedBatchLot;
  }, [selectedBatchLot]);

  // Support Esc key to go back only when no child modal is open
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (selectedBatchLotRef.current || document.querySelector(".prds-modal-root")) {
          return;
        }
        e.preventDefault();
        onBack?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  if (!item) {
    return null;
  }

  const isExpired = isLotExpired(item);
  const stockStatus = getStockStatus(item);
  const expiryStatus = getExpiryStatus(item);
  const unit = item.medicine?.unit_of_measure ? ` ${item.medicine.unit_of_measure}` : "";

  const allLots = useMemo(() => {
    return item?.lots?.length ? item.lots : [item];
  }, [item]);

  const isReturnBatch = (l) =>
    l?.intake_type === "RETURN" ||
    (typeof l?.po_number === "string" && l.po_number.startsWith("RET-")) ||
    Boolean(l?.origin_facility_id) ||
    Boolean(l?.return_reason);

  const procurementLotsCount = useMemo(() => {
    return allLots.filter((l) => !isReturnBatch(l)).length;
  }, [allLots]);

  const returnedLotsCount = useMemo(() => {
    return allLots.filter((l) => isReturnBatch(l)).length;
  }, [allLots]);

  const totalUnits = useMemo(() => {
    return allLots.reduce((sum, l) => sum + Number(l.quantity || 0), 0);
  }, [allLots]);

  const totalValuation = useMemo(() => {
    return allLots.reduce((sum, l) => {
      const cost =
        l.unit_cost !== null && l.unit_cost !== undefined && !isNaN(Number(l.unit_cost))
          ? Number(l.unit_cost)
          : item.medicine?.unit_cost !== null && item.medicine?.unit_cost !== undefined && !isNaN(Number(item.medicine?.unit_cost))
            ? Number(item.medicine.unit_cost)
            : 0;
      return sum + Number(l.quantity || 0) * cost;
    }, 0);
  }, [allLots, item.medicine]);

  const brandName = item.medicine?.brand_name || item.brand_name || "";
  const categories = formatMedicineCategories(item.medicine?.categories);

  return (
    <div className="space-y-3.5 animate-in fade-in duration-200">
      {/* Top Breadcrumb Navigation Bar without clutter */}
      <div className="flex items-center justify-between rounded-xl border border-[#d8dadc] bg-white px-4 py-2.5 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8dadc] bg-white px-3 py-1.5 text-xs font-bold text-[#0d1117] transition hover:bg-neutral-50 hover:border-neutral-400 active:scale-[0.98] cursor-pointer shadow-2xs"
            title="Return to inventory list (or press Esc)"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-emerald-700" />
            <span>Back to Inventory</span>
          </button>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-400 font-semibold">
            <span>Inventory</span>
            <span>/</span>
            <span className={isExpired ? "text-red-700 font-bold" : "text-emerald-700 font-bold"}>
              {isExpired ? "Quarantined Expired Stock" : "Dispensable Stock"}
            </span>
            <span>/</span>
            <span className="font-bold text-[#0d1117] truncate max-w-sm">
              {getMedicineName(item)}
            </span>
          </div>
        </div>

        {canManage && onAddBatch && (
          <button
            type="button"
            onClick={onAddBatch}
            className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition cursor-pointer"
            title="Record new batch for this medicine"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Batch</span>
          </button>
        )}
      </div>

      {/* Hero Medicine Identification Banner - Clean & Uncluttered */}
      <section className="rounded-xl border border-[#d8dadc] bg-white p-4.5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {isExpired && (
                <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-red-50 text-red-800 border border-red-200">
                  <ShieldAlert className="h-3 w-3" />
                  Quarantined Expired
                </span>
              )}

              <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-700">
                <Building2 className="h-3 w-3 text-neutral-500" />
                {resolvedFacilityName}
              </span>

              {categories && (
                <span className="inline-flex items-center rounded-md border border-neutral-200 bg-[#fbfaf8] px-2 py-0.5 text-[10px] font-bold text-neutral-600">
                  {categories}
                </span>
              )}
            </div>

            <h1 className="text-xl font-black tracking-tight text-[#0d1117] pt-0.5">
              {getMedicineName(item)}
            </h1>

            {brandName && (
              <p className="text-xs font-semibold text-neutral-500">
                Brand: <strong className="text-neutral-700">{brandName}</strong>
              </p>
            )}
          </div>

          {/* Clean Stock Status Badge & Action */}
          <div className="flex items-center gap-2 pt-1 sm:pt-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Status:
            </span>
            {isExpired ? (
              <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-black text-red-700 border border-red-200">
                Quarantined
              </span>
            ) : (
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-black shadow-2xs ${stockStatus.badgeClass}`}
              >
                {stockStatus.label}
              </span>
            )}
          </div>
        </div>

        {/* Focused Metric Cards - Always 4 Balanced Cards */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Available Stock & Total Cost */}
          <div
            className={`rounded-xl p-3.5 border ${
              isExpired
                ? "bg-red-50/40 border-red-200"
                : "bg-[#f8f9fa] border-neutral-200/80"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                {isExpired ? "Total Expired Stock" : "Physical Stock"}
              </span>
              <Package className={`h-4 w-4 ${isExpired ? "text-red-500" : "text-neutral-400"}`} />
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-[#0d1117]">
                {formatNumber(totalUnits)}
              </span>
              {unit && (
                <span className="text-xs font-bold lowercase text-neutral-500">
                  {unit}
                </span>
              )}
            </div>
            {!isBarangayFacility ? (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-600 font-medium">
                <span className="font-semibold text-neutral-500">Total Cost:</span>
                <strong className="font-bold text-[#0d1117]">{formatCurrency(totalValuation)}</strong>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500 font-medium">
                <span>{isExpired ? "Non-dispensable stock" : "Available in health station"}</span>
              </div>
            )}
          </div>

          {/* Card 2: Active Batches */}
          <div className="rounded-xl border border-neutral-200/80 bg-[#f8f9fa] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                Active Batches
              </span>
              <Building2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-[#0d1117]">
                {allLots.length}
              </span>
              <span className="text-xs font-bold text-neutral-500">
                lot{allLots.length === 1 ? "" : "s"} on hand
              </span>
            </div>
            {!isBarangayFacility ? (
              <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                <span>{procurementLotsCount} Procurement</span>
                <span>·</span>
                <span className={returnedLotsCount > 0 ? "text-emerald-700 font-bold" : ""}>
                  {returnedLotsCount} Returned
                </span>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-neutral-500">
                <span>Batch lots currently tracked</span>
              </div>
            )}
          </div>

          {/* Card 3: Threshold (Medicine & Batches Reorder Point) */}
          <div className="rounded-xl border border-neutral-200/80 bg-[#f8f9fa] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                Threshold
              </span>
              <Sliders className="h-4 w-4 text-teal-600" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-[#0d1117]">
                {formatNumber(item.threshold || 0)}
              </span>
              {unit && (
                <span className="text-xs font-bold lowercase text-neutral-500">
                  {unit}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs font-semibold text-neutral-500">
              <span>minimum safety stock</span>
              {onUpdateThreshold && (
                <button
                  type="button"
                  onClick={() => setIsThresholdModalOpen(true)}
                  className="text-[11px] font-bold text-teal-700 hover:text-teal-800 hover:underline cursor-pointer"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {/* Card 4: Nearest Expiration */}
          <div className="rounded-xl border border-neutral-200/80 bg-[#f8f9fa] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                {isExpired ? "Expired On" : "Nearest Expiry Date"}
              </span>
              <Calendar className="h-4 w-4 text-neutral-400" />
            </div>
            <div className="mt-1.5 text-xl font-black text-[#0d1117]">
              {item.expiration_date ? formatDate(item.expiration_date) : "—"}
            </div>
            <div className="mt-1">
              {isExpired ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                  Non-dispensable quarantine
                </span>
              ) : expiryStatus.days !== null && expiryStatus.days <= 30 ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  {expiryStatus.days === 0 ? "Expires today" : `Expiring in ${expiryStatus.days} days`}
                </span>
              ) : expiryStatus.days !== null ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  {expiryStatus.days} days shelf life
                </span>
              ) : (
                <span className="text-xs text-neutral-400">No expiration date</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Supplier Batch & Lot Records Table */}
      <InventoryLotTable
        lots={allLots}
        canEdit={canManage}
        isBhw={isBarangayFacility}
        showProcurement={!isBarangayFacility}
        onSelectLot={(lot) => setSelectedBatchLot(lot)}
      />

      {/* Specific Medicine Batch Details & Edit Trigger Modal */}
      <BatchDetailsModal
        isOpen={Boolean(selectedBatchLot)}
        lot={selectedBatchLot}
        medicine={item}
        facilityName={resolvedFacilityName}
        canEdit={canManage}
        isBhw={isBarangayFacility}
        onClose={() => setSelectedBatchLot(null)}
        onEditLot={onEditLot}
        onDisposeLot={onDisposeLot}
      />

      {/* Medicine / Station Threshold Edit Modal */}
      {isThresholdModalOpen && (
        <BhwThresholdModal
          isOpen={isThresholdModalOpen}
          item={item}
          facilityName={resolvedFacilityName}
          consumptionByMedicine={consumptionByMedicine}
          onClose={() => setIsThresholdModalOpen(false)}
          onSave={onUpdateThreshold}
        />
      )}
    </div>
  );
}

export { MedicineStockDetailsView };
