import { useEffect } from "react";
import {
  Building2,
  Calendar,
  Clock,
  FileText,
  Package,
  Pencil,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Truck,
} from "lucide-react";

import ModalShell from "../../../components/ModalShell";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  getExpiredDays,
  getExpiryStatus,
  getMedicineName,
  getStockStatus,
  isLotExpired,
  normalizeLotNumber,
  normalizePoNumber,
} from "@shared/utils/inventoryUtils";

export default function BatchDetailsModal({
  isOpen = true,
  lot,
  medicine,
  facilityName = "City Health Office - City of Naga",
  canEdit = false,
  isBhw = false,
  onClose,
  onEditLot,
  onDisposeLot,
}) {
  if (!isOpen || !lot) return null;

  const shouldShowProcurement = !isBhw;
  const isExpired = isLotExpired(lot);
  const expiry = getExpiryStatus(lot);
  const expiredDays = getExpiredDays(lot.expiration_date);

  const medName = medicine ? getMedicineName(medicine) : getMedicineName(lot);
  const brandName = medicine?.medicine?.brand_name || lot.medicine?.brand_name || lot.brand_name || "";
  const unit = medicine?.medicine?.unit_of_measure || lot.medicine?.unit_of_measure || "units";

  const lotCost =
    lot.unit_cost !== null && lot.unit_cost !== undefined && !isNaN(Number(lot.unit_cost))
      ? Number(lot.unit_cost)
      : medicine?.medicine?.unit_cost !== null && medicine?.medicine?.unit_cost !== undefined && !isNaN(Number(medicine?.medicine?.unit_cost))
      ? Number(medicine.medicine.unit_cost)
      : null;

  const totalValue = lotCost !== null ? Number(lot.quantity || 0) * lotCost : null;
  const supplierName = lot.supplier?.supplier_name || lot.supplier_name || "—";
  const poDisplay = normalizePoNumber(lot.po_number);
  const lotDisplay = normalizeLotNumber(lot.batch_number || lot.lot_no);

  const handleEdit = () => {
    onClose?.();
    onEditLot?.(lot);
  };

  const handleDispose = () => {
    onClose?.();
    onDisposeLot?.(lot);
  };

  return (
    <ModalShell onClose={onClose} panelClassName="max-w-2xl w-full">
      <div className="flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden border border-[#d8dadc]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-neutral-100 bg-[#fbfaf8] px-6 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isExpired && (
                <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-red-50 text-red-800 border border-red-200">
                  <ShieldAlert className="h-3 w-3" />
                  Quarantined Expired
                </span>
              )}

              <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-600">
                <Building2 className="h-3 w-3 text-neutral-500" />
                {lot.facility?.facility_name || facilityName}
              </span>
            </div>

            <h2 className="text-lg font-black tracking-tight text-[#0d1117] pt-0.5">
              Lot Record
            </h2>
            <p className="text-xs font-semibold text-neutral-500">
              {medName} {brandName && <span className="text-neutral-400">({brandName})</span>}
            </p>
          </div>
        </div>

        {/* Content Body - Unified Layout without Separate Borders */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          <div className="rounded-xl bg-[#f8f9fa] p-5 space-y-5">
            {/* Top Key Identifiers */}
            <div className={`grid grid-cols-1 ${shouldShowProcurement ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-4 pb-4 border-b border-neutral-200/70`}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
                  Lot No.
                </p>
                <p className="font-mono text-base font-black text-[#0d1117] tracking-wider mt-0.5">
                  {lotDisplay || "—"}
                </p>
              </div>

              {shouldShowProcurement && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
                    Purchase Order (PO #)
                  </p>
                  <div className="flex items-center gap-1 font-mono text-sm font-bold text-neutral-800 mt-0.5">
                    <Receipt className="h-3.5 w-3.5 text-neutral-400" />
                    <span>{poDisplay || "—"}</span>
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
                  Batch Status
                </p>
                <div className="mt-0.5">
                  {isExpired ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-200 px-2.5 py-0.5 text-xs font-black text-red-700">
                      <ShieldAlert className="h-3 w-3" />
                      Quarantined Expired
                    </span>
                  ) : expiry.days !== null && expiry.days <= 30 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-xs font-black text-amber-800">
                      <Clock className="h-3 w-3" />
                      Expiring Soon
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-xs font-black text-emerald-800">
                      <ShieldCheck className="h-3 w-3" />
                      Available for Dispensing
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Section 1: Stock Quantity & Valuation */}
            <div className="space-y-2 pb-4 border-b border-neutral-200/70">
              <h3 className="text-xs font-black uppercase tracking-[0.14em] text-neutral-700 flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-emerald-600" />
                {shouldShowProcurement ? "Stock Quantity & Valuation (Philippine Peso)" : "Stock Quantity"}
              </h3>
              <div className={`grid ${shouldShowProcurement ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-2"} gap-4 pt-1`}>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    Quantity Available
                  </span>
                  <p className="text-xl font-black text-[#0d1117] mt-0.5">
                    {formatNumber(lot.quantity)}{" "}
                    <span className="text-xs font-bold text-neutral-500 lowercase">{unit}</span>
                  </p>
                </div>

                {shouldShowProcurement && (
                  <>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                        Minimum Threshold
                      </span>
                      <p className="text-xl font-black text-[#0d1117] mt-0.5">
                        {formatNumber(lot.threshold || 0)}{" "}
                        <span className="text-xs font-bold text-neutral-500 lowercase">{unit}</span>
                      </p>
                      <div className="mt-1">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${getStockStatus(lot).badgeClass}`}>
                          {getStockStatus(lot).label}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                        Unit Cost (PHP)
                      </span>
                      <p className="text-xl font-black text-[#0d1117] mt-0.5">
                        {lotCost !== null ? formatCurrency(lotCost) : "—"}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                        Total Value
                      </span>
                      <p className="text-xl font-black text-emerald-800 mt-0.5">
                        {totalValue !== null ? formatCurrency(totalValue) : "—"}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Section 2: Procurement & Supplier Information (CHO only) */}
            {shouldShowProcurement && (
              <div className="space-y-2 pb-4 border-b border-neutral-200/70">
                <h3 className="text-xs font-black uppercase tracking-[0.14em] text-neutral-700 flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5 text-emerald-600" />
                  Procurement &amp; Supplier Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 text-xs">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                      Supplier Name
                    </span>
                    <p className="font-bold text-[#0d1117] text-sm mt-0.5">
                      {supplierName}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                      Contact Number
                    </span>
                    <p className="font-bold text-[#0d1117] text-sm mt-0.5">
                      {lot.supplier_contact || lot.contact_number || lot.supplier?.contact_number || "—"}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                      Address
                    </span>
                    <p className="font-bold text-[#0d1117] text-sm mt-0.5">
                      {lot.supplier_address || lot.address || lot.supplier?.address || "—"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Dates & Shelf Life */}
            <div className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-[0.14em] text-neutral-700 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                Dates &amp; Expiration Tracking
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 text-xs">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    Date Received
                  </span>
                  <p className="font-bold text-[#0d1117] text-sm mt-0.5">
                    {lot.date_received ? formatDate(lot.date_received) : "—"}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    Expiration Date
                  </span>
                  <p className="font-bold text-[#0d1117] text-sm mt-0.5">
                    {lot.expiration_date ? formatDate(lot.expiration_date) : "—"}
                  </p>
                  <div className="mt-1">
                    {isExpired ? (
                      <span className="text-[11px] font-bold text-red-600">
                        Expired {expiredDays > 0 ? `${expiredDays} day${expiredDays === 1 ? "" : "s"} ago` : "today"}
                      </span>
                    ) : expiry.days !== null && expiry.days <= 30 ? (
                      <span className="text-[11px] font-bold text-amber-600">
                        Expiring in {expiry.days} day{expiry.days === 1 ? "" : "s"}
                      </span>
                    ) : expiry.days !== null ? (
                      <span className="text-[11px] font-semibold text-emerald-700">
                        {expiry.days} days valid shelf life
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between border-t border-neutral-100 bg-[#fbfaf8] px-6 py-3.5">
          <div>
            {isExpired && onDisposeLot && (
              <button
                type="button"
                onClick={handleDispose}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 transition cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Condemn &amp; Dispose
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#d8dadc] bg-white px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition cursor-pointer shadow-2xs"
            >
              Close
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={handleEdit}
                className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Lot Record
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
