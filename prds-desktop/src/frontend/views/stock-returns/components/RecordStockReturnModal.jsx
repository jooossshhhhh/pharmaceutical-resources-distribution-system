import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, ChevronDown, Plus, RotateCcw, Trash2 } from "lucide-react";

import ModalShell from "../../../components/ModalShell";
import {
  createStockReturn,
  generateReturnId,
  RETURN_REASON_OPTIONS,
} from "@backend/services/stockReturnsService";
import { formatDate } from "@shared/utils/inventoryUtils";

const createEmptyItem = () => ({
  id: globalThis.crypto?.randomUUID?.() || `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  source_inventory_id: "",
  lot_no: "",
  medicine_id: "",
  medicine_name: "",
  brand_name: "",
  quantity: "",
  unit_cost: 0,
  expiration_date: "",
  available_stock: 0,
});

const createInitialForm = (profile) => ({
  reason: "EXCESS_STOCK",
  custom_reason: "",
  facility_id: profile?.role === "BHW" ? profile?.facility_id || "" : "",
});

export default function RecordStockReturnModal({
  isOpen,
  onClose,
  onSuccess,
  facilities = [],
  medicines = [],
  inventory = [],
  currentUserProfile = null,
}) {
  const isBhw = currentUserProfile?.role === "BHW";
  const [formValues, setFormValues] = useState(() => createInitialForm(currentUserProfile));
  const [items, setItems] = useState(() => [createEmptyItem()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const barangayFacilities = useMemo(() => {
    return (facilities || []).filter(
      (facility) =>
        facility.facility_type === "BARANGAY_HEALTH_STATION" ||
        (facility.facility_code &&
          facility.facility_code !== "CHO" &&
          !facility.facility_name?.includes("City Health Office"))
    );
  }, [facilities]);

  const selectedFacility = useMemo(
    () => facilities.find((facility) => facility.id === formValues.facility_id) || null,
    [facilities, formValues.facility_id]
  );

  // Available stock batches at the selected returning facility
  const facilityInventory = useMemo(() => {
    if (!formValues.facility_id) return [];
    return (inventory || [])
      .filter(
        (item) =>
          item.facility_id === formValues.facility_id &&
          Number(item.quantity) > 0
      )
      .map((item) => {
        const med = medicines.find((m) => m.id === item.medicine_id) || item.medicine || {};
        return {
          ...item,
          generic_name: item.medicine_name || med.generic_name || "Unknown Medicine",
          brand_name: item.brand_name || med.brand_name || "",
          lot_no: item.lot_no || item.batch_number || "—",
          unit_cost: isBhw ? 0 : item.unit_cost,
        };
      });
  }, [inventory, formValues.facility_id, medicines, isBhw]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    let isActive = true;
    void Promise.resolve().then(() => {
      if (!isActive) {
        return;
      }
      setFormValues(createInitialForm(currentUserProfile));
      setItems([createEmptyItem()]);
      setFormError("");
      setIsSubmitting(false);
    });

    return () => {
      isActive = false;
    };
  }, [currentUserProfile, isOpen]);

  const handleFacilityChange = (facilityId) => {
    setFormValues((prev) => ({
      ...prev,
      facility_id: facilityId,
    }));
    setItems([createEmptyItem()]);
  };

  const handleSelectInventoryBatch = (itemIndex, inventoryId) => {
    if (!inventoryId) {
      setItems((prev) =>
        prev.map((item, idx) =>
          idx === itemIndex
            ? {
                ...item,
                source_inventory_id: "",
                lot_no: "",
                medicine_id: "",
                medicine_name: "",
                brand_name: "",
                expiration_date: "",
                unit_cost: 0,
                available_stock: 0,
                quantity: "",
              }
            : item
        )
      );
      return;
    }

    const batch = facilityInventory.find((b) => b.id === inventoryId);
    if (!batch) return;

    const matchedMed = medicines.find((m) => m.id === batch.medicine_id);
    const cost = isBhw
      ? 0
      : batch.unit_cost != null && Number(batch.unit_cost) > 0
      ? Number(batch.unit_cost)
      : matchedMed?.unit_cost != null
      ? Number(matchedMed.unit_cost)
      : 0;

    const resolvedBrand = batch.brand_name || matchedMed?.brand_name || "";
    const resolvedGeneric = batch.generic_name || matchedMed?.generic_name || batch.medicine_name || "";

    setItems((prev) =>
      prev.map((item, idx) =>
        idx === itemIndex
          ? {
              ...item,
              source_inventory_id: batch.id,
              lot_no: batch.lot_no,
              medicine_id: batch.medicine_id || "",
              medicine_name: resolvedGeneric,
              brand_name: resolvedBrand || "Generic (No Brand)",
              expiration_date: batch.expiration_date || "",
              unit_cost: cost,
              available_stock: Number(batch.quantity) || 0,
              quantity: item.quantity && Number(item.quantity) <= Number(batch.quantity) ? item.quantity : "",
            }
          : item
      )
    );
  };

  const handleItemFieldChange = (itemIndex, field, value) => {
    setItems((prev) =>
      prev.map((item, idx) => (idx === itemIndex ? { ...item, [field]: value } : item))
    );
  };

  const handleAddItem = () => {
    setItems((prev) => [...prev, createEmptyItem()]);
  };

  const handleRemoveItem = (itemIndex) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== itemIndex));
  };

  const { totalUnits, totalEstimatedCost } = useMemo(() => {
    let units = 0;
    let cost = 0;
    for (const item of items) {
      const q = parseInt(item.quantity, 10) || 0;
      const c = parseFloat(item.unit_cost) || 0;
      units += q;
      cost += q * c;
    }
    return { totalUnits: units, totalEstimatedCost: cost };
  }, [items]);

  const handleSubmit = async (event) => {
    event?.preventDefault();
    setFormError("");

    if (!formValues.facility_id) {
      setFormError("Returning facility is required.");
      return;
    }

    if (items.length === 0) {
      setFormError("Please add at least one medicine item to return.");
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemNum = items.length > 1 ? ` (Item #${i + 1})` : "";
      if (!item.source_inventory_id) {
        setFormError(`Please select a stock item from facility inventory${itemNum}.`);
        return;
      }
      if (!item.lot_no?.trim()) {
        setFormError(`Lot number is missing${itemNum}.`);
        return;
      }
      const enteredQty = parseInt(item.quantity, 10) || 0;
      if (enteredQty <= 0) {
        setFormError(`Quantity must be greater than zero${itemNum}.`);
        return;
      }
      if (item.available_stock > 0 && enteredQty > item.available_stock) {
        setFormError(
          `Returned quantity (${enteredQty}) exceeds the facility stock on hand (${item.available_stock}) for ${item.medicine_name}${itemNum}.`
        );
        return;
      }
    }

    // Check for duplicate batches selected across rows
    const selectedIds = items.map((it) => it.source_inventory_id).filter(Boolean);
    if (new Set(selectedIds).size !== selectedIds.length) {
      setFormError("Duplicate batches detected. Please adjust the quantity on the existing item instead of adding the same batch twice.");
      return;
    }

    const finalReason = formValues.custom_reason?.trim()
      ? formValues.custom_reason.trim()
      : (formValues.reason || "EXCESS_STOCK");

    if (formValues.reason === "OTHER" && !formValues.custom_reason?.trim()) {
      setFormError("Please type the custom reason for returning this stock.");
      return;
    }

    setIsSubmitting(true);
    try {
      const facilityCode = selectedFacility?.facility_code || (isBhw ? "BHW" : "CHO");
      const generatedId = generateReturnId(facilityCode);

      const payloadInput = {
        return_id: generatedId,
        facility_id: formValues.facility_id,
        facility_code: facilityCode,
        reason: finalReason,
        remarks: formValues.custom_reason?.trim() || null,
        status: isBhw ? "PENDING" : "CONFIRMED",
        items: items.map((it) => ({
          ...it,
          quantity: parseInt(it.quantity, 10),
          unit_cost: isBhw ? 0 : (parseFloat(it.unit_cost) || 0),
        })),
      };

      const result = await createStockReturn({
        stockReturnData: payloadInput,
        userProfile: currentUserProfile,
      });

      onSuccess?.(result);
      onClose();
    } catch (err) {
      console.error("[RecordStockReturnModal] Submission error:", err);
      setFormError(err.message || "Unable to save the stock return.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="max-w-3xl w-full p-0 overflow-hidden rounded-xl bg-white shadow-2xl"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[90vh] w-full flex-col overflow-hidden">
        {/* Standard PRDS Modal Header */}
        <div className="border-b border-neutral-100 px-6 py-3.5">
          <h3 className="text-lg font-black leading-tight text-[#0d1117]">
            {isBhw ? "Submit Stock Return to CHO" : "Record Stock Return"}
          </h3>
        </div>

        {/* Modal Body */}
        <div className="prds-modal-scrollbar space-y-3.5 overflow-y-auto px-6 py-4">
          {formError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="flex-1">{formError}</p>
            </div>
          )}

          {/* Section 1: Facility & Reason */}
          <section className="rounded-xl border border-[#d8dadc] bg-[#fbfaf8] p-3.5 shadow-2xs">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-700 mb-2.5">
              Facility &amp; Return Purpose
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-neutral-700">
                  Returning Facility <span className="text-red-500">*</span>
                </label>
                {isBhw ? (
                  <div className="flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-black text-[#0d1117]">
                    <Building2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>
                      {currentUserProfile?.facility_name ||
                        selectedFacility?.facility_name ||
                        "Your Barangay Health Center"}
                    </span>
                  </div>
                ) : (
                  <select
                    value={formValues.facility_id}
                    onChange={(event) => handleFacilityChange(event.target.value)}
                    className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-xs font-bold text-[#0d1117] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 cursor-pointer"
                    required
                  >
                    <option value="">Select returning facility...</option>
                    {barangayFacilities.map((facility) => (
                      <option key={facility.id} value={facility.id}>
                        {facility.facility_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-neutral-700">
                  Reason <span className="text-red-500">*</span>
                </label>
                {formValues.reason === "OTHER" ? (
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      autoFocus
                      value={formValues.custom_reason}
                      onChange={(event) => setFormValues((prev) => ({ ...prev, custom_reason: event.target.value }))}
                      placeholder="Type custom reason here..."
                      className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-3 pr-20 text-xs font-bold text-[#0d1117] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-neutral-400 placeholder:font-normal"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFormValues((prev) => ({ ...prev, reason: "EXCESS_STOCK", custom_reason: "" }));
                      }}
                      className="absolute right-1.5 flex items-center gap-1 rounded border border-neutral-200 bg-neutral-100 px-2 py-1 text-[10px] font-bold text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 transition cursor-pointer"
                      title="Switch back to preset list"
                    >
                      <ChevronDown className="h-3 w-3 text-neutral-500" />
                      <span>Preset</span>
                    </button>
                  </div>
                ) : (
                  <select
                    value={formValues.reason}
                    onChange={(event) => {
                      const val = event.target.value;
                      if (val === "OTHER") {
                        setFormValues((prev) => ({ ...prev, reason: "OTHER", custom_reason: "" }));
                      } else {
                        setFormValues((prev) => ({ ...prev, reason: val, custom_reason: "" }));
                      }
                    }}
                    className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-xs font-bold text-[#0d1117] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 cursor-pointer"
                  >
                    {RETURN_REASON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    <option value="OTHER">Other / Custom Reason...</option>
                  </select>
                )}
              </div>
            </div>
          </section>

          {/* Section 2: Medicine Item Information (Supports Multiple Items) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-700">
                Medicine &amp; Batch Information {items.length > 1 && `(${items.length} items)`}
              </p>
            </div>

            {items.map((item, itemIndex) => {
              const otherSelectedIds = new Set(
                items
                  .filter((_, idx) => idx !== itemIndex)
                  .map((it) => it.source_inventory_id)
                  .filter(Boolean)
              );

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-[#d8dadc] bg-[#fbfaf8] p-3.5 shadow-2xs space-y-3 relative"
                >
                  {items.length > 1 && (
                    <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2">
                      <span className="text-xs font-black text-neutral-800">
                        Item #{itemIndex + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(itemIndex)}
                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 transition cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove Item</span>
                      </button>
                    </div>
                  )}

                  {/* Facility Inventory Selection */}
                  <div>
                    <label className="mb-1 block text-xs font-bold text-neutral-700">
                      Select Stock Item from Facility Inventory <span className="text-red-500">*</span>
                    </label>
                    {facilityInventory.length > 0 ? (
                      <select
                        value={item.source_inventory_id}
                        onChange={(event) => handleSelectInventoryBatch(itemIndex, event.target.value)}
                        className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-xs font-bold text-[#0d1117] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 cursor-pointer"
                        required
                      >
                        <option value="">Choose batch on hand...</option>
                        {facilityInventory.map((invItem) => {
                          const isAlreadySelected = otherSelectedIds.has(invItem.id);
                          return (
                            <option
                              key={invItem.id}
                              value={invItem.id}
                              disabled={isAlreadySelected}
                            >
                              Lot: {invItem.lot_no} — {invItem.generic_name}
                              {isAlreadySelected ? " (Already added)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <div className="flex h-10 items-center rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-xs font-medium text-neutral-500">
                        {formValues.facility_id
                          ? "No active stock items found in this facility's inventory."
                          : "Please select a returning facility above to view available stock."}
                      </div>
                    )}
                  </div>

                  {/* Complete Medicine & Batch Attributes Grid */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-neutral-700">
                        Medicine Name
                      </label>
                      <input
                        type="text"
                        value={item.medicine_name || "—"}
                        readOnly
                        className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 text-xs font-bold text-[#0d1117] outline-none cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-neutral-700">
                        Medicine Brand
                      </label>
                      <input
                        type="text"
                        value={item.brand_name || "Generic (No Brand)"}
                        readOnly
                        className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 text-xs font-bold text-emerald-900 outline-none cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-neutral-700">
                        Lot No. <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={item.lot_no || ""}
                        readOnly
                        className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 font-mono text-xs font-bold uppercase text-[#0d1117] outline-none cursor-not-allowed"
                        placeholder="LOT-4021"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-neutral-700">
                        Expiration Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={item.expiration_date ? formatDate(item.expiration_date) : "—"}
                        readOnly
                        className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 text-xs font-semibold text-[#0d1117] outline-none cursor-not-allowed"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-neutral-700">
                        Quantity to Return <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={item.available_stock > 0 ? item.available_stock : undefined}
                        value={item.quantity}
                        onChange={(event) => handleItemFieldChange(itemIndex, "quantity", event.target.value)}
                        className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-xs font-black text-[#0d1117] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        placeholder="e.g. 50"
                        required
                      />
                      {item.available_stock > 0 && (
                        <p className="mt-0.5 text-[10px] font-semibold text-neutral-500">
                          Max available: {item.available_stock} units
                        </p>
                      )}
                    </div>

                    {!isBhw && (
                      <div>
                        <label className="mb-1 block text-xs font-bold text-neutral-700">
                          Unit Cost (PHP)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unit_cost}
                          onChange={(event) => handleItemFieldChange(itemIndex, "unit_cost", event.target.value)}
                          className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-[#0d1117] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Another Medicine Return
            </button>
          </section>

          {/* Section 3: Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs text-neutral-700">
            <span className="font-bold text-[#0d1117]">
              Total Items: <strong>{items.length} {items.length === 1 ? "medicine" : "medicines"}</strong>
            </span>
            <div className="flex items-center gap-6">
              <span>
                Total Units: <strong className="text-[#0d1117]">{totalUnits}</strong>
              </span>
              {!isBhw && (
                <span>
                  Total Value: <strong className="text-emerald-800">PHP {totalEstimatedCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Standard PRDS Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-neutral-100 bg-neutral-50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                {isBhw ? "Submit Return" : "Confirm & Record Return"}
              </>
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
