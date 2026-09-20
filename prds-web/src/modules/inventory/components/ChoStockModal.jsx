import { useEffect, useMemo, useRef, useState } from "react";

import ModalShell from "../../../components/ModalShell";
import { supabase } from "../../../services/supabase";
import DemandPanel from "./DemandPanel";
import {
  buildChannelSeries,
  computeDaysOfSupply,
  computeStockOutDate,
  forecastSummary,
  sumDispensedByFacilityType,
} from "../demandUtils";
import { Field, PlusIcon, SelectField } from "../inventoryComponents";
import {
  formatDate,
  formatDateTime,
  getMedicineName,
  getStockStatus,
} from "../inventoryUtils";

const safeFetch = async (request) => {
  const result = await request;
  return result.error ? [] : result.data || [];
};

export function ChoStockModal({
  mode,
  selectedItem,
  formValues,
  facilities,
  medicines,
  suppliers,
  consumptionByMedicine = {},
  error,
  isSaving,
  onClose,
  onChange,
  onSubmit,
  onEdit,
  onCancelEdit,
  canEdit,
  fetchStockHistory,
}) {
  const [history, setHistory] = useState(null);
  const modalBodyRef = useRef(null);

  const isEditing = mode === "edit";
  const isReadOnly = mode === "view";
  const isHistoryLoading = mode === "view" && history === null;
  const title =
    mode === "create" ? "Add New Stock" : isEditing ? "Edit Stock" : "Stock Details";
  const subtitle =
    mode === "create"
      ? "Enter medicine inventory details from the inventory schema"
      : isEditing
        ? "Update medicine inventory details"
        : selectedItem
          ? `${getMedicineName(selectedItem)}${selectedItem.batch_number ? ` - ${selectedItem.batch_number}` : ""}`
          : "Review batch details and forecast support.";

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

  useEffect(() => {
    modalBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [isEditing, mode, selectedItem?.id]);

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
          .select(
            "id, facility_id, medicine_id, quantity, dispensing_type, dispense_date, facility:facilities(facility_name, facility_code, facility_type)"
          )
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
  const stockStatus = selectedItem ? getStockStatus(selectedItem) : null;
  const estimatedValue = selectedItem
    ? Number(selectedItem.quantity || 0) * Number(selectedItem.medicine?.unit_cost || 0)
    : 0;

  return (
    <ModalShell
      labelledBy="cho-inventory-modal-title"
      onClose={onClose}
      overlayClassName="bg-white/95 backdrop-blur-sm"
      panelClassName="max-w-4xl"
    >
      <form
        onSubmit={onSubmit}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="border-b border-neutral-100 px-6 py-5">
          <h3 id="cho-inventory-modal-title" className="text-xl font-black text-black">{title}</h3>
          <p className="text-sm font-medium text-neutral-500">{subtitle}</p>
        </div>

        <div ref={modalBodyRef} className="prds-modal-scrollbar flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          {isReadOnly && selectedItem && (
            <>
              <StockDetailsSummary item={selectedItem} />

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
                    title="Stock Details"
                    adc={adc}
                    daysOfSupply={daysOfSupply}
                    stockOutDate={stockOutDate}
                    channelSeries={channelSeries}
                    split={split}
                    forecast={forecast}
                    pendingRequests={pendingRequests}
                    dispensingRows={demand?.dispensing || []}
                    forecastRows={demand?.forecast || []}
                    stockItem={selectedItem}
                    stockStatus={stockStatus}
                    estimatedValue={estimatedValue}
                    stockHistory={history}
                    isHistoryLoading={isHistoryLoading}
                  />
                )}
              </div>
            </>
          )}

          {!isReadOnly && (
            <>
              <div className="space-y-4">
                <StockFormSection
                  title="Medicine"
                  description={
                    isEditing
                      ? "The medicine for this stock record cannot be changed."
                      : "Choose the medicine that will be added to CHO inventory."
                  }
                >
                  {isEditing ? (
                    <div className="rounded-xl border border-neutral-100 bg-[#f7f6f3] px-4 py-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-500">
                        Medicine
                      </p>
                      <p className="mt-1 text-sm font-black text-[#0d1117]">
                        {getMedicineName(selectedItem)}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-neutral-500">
                        Medicine and facility are locked to protect existing requests, dispensing records, and stock history.
                      </p>
                    </div>
                  ) : (
                    <SelectField
                      label="Medicine"
                      name="medicine_id"
                      value={formValues.medicine_id}
                      onChange={onChange}
                      required
                    >
                      <option value="">Select medicine</option>
                      {medicines.map((medicine) => (
                        <option key={medicine.id} value={medicine.id}>
                          {medicine.generic_name} {medicine.dosage}
                        </option>
                      ))}
                    </SelectField>
                  )}
                </StockFormSection>

                <StockFormSection
                  title="Batch & Supplier"
                  description="Batch and supplier details support FEFO release decisions and stock traceability."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
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
                  </div>
                </StockFormSection>

                <StockFormSection
                  title="Stock Controls"
                  description="Threshold drives low, critical, and reorder indicators immediately after saving."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
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
                  </div>
                </StockFormSection>

                <StockFormSection
                  title="Dates"
                  description="Expiration date is used for FEFO visibility and expiring-soon alerts."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
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
                </StockFormSection>
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

        <div className="flex items-center justify-end gap-3 border-t border-neutral-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={isEditing ? onCancelEdit : onClose}
              className="h-10 rounded-lg bg-neutral-100 px-6 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
            >
              {isReadOnly ? "Close" : "Cancel"}
            </button>
            {isReadOnly ? (
              canEdit ? (
                <button
                  type="button"
                  onClick={onEdit}
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

function StockFormSection({ title, description, children }) {
  return (
    <section className="rounded-xl border border-[#d8dadc] bg-white p-4">
      <div className="mb-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
          {title}
        </p>
        {description && (
          <p className="mt-0.5 text-xs font-semibold leading-5 text-neutral-500">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function StockDetailsSummary({ item }) {
  if (!item) {
    return null;
  }

  const items = [
    ["Batch Number", item.batch_number],
    ["Supplier", item.supplier?.supplier_name],
    ["Date Received", formatDate(item.date_received)],
    ["Expiration Date", formatDate(item.expiration_date)],
    ["Last Updated", formatDateTime(item.updated_at)],
  ];

  return (
    <section className="rounded-xl border border-neutral-100 bg-white px-4 py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
            Batch Information
          </p>
          <p className="mt-1 text-xs font-semibold text-neutral-500">
            Batch source and date details used for stock tracking.
          </p>
        </div>
        {item.batch_number && (
          <span className="inline-flex w-fit rounded-full bg-[#f7f6f3] px-3 py-1 text-xs font-black text-[#0d1117]">
            {item.batch_number}
          </span>
        )}
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg bg-[#f7f6f3] px-3 py-2.5">
            <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
              {label}
            </dt>
            <dd className="mt-1 break-words text-sm font-black text-[#0d1117]">
              {value || "-"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
