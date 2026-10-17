import ModalShell from "../../../components/ModalShell";
import { InventoryLotTable } from "../inventoryComponents";
import {
  formatDate,
  formatNumber,
  getMedicineName,
  isLotExpired,
} from "@shared/utils/inventoryUtils";
import { formatMedicineCategories } from "@shared/utils/medicineUtils";

export function BhwStockModal({ mode, selectedItem, error, onClose }) {
  const lots = selectedItem?.lots?.length ? selectedItem.lots : selectedItem ? [selectedItem] : [];
  const isExpired = isLotExpired(selectedItem);

  return (
    <ModalShell
      labelledBy="bhw-inventory-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="max-w-4xl"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="border-b border-neutral-100 px-6 py-5">
          <h3 id="bhw-inventory-modal-title" className="text-xl font-black text-black">
            {isExpired ? "Expired Stock Details" : "Stock Details"}
          </h3>
          <p className="text-sm font-medium text-neutral-500">
            {selectedItem
              ? `${getMedicineName(selectedItem)}${isExpired ? " (Quarantined Expired Stock)" : ""}`
              : "Review stock details by lot number."}
          </p>
        </div>

        <div className="prds-modal-scrollbar flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          {mode === "view" && selectedItem && (
            <>
              <section className="rounded-xl border border-neutral-100 bg-white px-4 py-4">
                <p
                  className={`text-[11px] font-black uppercase tracking-[0.14em] ${
                    isExpired ? "text-red-700" : "text-emerald-700"
                  }`}
                >
                  {isExpired ? "Quarantined Expired Stock" : "Medicine Stock"}
                </p>
                <p className="mt-1 text-lg font-black text-[#0d1117]">
                  {getMedicineName(selectedItem)}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Detail
                    label={isExpired ? "Expired Stock" : "Total Stock"}
                    value={formatNumber(selectedItem.quantity)}
                  />
                  <Detail
                    label={isExpired ? "Date Expired" : "Nearest Expiration"}
                    value={formatDate(selectedItem.expiration_date)}
                  />
                  <Detail
                    label={isExpired ? "Disposal Status" : "Facility"}
                    value={isExpired ? "Pending Condemnation" : (selectedItem.facility?.facility_name || "-")}
                    highlight={isExpired}
                  />
                  <Detail
                    label="Category"
                    value={formatMedicineCategories(selectedItem.medicine?.categories) || "General"}
                  />
                </div>
              </section>

              <div className="mt-5">
                <InventoryLotTable lots={lots} showSegregation={false} />
              </div>
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

function Detail({ label, value, highlight = false }) {
  return (
    <div
      className={`rounded-lg px-3 py-2.5 ${
        highlight ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "bg-slate-100"
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-black ${
          highlight ? "text-red-700" : "text-[#0d1117]"
        }`}
      >
        {value || "-"}
      </p>
    </div>
  );
}
