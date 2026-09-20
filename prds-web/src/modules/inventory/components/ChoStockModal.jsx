import { useEffect, useRef } from "react";

import ModalShell from "../../../components/ModalShell";
import { Field, InventoryLotTable, PlusIcon, SelectField } from "../inventoryComponents";
import {
  formatDate,
  formatNumber,
  getMedicineName,
} from "../inventoryUtils";

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
  onEditLot,
  onCancelEdit,
  canEdit,
}) {
  const modalBodyRef = useRef(null);

  const isEditing = mode === "edit";
  const isReadOnly = mode === "view";
  const title =
    mode === "create" ? "Add New Stock" : isEditing ? "Edit Stock" : "Stock Details";
  const subtitle =
    mode === "create"
      ? "Enter medicine inventory details from the inventory schema"
      : isEditing
        ? "Update medicine inventory details"
        : selectedItem
          ? getMedicineName(selectedItem)
          : "Review stock details by lot number.";

  useEffect(() => {
    modalBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [isEditing, mode, selectedItem?.id]);

  const lots = selectedItem?.lots?.length ? selectedItem.lots : selectedItem ? [selectedItem] : [];

  return (
    <ModalShell
      labelledBy="cho-inventory-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
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
              <StockDetailsHeader item={selectedItem} />
              <div className="mt-5">
                <InventoryLotTable lots={lots} canEdit={canEdit} onEditLot={onEditLot} />
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
                  title="Lot Number & Supplier"
                  description="Lot Number and supplier details support FEFO release decisions and stock traceability."
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
                      label="Lot Number"
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
            {isReadOnly ? null : (
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

function StockDetailsHeader({ item }) {
  if (!item) {
    return null;
  }

  const items = [
    ["Total Stock", formatNumber(item.quantity)],
    ["Nearest Expiration", formatDate(item.expiration_date)],
    ["Facility", item.facility?.facility_name],
    ["Expiration Date", formatDate(item.expiration_date)],
  ];

  return (
    <section className="rounded-xl border border-neutral-100 bg-white px-4 py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
            Medicine Stock
          </p>
          <p className="mt-1 text-xs font-semibold text-neutral-500">
            Grouped by medicine for this facility. Lot Number records are listed below.
          </p>
        </div>
        {item.lotCount > 0 && (
          <span className="inline-flex w-fit rounded-full bg-[#f7f6f3] px-3 py-1 text-xs font-black text-[#0d1117]">
            {item.lotCount} lot record{item.lotCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
