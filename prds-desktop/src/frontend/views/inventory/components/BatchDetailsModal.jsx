import { useEffect } from "react";
import {
  Building2,
  Calendar,
  Clock,
  FileText,
  Package,
  Pencil,
  Receipt,
  RotateCcw,
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
  formatReturnId,
  getExpiredDays,
  getExpiryStatus,
  getMedicineName,
  getStockStatus,
  isLotExpired,
  normalizeLotNumber,
  normalizePoNumber,
} from "@shared/utils/inventoryUtils";
import { isChoFacility } from "@shared/utils/facilityUtils";

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

  const resolvedFacility = lot?.facility || facilityName;
  const isBarangay = isBhw || (Boolean(resolvedFacility) && !isChoFacility(resolvedFacility));
  const shouldShowProcurement = !isBarangay;
  const isExpired = isLotExpired(lot);
  const expiry = getExpiryStatus(lot);
  const expiredDays = getExpiredDays(lot.expiration_date);

  const isReturn =
    lot?.intake_type === "RETURN" ||
    (typeof lot?.po_number === "string" && lot.po_number.startsWith("RET-")) ||
    Boolean(lot?.origin_facility_id) ||
    Boolean(lot?.return_reason);

  const returningStation =
    lot.origin_facility?.facility_name ||
    (lot.supplier_name && lot.supplier_name.startsWith("Returned from ")
      ? lot.supplier_name.replace("Returned from ", "")
      : lot.supplier_name) ||
    "Barangay Health Center";

  const returnReason = lot.return_reason || lot.reason || "Reallocation / Recall";

  const formatReasonText = (reason) => {
    if (!reason) return "Station Return";
    if (reason === "REALLOCATION" || String(reason).toLowerCase().includes("realloc")) return "Reallocation / Recall";
    if (reason === "EXCESS_STOCK" || String(reason).toLowerCase().includes("excess")) return "Excess Stock";
    if (reason === "NEAR_EXPIRY" || String(reason).toLowerCase().includes("near")) return "Near Expiration";
    if (reason === "DAMAGED" || String(reason).toLowerCase().includes("damage")) return "Damaged / Defective";
    return reason;
  };

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
                {lot.facility?.facility_name ||
                  (typeof facilityName === "object" ? facilityName?.facility_name : facilityName) ||
                  "Health Facility"}
              </span>

              {isReturn ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  <RotateCcw className="h-3 w-3 text-emerald-600" />
                  Returned Stock Batch
                </span>
              ) : shouldShowProcurement ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
                  <Truck className="h-3 w-3 text-neutral-500" />
                  Procurement Batch
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                  <Package className="h-3 w-3 text-teal-600" />
                  Health Center Stock
                </span>
              )}
            </div>

            <h2 className="text-lg font-black tracking-tight text-[#0d1117] pt-0.5">
              Lot Record
            </h2>
            <p className="text-xs font-semibold text-neutral-500">
              {medName} {brandName && <span className="text-neutral-400">({brandName})</span>}
            </p>
          </div>
        </div>

        {/* Content Body - Clean & Organized without Dead Space */}
        <div className="p-5 max-h-[75vh] overflow-y-auto space-y-3.5">
          {/* Card 1: Stock Quantity, Valuation & Dispensing Status */}
          <div className="rounded-xl border border-neutral-200/80 bg-[#f8f9fa] p-4">
            <div className="flex items-center justify-between border-b border-neutral-200/70 pb-2.5">
              <h3 className="text-xs font-black uppercase tracking-[0.14em] text-neutral-700 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-emerald-600" />
                <span>{shouldShowProcurement ? "Quantity & Valuation" : "Available Stock"}</span>
              </h3>
              <div>
                {isExpired ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-200 px-2.5 py-0.5 text-[11px] font-black text-red-700">
                    <ShieldAlert className="h-3 w-3" />
                    Quarantined Expired
                  </span>
                ) : expiry.days !== null && expiry.days <= 30 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-[11px] font-black text-amber-800">
                    <Clock className="h-3 w-3" />
                    Expiring Soon
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-black text-emerald-800">
                    <ShieldCheck className="h-3 w-3" />
                    Available for Dispensing
                  </span>
                )}
              </div>
            </div>

            <div className={`mt-3 grid grid-cols-1 ${shouldShowProcurement ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-4`}>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                  Stock On Hand
                </span>
                <p className="text-2xl font-black text-[#0d1117] mt-0.5">
                  {formatNumber(lot.quantity)}{" "}
                  <span className="text-xs font-bold text-neutral-500 lowercase">{unit}</span>
                </p>
              </div>

              {shouldShowProcurement ? (
                <>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                      Unit Cost
                    </span>
                    <p className="text-2xl font-black text-[#0d1117] mt-0.5">
                      {lotCost !== null ? formatCurrency(lotCost) : "—"}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                      Total Valuation
                    </span>
                    <p className="text-2xl font-black text-emerald-800 mt-0.5">
                      {totalValue !== null ? formatCurrency(totalValue) : "—"}
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    Expiration Date
                  </span>
                  <p className="text-base font-black text-[#0d1117] mt-0.5">
                    {lot.expiration_date ? formatDate(lot.expiration_date) : "—"}
                  </p>
                  <div className="mt-0.5">
                    {isExpired ? (
                      <span className="text-[11px] font-bold text-red-600">
                        Expired {expiredDays > 0 ? `${expiredDays}d ago` : "today"}
                      </span>
                    ) : expiry.days !== null ? (
                      <span className="text-[11px] font-semibold text-emerald-700">
                        {expiry.days} days shelf life
                      </span>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Batch Traceability & Supplier/Source */}
          <div className="rounded-xl border border-neutral-200/80 bg-[#f8f9fa] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-200/70 pb-2.5">
              <h3 className="text-xs font-black uppercase tracking-[0.14em] text-neutral-700 flex items-center gap-1.5">
                {isReturn ? (
                  <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                ) : shouldShowProcurement ? (
                  <Truck className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-teal-600" />
                )}
                <span>
                  {isReturn
                    ? "Return & Source Information"
                    : shouldShowProcurement
                    ? "Procurement & Lot Traceability"
                    : "Lot Identifiers"}
                </span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                  Lot Number
                </span>
                <p className="font-mono text-sm font-black text-[#0d1117] tracking-wider mt-0.5">
                  {lotDisplay || "—"}
                </p>
              </div>

              {shouldShowProcurement && (
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    {isReturn ? "Return Slip No." : "Purchase Order (PO #)"}
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-neutral-800 mt-0.5">
                    {isReturn ? (
                      <RotateCcw className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <Receipt className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                    )}
                    <span className="truncate">{isReturn ? formatReturnId(poDisplay) : (poDisplay || "—")}</span>
                  </div>
                </div>
              )}

              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                  {isReturn ? "Date Restocked" : "Date Received"}
                </span>
                <p className="font-bold text-[#0d1117] text-sm mt-0.5">
                  {lot.date_received ? formatDate(lot.date_received) : "—"}
                </p>
              </div>

              {shouldShowProcurement && (
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    Expiration Date
                  </span>
                  <p className="font-bold text-[#0d1117] text-sm mt-0.5">
                    {lot.expiration_date ? formatDate(lot.expiration_date) : "—"}
                  </p>
                  <div className="mt-0.5">
                    {isExpired ? (
                      <span className="text-[11px] font-bold text-red-600">
                        Expired {expiredDays > 0 ? `${expiredDays}d ago` : "today"}
                      </span>
                    ) : expiry.days !== null ? (
                      <span className="text-[11px] font-semibold text-emerald-700">
                        {expiry.days} days shelf life
                      </span>
                    ) : null}
                  </div>
                </div>
              )}

              {isReturn ? (
                <>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                      Returning Station
                    </span>
                    <p className="font-bold text-[#0d1117] text-sm mt-0.5 truncate">
                      {returningStation}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                      Return Reason
                    </span>
                    <div className="mt-0.5">
                      <span className="inline-flex items-center rounded-md bg-purple-50 border border-purple-200 px-2 py-0.5 text-xs font-bold text-purple-700">
                        {formatReasonText(returnReason)}
                      </span>
                    </div>
                  </div>
                </>
              ) : shouldShowProcurement ? (
                <>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                      Supplier
                    </span>
                    <p className="font-bold text-[#0d1117] text-sm mt-0.5 truncate">
                      {supplierName}
                    </p>
                  </div>
                  {(lot.supplier_contact || lot.contact_number || lot.supplier?.contact_number) && (
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                        Supplier Contact
                      </span>
                      <p className="font-bold text-[#0d1117] text-sm mt-0.5">
                        {lot.supplier_contact || lot.contact_number || lot.supplier?.contact_number}
                      </p>
                    </div>
                  )}
                  {(lot.supplier_address || lot.address || lot.supplier?.address) && (
                    <div className="sm:col-span-3">
                      <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                        Supplier Address
                      </span>
                      <p className="font-medium text-neutral-600 text-xs mt-0.5">
                        {lot.supplier_address || lot.address || lot.supplier?.address}
                      </p>
                    </div>
                  )}
                </>
              ) : null}
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

            {canEdit && !isReturn && (
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
