import { useEffect, useMemo, useState } from "react";

import ModalShell from "../../../components/ModalShell";
import { supabase } from "../../../services/supabase";
import DemandPanel from "./DemandPanel";
import { buildChannelSeries, computeDaysOfSupply, computeStockOutDate } from "../demandUtils";
import { Detail } from "../inventoryComponents";
import {
  formatCurrency,
  formatNumber,
  getMedicineName,
  getStockStatus,
} from "../inventoryUtils";

const safeFetch = async (request) => {
  const result = await request;
  return result.error ? [] : result.data || [];
};

export function BhwStockModal({
  mode,
  selectedItem,
  relatedStock = [],
  consumptionByMedicine = {},
  error,
  onClose,
}) {
  const isReadOnly = mode === "view";

  const [demand, setDemand] = useState(null);
  const isDemandLoading = Boolean(selectedItem) && demand === null;

  useEffect(() => {
    if (!selectedItem) {
      return undefined;
    }

    let active = true;

    const medicineId = selectedItem.medicine_id;

    safeFetch(
      supabase
        .from("medicine_dispensing")
        .select(
          "id, facility_id, medicine_id, quantity, dispensing_type, dispense_date, facility:facilities(facility_name, facility_code, facility_type)"
        )
        .eq("medicine_id", medicineId)
        .limit(2000)
    )
      .then((dispensing) => {
        if (!active) {
          return;
        }

        setDemand({ dispensing: Array.isArray(dispensing) ? dispensing : [] });
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setDemand({ dispensing: [] });
      });

    return () => {
      active = false;
    };
  }, [selectedItem]);

  const channelSeries = useMemo(
    () => (demand ? buildChannelSeries(demand.dispensing || []) : []),
    [demand]
  );
  const adc = consumptionByMedicine?.[selectedItem?.medicine_id] ?? null;
  const daysOfSupply = selectedItem ? computeDaysOfSupply(selectedItem.quantity, adc) : null;
  const stockOutDate = computeStockOutDate(daysOfSupply);

  return (
    <ModalShell
      labelledBy="bhw-inventory-modal-title"
      onClose={onClose}
      overlayClassName="bg-white/95 backdrop-blur-sm"
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
