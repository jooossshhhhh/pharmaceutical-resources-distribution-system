import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  FileText,
  Info,
  Package,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import ModalShell from "../../../components/ModalShell";
import { Field, InventoryLotTable, PlusIcon, SelectField } from "../inventoryComponents";
import {
  calculateDynamicThreshold,
  calculatePoTotals,
  formatCurrency,
  formatDate,
  formatNumber,
  getThresholdCalculationDetails,
  getExpiredDays,
  getExpiryStatus,
  getMedicineName,
  getStockStatus,
  getTomorrowDateString,
  isLotExpired,
  isLotNumberUsed,
  isPoNumberUsed,
  isStrictlyFutureDate,
  normalizeLotNumber,
} from "@shared/utils/inventoryUtils";
import { formatMedicineCategories } from "@shared/utils/medicineUtils";

export function ChoStockModal({
  mode,
  selectedItem,
  formValues,
  inventory = [],
  facilities = [],
  medicines = [],
  suppliers = [],
  consumptionByMedicine = {},
  error,
  isSaving,
  onClose,
  onChange,
  onPoItemChange,
  onAddPoItem,
  onRemovePoItem,
  onSubmit,
  onEdit,
  onEditLot,
  onDisposeLot,
  onCancelEdit,
  canEdit,
}) {
  const modalBodyRef = useRef(null);
  const transitionLockRef = useRef(0);
  const [step, setStep] = useState("input"); // "input" | "preview"
  const [stepError, setStepError] = useState("");
  const [itemErrors, setItemErrors] = useState({});
  const [itemWarnings, setItemWarnings] = useState({});
  const brandWarningAcknowledgedRef = useRef(false);

  const clearItemError = (itemId, field) => {
    setItemErrors((prev) => {
      if (!prev[itemId] || !prev[itemId][field]) return prev;
      const nextItem = { ...prev[itemId] };
      delete nextItem[field];
      if (Object.keys(nextItem).length === 0) {
        const nextErrors = { ...prev };
        delete nextErrors[itemId];
        return nextErrors;
      }
      return { ...prev, [itemId]: nextItem };
    });
  };

  const clearItemWarning = (itemId, field) => {
    setItemWarnings((prev) => {
      if (!prev[itemId] || !prev[itemId][field]) return prev;
      const nextItem = { ...prev[itemId] };
      delete nextItem[field];
      if (Object.keys(nextItem).length === 0) {
        const nextWarnings = { ...prev };
        delete nextWarnings[itemId];
        return nextWarnings;
      }
      return { ...prev, [itemId]: nextItem };
    });
  };

  const isEditing = mode === "edit";
  const isReadOnly = mode === "view";
  const isExpired = isLotExpired(selectedItem);

  const title =
    mode === "create"
      ? "Add Stock"
      : isEditing
        ? "Edit Lot Record"
        : isExpired
          ? "Expired Stock Details"
          : "Stock Details";

  const subtitle =
    mode === "create"
      ? step === "preview"
        ? "Review the inputted stock details and medicine items before confirming."
        : "Record new medicine batches received from supplier purchase orders."
      : isEditing
        ? "Update lot number, PO number, unit cost, quantities, or dates"
        : selectedItem
          ? `${getMedicineName(selectedItem)}${isExpired ? " (Quarantined Expired Stock)" : ""}`
          : "Review stock details by lot number.";

  useEffect(() => {
    modalBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [isEditing, mode, selectedItem?.id, step]);

  useEffect(() => {
    setStep("input");
    setStepError("");
  }, [mode, selectedItem?.id]);

  useEffect(() => {
    if (error) {
      setStepError(error);
    }
  }, [error]);

  const lots = selectedItem?.lots?.length ? selectedItem.lots : selectedItem ? [selectedItem] : [];

  const poTotals = useMemo(
    () => calculatePoTotals(formValues?.items || []),
    [formValues?.items]
  );

  const editLotSubtotal = useMemo(() => {
    const qty = Number(formValues?.quantity || 0);
    const cost = Number(formValues?.unit_cost || 0);
    return qty > 0 && cost > 0 ? qty * cost : null;
  }, [formValues?.quantity, formValues?.unit_cost]);

  const handleProceedToPreview = (e) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!formValues.facility_id) {
      setStepError("Inventory location could not be detected. Please reload the page and try again.");
      return;
    }

    if (!formValues.po_number?.trim()) {
      setStepError("Purchase Order (PO) number is required.");
      return;
    }

    if (isPoNumberUsed(formValues.po_number, inventory, null, formValues.facility_id)) {
      setStepError(`Purchase Order (PO) number "${formValues.po_number}" is already used in existing inventory. PO numbers must be unique.`);
      return;
    }

    if (!formValues.supplier_name?.trim()) {
      setStepError("Supplier name is required for this Purchase Order.");
      return;
    }

    if (!formValues.date_received) {
      setStepError("Date received is required.");
      return;
    }

    const items = formValues.items || [];
    if (items.length === 0) {
      setStepError("At least one medicine item is required.");
      return;
    }

    const seenLots = new Set();
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const rowNum = i + 1;

      if (!item.medicine_id) {
        setStepError(`Line #${rowNum}: Please select a medicine.`);
        return;
      }

      const normLot = normalizeLotNumber(item.batch_number);
      if (!normLot) {
        setStepError(`Line #${rowNum}: Lot Number is required and must contain alphanumeric characters.`);
        return;
      }

      if (seenLots.has(normLot)) {
        setStepError(
          `Line #${rowNum}: Duplicate Lot Number "${item.batch_number}" detected in this PO batch. Each medicine box must have a unique Lot Number.`
        );
        return;
      }
      seenLots.add(normLot);

      if (isLotNumberUsed(item.batch_number, inventory, null, formValues.facility_id)) {
        setStepError(
          `Line #${rowNum}: Lot Number "${item.batch_number}" is already used in existing inventory. Lot numbers must be unique.`
        );
        return;
      }

      if (item.quantity === "" || Number(item.quantity) <= 0) {
        setStepError(`Line #${rowNum}: Quantity must be greater than zero.`);
        return;
      }

      if (item.threshold !== "" && Number(item.threshold) < 0) {
        setStepError(`Line #${rowNum}: Minimum threshold cannot be negative.`);
        return;
      }

      if (item.unit_cost !== "" && Number(item.unit_cost) < 0) {
        setStepError(`Line #${rowNum}: Unit cost cannot be negative.`);
        return;
      }

      if (!item.expiration_date) {
        setStepError(`Line #${rowNum}: Expiration date is required.`);
        return;
      }

      if (!isStrictlyFutureDate(item.expiration_date)) {
        setStepError(
          `Line #${rowNum}: Expiration date must be a future date (cannot be today or in the past).`
        );
        return;
      }

      if (new Date(item.expiration_date) <= new Date(formValues.date_received)) {
        setStepError(`Line #${rowNum}: Expiration date must be later than date received.`);
        return;
      }
    }

    setStepError("");
    transitionLockRef.current = Date.now() + 600;
    setStep("preview");
  };

  const handleConfirmSubmit = (e) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
      e.stopPropagation();
    }
    // Prevent accidental click bleed-through immediately after switching to preview
    if (Date.now() < transitionLockRef.current) {
      return;
    }
    onSubmit(e);
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (mode === "create") {
      if (step === "input") {
        handleProceedToPreview(e);
      }
      return;
    }
    onSubmit(e);
  };

  return (
    <ModalShell
      labelledBy="cho-inventory-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName="max-w-5xl"
    >
      <form
        onSubmit={handleFormSubmit}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <div>
            <h3 id="cho-inventory-modal-title" className="text-lg font-black leading-tight text-[#0d1117]">
              {title}
            </h3>
            <p className="text-xs font-medium text-neutral-500">{subtitle}</p>
          </div>
          {mode === "create" && step === "preview" && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-neutral-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-neutral-800">
              <Receipt className="h-3.5 w-3.5" />
              PO Preview
            </span>
          )}
        </div>

        <div ref={modalBodyRef} className="prds-modal-scrollbar flex-1 overflow-y-auto px-6 py-5">
          {(stepError || error) && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
              <span>{stepError || error}</span>
              <button
                type="button"
                onClick={() => setStepError("")}
                className="text-red-500 hover:text-red-700 p-0.5 rounded cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {isReadOnly && selectedItem && (
            <>
              <StockDetailsHeader item={selectedItem} lots={lots} />
              <div className="mt-5">
                <InventoryLotTable
                  lots={lots}
                  canEdit={canEdit}
                  onEditLot={onEditLot}
                  onDisposeLot={onDisposeLot}
                />
              </div>
            </>
          )}

          {mode === "create" && (
            <div className="space-y-4">
              {/* Stepper Navigation */}
              <div className="flex items-center justify-center gap-3 border-b border-neutral-100 pb-3">
                <button
                  type="button"
                  onClick={() => setStep("input")}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                    step === "input"
                      ? "btn-primary text-white shadow-xs"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">1</span>
                  Input Details &amp; Medicines
                </button>
                <span className="text-neutral-400 font-bold">→</span>
                <button
                  type="button"
                  onClick={handleProceedToPreview}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                    step === "preview"
                      ? "btn-primary text-white shadow-xs"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">2</span>
                  Preview
                </button>
              </div>

              {step === "input" ? (
                <>
                  {/* Purchase Order Header Section */}
                  <section className="rounded-xl border border-neutral-200 bg-[#fbfaf8] p-4 shadow-2xs">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1F4E5A] text-white shadow-xs">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-800">
                          Purchase Order Delivery Receipt
                        </p>
                        <p className="text-[11px] font-semibold text-neutral-500">
                          Delivery receipt metadata that links all received medicine batches in this intake.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field
                        label="PO Number"
                        name="po_number"
                        placeholder="e.g. 08-92-26"
                        value={formValues.po_number || ""}
                        onChange={onChange}
                        required
                      />

                      <Field
                        label="Date Received"
                        name="date_received"
                        type="date"
                        value={formValues.date_received || ""}
                        onChange={onChange}
                        required
                      />

                      <Field
                        label="Supplier Name"
                        name="supplier_name"
                        placeholder="Enter supplier name"
                        value={formValues.supplier_name || ""}
                        onChange={onChange}
                        required
                      />

                      <Field
                        label="Supplier Contact Number"
                        name="supplier_contact"
                        placeholder="e.g. 0912 345 6789 / (032) 272-1234"
                        value={formValues.supplier_contact || ""}
                        onChange={onChange}
                      />

                      <div className="md:col-span-2">
                        <Field
                          label="Supplier Address"
                          name="supplier_address"
                          placeholder="Enter supplier address"
                          value={formValues.supplier_address || ""}
                          onChange={onChange}
                        />
                      </div>
                    </div>
                  </section>

                  {/* Multi-Item Medicines Section */}
                  <section className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-2xs">
                    <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-neutral-100">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-800">
                          Medicine Information
                        </p>
                        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-black text-neutral-700">
                          {formValues.items?.length || 1} line item{(formValues.items?.length || 1) === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {(formValues.items || []).map((item, index) => {
                        const itemId = item.id || `item-${index}`;
                        const qty = Number(item.quantity) || 0;
                        const cost = Number(item.unit_cost) || 0;
                        const subtotal = qty * cost;
                        const selectedMed = medicines.find((m) => m.id === item.medicine_id);
                        const hasItemError = Boolean(itemErrors[itemId]);
                        const hasItemWarning = Boolean(itemWarnings[itemId]);

                        return (
                          <div
                            key={itemId}
                            id={`po-item-card-${itemId}`}
                            className={`rounded-xl border p-3.5 transition ${
                              hasItemError
                                ? "border-red-300 bg-red-50/15 shadow-2xs"
                                : hasItemWarning
                                  ? "border-amber-300 bg-amber-50/15 shadow-2xs"
                                  : "border-neutral-200 bg-[#fbfaf8] hover:border-neutral-300"
                            }`}
                          >
                            <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-200/60">
                              <div className="flex items-center gap-2">
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white ${
                                  hasItemError ? "bg-red-600" : hasItemWarning ? "bg-amber-600" : "bg-[#1F4E5A]"
                                }`}>
                                  {index + 1}
                                </span>
                                {selectedMed && (
                                  <span className="text-xs font-black text-[#0d1117]">
                                    {selectedMed.generic_name} {selectedMed.dosage || ""}
                                    {selectedMed.brand_name && (
                                      <span className="ml-1 text-[11px] font-semibold text-neutral-500">
                                        ({selectedMed.brand_name})
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mr-1.5">
                                    Subtotal:
                                  </span>
                                  <span className="text-xs font-black text-emerald-700">
                                    {formatCurrency(subtotal)}
                                  </span>
                                </div>
                                {(formValues.items || []).length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      clearItemError(itemId, "medicine_id");
                                      clearItemError(itemId, "batch_number");
                                      clearItemError(itemId, "quantity");
                                      clearItemError(itemId, "unit_cost");
                                      clearItemError(itemId, "expiration_date");
                                      clearItemWarning(itemId, "brand_name");
                                      onRemovePoItem(item.id);
                                    }}
                                    title="Remove this medicine line"
                                    className="rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {(() => {
                              const threshDetails = getThresholdCalculationDetails({
                                adc: consumptionByMedicine[item.medicine_id],
                                quantity: item.quantity,
                              });
                              const isCustom = Boolean(item.is_threshold_custom);

                              return (
                                <div className="space-y-3">
                                  {/* Row 1: Medicine Identification & Batch Traceability */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-start">
                                    <div className="lg:col-span-5">
                                      <SearchableMedicinePicker
                                        medicines={medicines}
                                        value={item.medicine_id}
                                        hasError={Boolean(itemErrors[itemId]?.medicine_id)}
                                        onSelect={(medId) => {
                                          onPoItemChange(item.id, "medicine_id", medId);
                                          clearItemError(itemId, "medicine_id");
                                        }}
                                        label="Medicine"
                                        required
                                      />
                                      {itemErrors[itemId]?.medicine_id && (
                                        <div
                                          role="alert"
                                          className="mt-1.5 flex items-start justify-between gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700 shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150"
                                        >
                                          <div className="flex items-start gap-1.5 leading-snug">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-600" />
                                            <span>{itemErrors[itemId].medicine_id}</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => clearItemError(itemId, "medicine_id")}
                                            className="text-red-500 hover:text-red-700 p-0.5 rounded cursor-pointer shrink-0"
                                            title="Dismiss error"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    <div className="lg:col-span-3">
                                      <label className="block text-xs font-black uppercase tracking-wide text-neutral-600 mb-1.5">
                                        Brand
                                      </label>
                                      <input
                                        type="text"
                                        autoComplete="off"
                                        placeholder="e.g. Biogesic"
                                        value={item.brand_name || ""}
                                        onChange={(e) => {
                                          onPoItemChange(item.id, "brand_name", e.target.value);
                                          clearItemWarning(itemId, "brand_name");
                                        }}
                                        className={`h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold text-[#0d1117] outline-none transition placeholder:text-neutral-400 ${
                                          itemWarnings[itemId]?.brand_name
                                            ? "border-amber-400 bg-amber-50/20 focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                                            : "border-neutral-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                        }`}
                                      />
                                      {itemWarnings[itemId]?.brand_name && (
                                        <div
                                          role="alert"
                                          className="mt-1.5 flex items-start justify-between gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-800 shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150"
                                        >
                                          <div className="flex items-start gap-1.5 leading-snug">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                                            <span>{itemWarnings[itemId].brand_name}</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => clearItemWarning(itemId, "brand_name")}
                                            className="text-amber-600 hover:text-amber-800 p-0.5 rounded cursor-pointer shrink-0"
                                            title="Dismiss warning"
                                            aria-label="Dismiss brand warning"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    <div className="lg:col-span-4">
                                      <label className="block text-xs font-black uppercase tracking-wide text-neutral-600 mb-1.5">
                                        Lot Number <span className="text-red-500">*</span>
                                      </label>
                                      <input
                                        type="text"
                                        autoComplete="off"
                                        autoCorrect="off"
                                        spellCheck="false"
                                        data-form-type="other"
                                        placeholder="e.g. FGOLSA23"
                                        value={item.batch_number}
                                        onChange={(e) => {
                                          onPoItemChange(item.id, "batch_number", e.target.value);
                                          clearItemError(itemId, "batch_number");
                                        }}
                                        className={`h-10 w-full rounded-lg border bg-white px-3 font-mono text-sm font-bold uppercase tracking-wider text-[#0d1117] outline-none transition placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-neutral-400 ${
                                          itemErrors[itemId]?.batch_number
                                            ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                            : "border-neutral-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                        }`}
                                        required
                                      />
                                      {itemErrors[itemId]?.batch_number && (
                                        <div
                                          role="alert"
                                          className="mt-1.5 flex items-start justify-between gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700 shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150"
                                        >
                                          <div className="flex items-start gap-1.5 leading-snug">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-600" />
                                            <span>{itemErrors[itemId].batch_number}</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => clearItemError(itemId, "batch_number")}
                                            className="text-red-500 hover:text-red-700 p-0.5 rounded cursor-pointer shrink-0"
                                            title="Dismiss error"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Row 2: Quantities, Dynamic Threshold, Valuation & Dates */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-start pt-1">
                                    <div className="lg:col-span-2">
                                      <label className="block text-xs font-black uppercase tracking-wide text-neutral-600 mb-1.5 truncate" title="Quantity">
                                        Qty <span className="text-red-500">*</span>
                                      </label>
                                      <input
                                        type="number"
                                        autoComplete="off"
                                        min="1"
                                        placeholder="0"
                                        value={item.quantity}
                                        onChange={(e) => {
                                          onPoItemChange(item.id, "quantity", e.target.value);
                                          clearItemError(itemId, "quantity");
                                        }}
                                        className={`h-10 w-full rounded-lg border bg-white px-3 text-sm font-bold text-[#0d1117] outline-none transition placeholder:text-neutral-400 ${
                                          itemErrors[itemId]?.quantity
                                            ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                            : "border-neutral-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                        }`}
                                        required
                                      />
                                      {itemErrors[itemId]?.quantity && (
                                        <div
                                          role="alert"
                                          className="mt-1.5 flex items-start justify-between gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700 shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150"
                                        >
                                          <div className="flex items-start gap-1.5 leading-snug">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-600" />
                                            <span>{itemErrors[itemId].quantity}</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => clearItemError(itemId, "quantity")}
                                            className="text-red-500 hover:text-red-700 p-0.5 rounded cursor-pointer shrink-0"
                                            title="Dismiss error"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    <div className="lg:col-span-4">
                                      <div className="flex items-center justify-between mb-1.5">
                                        <label className="block text-xs font-black uppercase tracking-wide text-neutral-600 truncate">
                                          Min Threshold <span className="text-red-500">*</span>
                                        </label>
                                        {isCustom ? (
                                          <button
                                            type="button"
                                            onClick={() => onPoItemChange(item.id, "threshold_reset", "")}
                                            className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 transition cursor-pointer"
                                            title={`Reset to auto-calculated threshold (${threshDetails.threshold})`}
                                          >
                                            Custom • Reset ({threshDetails.threshold})
                                          </button>
                                        ) : (
                                          <span
                                            className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1F4E5A] bg-[#E5EFF1] border border-[#34769B]/20 rounded px-1.5 py-0.5"
                                            title={threshDetails.description}
                                          >
                                            ✨ Auto ({threshDetails.shortLabel})
                                          </span>
                                        )}
                                      </div>
                                      <input
                                        type="number"
                                        autoComplete="off"
                                        min="0"
                                        placeholder={String(threshDetails.threshold)}
                                        value={item.threshold ?? ""}
                                        onChange={(e) => {
                                          onPoItemChange(item.id, "threshold", e.target.value);
                                          clearItemError(itemId, "threshold");
                                        }}
                                        className={`h-10 w-full rounded-lg border bg-white px-3 text-sm font-bold text-[#0d1117] outline-none transition placeholder:text-neutral-400 ${
                                          itemErrors[itemId]?.threshold
                                            ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                            : isCustom
                                              ? "border-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                                              : "border-neutral-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                        }`}
                                        required
                                      />
                                      <p className="mt-1 text-[10px] font-medium text-neutral-500 truncate" title={threshDetails.description}>
                                        {threshDetails.description}
                                      </p>
                                      {itemErrors[itemId]?.threshold && (
                                        <div
                                          role="alert"
                                          className="mt-1.5 flex items-start justify-between gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700 shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150"
                                        >
                                          <div className="flex items-start gap-1.5 leading-snug">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-600" />
                                            <span>{itemErrors[itemId].threshold}</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => clearItemError(itemId, "threshold")}
                                            className="text-red-500 hover:text-red-700 p-0.5 rounded cursor-pointer shrink-0"
                                            title="Dismiss error"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    <div className="lg:col-span-3">
                                      <label className="block text-xs font-black uppercase tracking-wide text-neutral-600 mb-1.5">
                                        Unit Cost (₱)
                                      </label>
                                      <div className="relative">
                                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400">
                                          ₱
                                        </span>
                                        <input
                                          type="number"
                                          autoComplete="off"
                                          min="0"
                                          step="0.01"
                                          placeholder="0.00"
                                          value={item.unit_cost}
                                          onChange={(e) => {
                                            onPoItemChange(item.id, "unit_cost", e.target.value);
                                            clearItemError(itemId, "unit_cost");
                                          }}
                                          className={`h-10 w-full rounded-lg border bg-white pl-7 pr-3 text-sm font-bold text-[#0d1117] outline-none transition placeholder:text-neutral-400 ${
                                            itemErrors[itemId]?.unit_cost
                                              ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                              : "border-neutral-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                          }`}
                                        />
                                      </div>
                                      {itemErrors[itemId]?.unit_cost && (
                                        <div
                                          role="alert"
                                          className="mt-1.5 flex items-start justify-between gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700 shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150"
                                        >
                                          <div className="flex items-start gap-1.5 leading-snug">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-600" />
                                            <span>{itemErrors[itemId].unit_cost}</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => clearItemError(itemId, "unit_cost")}
                                            className="text-red-500 hover:text-red-700 p-0.5 rounded cursor-pointer shrink-0"
                                            title="Dismiss error"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    <div className="lg:col-span-3">
                                      <label className="block text-xs font-black uppercase tracking-wide text-neutral-600 mb-1.5">
                                        Expiry Date <span className="text-red-500">*</span>
                                      </label>
                                      <input
                                        type="date"
                                        min={getTomorrowDateString()}
                                        value={item.expiration_date || ""}
                                        onChange={(e) => {
                                          onPoItemChange(item.id, "expiration_date", e.target.value);
                                          clearItemError(itemId, "expiration_date");
                                        }}
                                        className={`h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold text-[#0d1117] outline-none transition ${
                                          itemErrors[itemId]?.expiration_date
                                            ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                            : "border-neutral-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                                        }`}
                                        required
                                      />
                                      {itemErrors[itemId]?.expiration_date && (
                                        <div
                                          role="alert"
                                          className="mt-1.5 flex items-start justify-between gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700 shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150"
                                        >
                                          <div className="flex items-start gap-1.5 leading-snug">
                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-600" />
                                            <span>{itemErrors[itemId].expiration_date}</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => clearItemError(itemId, "expiration_date")}
                                            className="text-red-500 hover:text-red-700 p-0.5 rounded cursor-pointer shrink-0"
                                            title="Dismiss error"
                                            aria-label="Dismiss expiration date error"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3.5 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          brandWarningAcknowledgedRef.current = false;
                          onAddPoItem();
                        }}
                        className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 bg-white px-6 py-2.5 text-xs font-black text-neutral-700 hover:border-[#1F4E5A] hover:bg-[#E5EFF1]/40 hover:text-[#1F4E5A] transition cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                        Add Another Medicine to this {formValues.intake_type === "RETURN" ? "Return Batch" : "PO"}
                      </button>
                    </div>
                  </section>

                  {/* Purchase Order Total Valuation Bar */}
                  <div className="rounded-xl border border-[#1F4E5A] bg-[#1F4E5A] p-4 text-white shadow-md">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-neutral-400">
                          Summary
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                            Total Items
                          </p>
                          <p className="text-sm font-black text-white">
                            {formValues.items?.length || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                            Total Units
                          </p>
                          <p className="text-sm font-black text-white">
                            {formatNumber(poTotals.totalQuantity)} units
                          </p>
                        </div>
                        <div className="rounded-lg bg-emerald-950/90 border border-emerald-500/50 px-3.5 py-1.5 text-right">
                          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                            Total Value
                          </p>
                          <p className="text-base font-black text-emerald-300">
                            {formatCurrency(poTotals.totalAmount)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Step 2: Preview of Inputted Stock Data */
                <StockIntakePreview
                  formValues={formValues}
                  medicines={medicines}
                  suppliers={suppliers}
                  facilities={facilities}
                  poTotals={poTotals}
                />
              )}
            </div>
          )}

          {isEditing && (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Left Column: Medicine, Supplier & Traceability */}
              <div className="space-y-4">
                <StockFormSection
                  title="Medicine Identification"
                  description="Medicine and facility are locked to preserve audit history and dispensing traceability."
                >
                  <div className="rounded-xl border border-slate-200 bg-slate-100/80 px-3.5 py-2.5">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
                      Locked Medicine
                    </p>
                    <p className="mt-0.5 text-sm font-black text-[#0d1117]">
                      {getMedicineName(selectedItem)}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-neutral-500">
                      {(formValues.brand_name || selectedItem?.brand_name || selectedItem?.medicine?.brand_name) ? `Brand: ${formValues.brand_name || selectedItem?.brand_name || selectedItem?.medicine?.brand_name} • ` : ""}
                      {selectedItem?.medicine?.dosage ? `Dosage: ${selectedItem.medicine.dosage}` : ""}
                    </p>
                  </div>
                </StockFormSection>

                <StockFormSection
                  title="Supplier & Traceability"
                  description="Vendor source, manufacturer lot number, and PO tracking identifiers."
                >
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field
                        label="Supplier Name"
                        name="supplier_name"
                        placeholder="Enter supplier name (optional)"
                        value={formValues.supplier_name || ""}
                        onChange={onChange}
                      />

                      <Field
                        label="Contact Number"
                        name="supplier_contact"
                        placeholder="e.g. 0912 345 6789"
                        value={formValues.supplier_contact || ""}
                        onChange={onChange}
                      />

                      <Field
                        label="Supplier Address"
                        name="supplier_address"
                        placeholder="Enter supplier address"
                        value={formValues.supplier_address || ""}
                        onChange={onChange}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-w-0">
                      <Field
                        label="Brand"
                        name="brand_name"
                        placeholder="e.g. Biogesic"
                        value={formValues.brand_name || ""}
                        onChange={onChange}
                      />

                      <Field
                        label="Lot No."
                        name="batch_number"
                        placeholder="Enter lot number"
                        value={formValues.batch_number}
                        onChange={onChange}
                        required
                      />

                      <Field
                        label="PO Number"
                        name="po_number"
                        placeholder="e.g. 08-92-26"
                        value={formValues.po_number || ""}
                        onChange={onChange}
                      />
                    </div>
                  </div>
                </StockFormSection>
              </div>

              {/* Right Column: Quantities, Unit Cost & Shelf Life Dates */}
              <div className="space-y-4">
                <StockFormSection
                  title="Quantity and Cost"
                  description="Initial receipt volume and unit purchase price."
                >
                  <div className="space-y-3.5">
                    {/* Row 1: Stock Quantity and Unit Cost side-by-side */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                      <Field
                        label="Stock Quantity"
                        name="quantity"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={formValues.quantity}
                        onChange={onChange}
                        required
                      />

                      <Field
                        label="Unit Cost (₱)"
                        name="unit_cost"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={formValues.unit_cost ?? ""}
                        onChange={onChange}
                      />
                    </div>

                    {/* Estimated Total Lot Value Banner */}
                    {editLotSubtotal !== null && (
                      <div className="flex items-center justify-between rounded-lg bg-emerald-50/70 border border-emerald-200/60 px-3 py-2 text-xs">
                        <span className="font-semibold text-emerald-800">
                          Est. Batch Total Value
                        </span>
                        <span className="font-black text-emerald-700">
                          {formatCurrency(editLotSubtotal)}
                        </span>
                      </div>
                    )}
                  </div>
                </StockFormSection>

                <StockFormSection
                  title="Shelf Life & Expiry"
                  description="Dates drive FEFO release sequence and near-expiry alerts."
                >
                  <div className="space-y-3">
                    <Field
                      label="Date Received"
                      name="date_received"
                      type="date"
                      value={formValues.date_received}
                      onChange={onChange}
                      required
                    />

                    <div>
                      <Field
                        label="Expiration Date"
                        name="expiration_date"
                        type="date"
                        min={getTomorrowDateString()}
                        value={formValues.expiration_date}
                        onChange={onChange}
                        required
                      />
                      <ShelfLifeIndicator expirationDate={formValues.expiration_date} />
                    </div>
                  </div>
                </StockFormSection>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-neutral-100 px-6 py-3.5">
          <button
            type="button"
            onClick={
              isEditing
                ? onCancelEdit
                : step === "preview"
                  ? () => setStep("input")
                  : onClose
            }
            className="h-9.5 rounded-lg bg-neutral-100 px-5 text-sm font-bold text-neutral-700 hover:bg-neutral-200 transition cursor-pointer"
          >
            {isReadOnly
              ? "Close"
              : step === "preview"
                ? "Back to Edit"
                : "Cancel"}
          </button>

          {!isReadOnly && (
            <>
              {mode === "create" && step === "input" ? (
                <button
                  key="btn-step-review"
                  type="button"
                  onClick={handleProceedToPreview}
                  className="btn-primary inline-flex h-9.5 items-center justify-center rounded-lg px-5 text-sm font-bold text-white shadow-xs transition cursor-pointer"
                >
                  Review
                </button>
              ) : (
                <button
                  key="btn-step-confirm"
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={isSaving}
                  className="btn-primary inline-flex h-9.5 items-center gap-2 rounded-lg disabled:opacity-50 px-6 text-sm font-bold text-white shadow-xs transition cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  {isSaving ? "Confirming..." : "Confirm"}
                </button>
              )}
            </>
          )}
        </div>
      </form>
    </ModalShell>
  );
}

function StockIntakePreview({
  formValues,
  medicines = [],
  suppliers = [],
  facilities = [],
  poTotals,
}) {
  const selectedSupplier = suppliers.find((s) => s.id === formValues.supplier_id);
  const formattedDate = formValues.date_received
    ? new Date(formValues.date_received).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  const validItems = (formValues.items || []).filter((item) => item.medicine_id);

  return (
    <div className="space-y-4">
      {/* Notice Banner */}
      <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-2xs">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-neutral-800">
            Purchase Order Intake Preview
          </p>
          <p className="mt-0.5 text-xs text-neutral-600">
            Please verify all entered details and medicine line items below before confirming stock intake into City Health Office inventory.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 1: PO Number */}
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-neutral-100">
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
              Purchase Order
            </span>
            <FileText className="h-3.5 w-3.5 text-neutral-400" />
          </div>
          <div className="mt-2">
            <span className="inline-block rounded-md bg-neutral-100 border border-neutral-200 px-2 py-0.5 font-mono text-sm font-black text-neutral-900">
              {formValues.po_number || "None"}
            </span>
            <p className="mt-1.5 text-[11px] font-medium text-neutral-500">
              Date Received: <strong className="text-neutral-800">{formattedDate}</strong>
            </p>
          </div>
        </div>

        {/* Card 2: Supplier & Destination */}
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-neutral-100">
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
              Supplier &amp; Destination
            </span>
            <Building2 className="h-3.5 w-3.5 text-neutral-400" />
          </div>
          <div className="mt-2">
            <p className="text-sm font-black text-neutral-900 truncate">
              {formValues.supplier_name || "Not specified"}
            </p>
            {formValues.supplier_contact ? (
              <p className="text-[11px] font-medium text-neutral-600 truncate mt-0.5">
                Contact: {formValues.supplier_contact}
              </p>
            ) : null}
            {formValues.supplier_address ? (
              <p className="text-[11px] font-medium text-neutral-600 truncate mt-0.5">
                {formValues.supplier_address}
              </p>
            ) : null}
            <p className="mt-1.5 text-[11px] font-medium text-neutral-500">
              Destination: <strong className="text-neutral-800">City Health Office (CHO)</strong>
            </p>
          </div>
        </div>

        {/* Card 3: Batch Totals */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-emerald-100">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
              Batch Summary
            </span>
            <Package className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <p className="text-base font-black text-neutral-950">
                {formatNumber(poTotals.totalQuantity)} <span className="text-xs font-semibold text-neutral-600">units</span>
              </p>
              <p className="text-[11px] font-semibold text-neutral-500">
                {validItems.length} medicine line item{validItems.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                Total Value
              </span>
              <span className="text-base font-black text-emerald-700">
                {formatCurrency(poTotals.totalAmount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Medicines Preview Table */}
      <div className="rounded-xl border border-neutral-200 bg-white shadow-2xs overflow-hidden">
        <div className="px-4 py-3 bg-[#fbfaf8] border-b border-neutral-200 flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-wider text-neutral-800">
            Inputted Medicines &amp; Batches ({validItems.length})
          </p>
          <span className="text-[11px] font-semibold text-neutral-500">
            Cross-check quantities, lots, and costs before confirming
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200/80 bg-white text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2.5 text-center w-10">#</th>
                <th className="px-3 py-2.5">Medicine Description</th>
                <th className="px-3 py-2.5">Brand</th>
                <th className="px-3 py-2.5">Lot Number</th>
                <th className="px-3 py-2.5 text-right">Quantity</th>
                <th className="px-3 py-2.5 text-center">Min. Threshold</th>
                <th className="px-3 py-2.5 text-right">Unit Cost</th>
                <th className="px-3 py-2.5 text-right">Subtotal</th>
                <th className="px-3 py-2.5 text-center">Expiration Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {validItems.map((item, idx) => {
                const med = medicines.find((m) => m.id === item.medicine_id);
                const qty = Number(item.quantity) || 0;
                const cost = Number(item.unit_cost) || 0;
                const subtotal = qty * cost;

                return (
                  <tr key={item.id || idx} className="hover:bg-neutral-50/60 transition">
                    <td className="px-3 py-2.5 text-center font-bold text-neutral-400">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-bold text-neutral-900">
                        {med?.generic_name || "Unknown Medicine"}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {med?.dosage ? `Dosage: ${med.dosage} • ` : ""}
                        {med?.unit_of_measure ? `Unit: ${med.unit_of_measure}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-neutral-800">
                      {item.brand_name || med?.brand_name || "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono">
                      <span className="inline-block rounded-md bg-neutral-100 border border-neutral-200 px-2 py-0.5 text-[11px] font-bold text-neutral-800">
                        {item.batch_number || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-black text-neutral-900">
                      {formatNumber(qty)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold bg-neutral-100 text-neutral-800 border border-neutral-200">
                        {formatNumber(item.threshold || 0)}
                        {item.is_threshold_custom ? (
                          <span className="text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/60 px-1 rounded">
                            Custom
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold text-[#1F4E5A] bg-[#E5EFF1] border border-[#34769B]/20 px-1 rounded">
                            Auto
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-neutral-700">
                      {formatCurrency(cost)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-black text-emerald-700">
                      {formatCurrency(subtotal)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-medium text-neutral-700">
                      {item.expiration_date ? formatDate(item.expiration_date) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-neutral-200 bg-[#fbfaf8] font-black text-neutral-900">
              <tr>
                <td colSpan={4} className="px-3 py-2.5 uppercase text-[11px] text-neutral-600">
                  Total Batch Intake
                </td>
                <td className="px-3 py-2.5 text-right text-neutral-950">
                  {formatNumber(poTotals.totalQuantity)}
                </td>
                <td className="px-3 py-2.5"></td>
                <td className="px-3 py-2.5 text-right text-[10px] uppercase text-neutral-500">
                  Total Cost
                </td>
                <td className="px-3 py-2.5 text-right text-sm text-emerald-700 bg-emerald-50/50">
                  {formatCurrency(poTotals.totalAmount)}
                </td>
                <td className="px-3 py-2.5"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function SearchableMedicinePicker({
  medicines = [],
  value = "",
  onChange,
  onSelect,
  disabled = false,
  label = "Medicine",
  required = false,
  placeholder = "Search medicine by name, dosage, or brand...",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selectedMedicine = useMemo(() => {
    return medicines.find((m) => m.id === value) || null;
  }, [medicines, value]);

  // Sync displayed search input whenever selectedMedicine changes
  useEffect(() => {
    if (selectedMedicine) {
      setSearchTerm(
        `${selectedMedicine.generic_name}${
          selectedMedicine.dosage ? ` (${selectedMedicine.dosage})` : ""
        }`
      );
    } else {
      setSearchTerm("");
    }
  }, [selectedMedicine]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        if (selectedMedicine) {
          setSearchTerm(
            `${selectedMedicine.generic_name}${
              selectedMedicine.dosage ? ` (${selectedMedicine.dosage})` : ""
            }`
          );
        } else {
          setSearchTerm("");
        }
      }
    };

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        if (selectedMedicine) {
          setSearchTerm(
            `${selectedMedicine.generic_name}${
              selectedMedicine.dosage ? ` (${selectedMedicine.dosage})` : ""
            }`
          );
        } else {
          setSearchTerm("");
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedMedicine]);

  const filteredMedicines = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (selectedMedicine) {
      const selectedLabel = `${selectedMedicine.generic_name}${
        selectedMedicine.dosage ? ` (${selectedMedicine.dosage})` : ""
      }`.toLowerCase();
      if (term === selectedLabel) {
        return medicines;
      }
    }
    if (!term) return medicines;
    return medicines.filter((m) => {
      const generic = (m.generic_name || "").toLowerCase();
      const dosage = (m.dosage || "").toLowerCase();
      const brand = (m.brand_name || "").toLowerCase();
      return generic.includes(term) || dosage.includes(term) || brand.includes(term);
    });
  }, [medicines, searchTerm, selectedMedicine]);

  const handleSelect = (medicine) => {
    if (onSelect) {
      onSelect(medicine.id);
    } else if (onChange) {
      onChange({ target: { name: "medicine_id", value: medicine.id } });
    }
    const medLabel = `${medicine.generic_name}${
      medicine.dosage ? ` (${medicine.dosage})` : ""
    }`;
    setSearchTerm(medLabel);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (onSelect) {
      onSelect("");
    } else if (onChange) {
      onChange({ target: { name: "medicine_id", value: "" } });
    }
    setSearchTerm("");
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    if (!disabled) {
      setIsOpen(true);
      inputRef.current?.select();
    }
  };

  const handleInputChange = (e) => {
    const nextVal = e.target.value;
    setSearchTerm(nextVal);
    if (!isOpen) {
      setIsOpen(true);
    }
    if (!nextVal && value) {
      if (onSelect) {
        onSelect("");
      } else if (onChange) {
        onChange({ target: { name: "medicine_id", value: "" } });
      }
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && filteredMedicines.length > 0) {
        handleSelect(filteredMedicines[0]);
      }
    } else if (e.key === "ArrowDown" && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="block text-xs font-black uppercase tracking-wide text-neutral-600 mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* SINGLE UNIFIED SEARCH INPUT */}
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
          <Search className="h-4 w-4" />
        </span>

        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`h-10 w-full min-w-0 rounded-lg border bg-white pl-9 pr-9 text-sm font-semibold normal-case tracking-normal outline-none transition placeholder:text-neutral-400 disabled:bg-neutral-50 disabled:text-neutral-500 ${
            isOpen
              ? "border-emerald-500 ring-2 ring-emerald-100 text-[#0d1117]"
              : value
              ? "border-emerald-300 text-[#0d1117]"
              : "border-neutral-200 text-neutral-800 hover:border-emerald-400"
          }`}
        />

        {Boolean(searchTerm || value) && !disabled && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
            <button
              type="button"
              onClick={handleClear}
              title="Clear search"
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <input type="hidden" name="medicine_id" value={value} />

      {/* Selected Medicine Info Badge row */}
      {selectedMedicine && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
          {selectedMedicine.brand_name && (
            <span>
              Brand: <strong className="font-semibold text-neutral-700">{selectedMedicine.brand_name}</strong>
            </span>
          )}
          {selectedMedicine.unit_of_measure && (
            <span>
              Unit: <strong className="font-semibold text-neutral-700">{selectedMedicine.unit_of_measure}</strong>
            </span>
          )}
        </div>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-xl">
          <div className="max-h-60 overflow-y-auto divide-y divide-neutral-50 p-1 prds-modal-scrollbar">
            {filteredMedicines.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs font-bold text-neutral-500">No medicines found</p>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  Try typing a different generic name, dosage, or brand
                </p>
              </div>
            ) : (
              filteredMedicines.map((medicine) => {
                const isSelected = medicine.id === value;
                return (
                  <button
                    key={medicine.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(medicine);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition cursor-pointer ${
                      isSelected
                        ? "bg-emerald-50 font-bold text-emerald-900"
                        : "text-neutral-800 hover:bg-neutral-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold text-[#0d1117]">
                          {medicine.generic_name}
                        </span>
                        {medicine.dosage && (
                          <span className="rounded bg-neutral-100 px-1.5 py-0.2 text-[11px] font-semibold text-neutral-700">
                            {medicine.dosage}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                        {medicine.brand_name && <span>Brand: {medicine.brand_name}</span>}
                        {medicine.unit_of_measure && (
                          <span>Unit: {medicine.unit_of_measure}</span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ShelfLifeIndicator({ expirationDate }) {
  if (!expirationDate) return null;

  const targetDate = new Date(expirationDate);
  const now = new Date();
  targetDate.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const diffTime = targetDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-600 border border-red-200">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>Date is in the past — Expired ({Math.abs(diffDays)}d ago)</span>
      </div>
    );
  }

  if (diffDays === 0) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-600 border border-red-200">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>Expires today!</span>
      </div>
    );
  }

  if (diffDays <= 30) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 border border-amber-200">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span>Near Expiry: expires in {diffDays} day{diffDays === 1 ? "" : "s"}</span>
      </div>
    );
  }

  const months = Math.floor(diffDays / 30);
  const years = (diffDays / 365).toFixed(1);
  const durationLabel =
    diffDays > 365
      ? `~${years} years (${diffDays} days)`
      : `~${months} months (${diffDays} days)`;

  return (
    <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      <span>Valid Shelf Life: {durationLabel} remaining</span>
    </div>
  );
}

function StockFormSection({ title, description, children }) {
  return (
    <section className="rounded-xl border border-[#d8dadc] bg-white p-3.5">
      <div className="mb-2.5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
          {title}
        </p>
        {description && (
          <p className="mt-0.5 text-xs font-semibold leading-relaxed text-neutral-500">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function StockDetailsHeader({ item, lots = [] }) {
  if (!item) {
    return null;
  }

  const isExpired = isLotExpired(item);
  const stockStatus = getStockStatus(item);
  const expiryStatus = getExpiryStatus(item);
  const unit = item.medicine?.unit_of_measure ? ` ${item.medicine.unit_of_measure}` : "";

  const allLots = lots?.length ? lots : item?.lots?.length ? item.lots : [item];
  const supplierLots = allLots;

  return (
    <section className="rounded-xl border border-neutral-100 bg-white px-4 py-3.5 shadow-2xs">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            className={`text-[11px] font-black uppercase tracking-[0.14em] ${
              isExpired ? "text-red-700" : "text-emerald-700"
            }`}
          >
            {isExpired ? "Quarantined Expired Stock" : "Medicine Stock Summary"}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-neutral-500">
            {isExpired
              ? "Segregated expired batches. Non-dispensable and pending condemnation disposal."
              : "Supplier procurement stock across registered batches for this facility."}
          </p>
        </div>
        {supplierLots.length > 0 && (
          <span
            className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-black ${
              isExpired ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-800"
            }`}
          >
            {supplierLots.length} procurement batch{supplierLots.length === 1 ? "" : "es"}
          </span>
        )}
      </div>

      <dl className="mt-3.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Physical Stock */}
        <div
          className={`min-w-0 rounded-lg p-2.5 ${
            isExpired ? "bg-red-50/60 ring-1 ring-red-100" : "bg-slate-100"
          }`}
        >
          <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
            {isExpired ? "Expired Stock" : "Total Physical Stock"}
          </dt>
          <dd className="mt-1 flex items-baseline gap-1">
            <span className="text-base font-black text-[#0d1117]">
              {formatNumber(item.quantity)}
            </span>
            {unit && (
              <span className="truncate text-xs font-bold lowercase text-neutral-500">
                {unit}
              </span>
            )}
          </dd>
          <p className="mt-0.5 text-[10px] font-semibold text-neutral-400">
            {isExpired
              ? "Non-dispensable quarantine"
              : `${supplierLots.length} batch${supplierLots.length === 1 ? "" : "es"} in stock`}
          </p>
        </div>

        {/* Card 2: Stock Health / Disposal Status */}
        <div
          className={`min-w-0 rounded-lg p-2.5 ${
            isExpired
              ? "bg-red-50 text-red-700 ring-1 ring-red-200"
              : "bg-slate-100"
          }`}
        >
          <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
            {isExpired ? "Disposal Status" : "Stock Health"}
          </dt>
          <dd className="mt-1">
            {isExpired ? (
              <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-black text-red-700">
                Pending Condemnation
              </span>
            ) : (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-black ${stockStatus.badgeClass}`}
              >
                {stockStatus.label}
              </span>
            )}
          </dd>
          {isExpired && (
            <p className="mt-0.5 text-[10px] font-semibold text-neutral-400">
              Quarantine holding
            </p>
          )}
        </div>

        {/* Card 3: Brand Name */}
        <div className="min-w-0 rounded-lg bg-slate-100 p-2.5">
          <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
            Brand Name
          </dt>
          <dd
            className="mt-1 truncate text-sm font-black text-[#0d1117]"
            title={item.medicine?.brand_name?.trim() || "-"}
          >
            {item.medicine?.brand_name?.trim() || "-"}
          </dd>
          <p
            className="mt-0.5 truncate text-[10px] font-semibold text-neutral-400"
            title={formatMedicineCategories(item.medicine?.categories) || "General"}
          >
            {formatMedicineCategories(item.medicine?.categories) || "General Category"}
          </p>
        </div>

        {/* Card 4: Nearest Expiry */}
        <div className="min-w-0 rounded-lg bg-slate-100 p-2.5">
          <dt className="text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
            {isExpired ? "Date Expired" : "Nearest Expiry"}
          </dt>
          <dd className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-black text-[#0d1117]">
              {formatDate(item.expiration_date)}
            </span>
          </dd>
          <p className="mt-0.5 text-[10px] font-bold">
            {isExpired ? (
              <span className="text-red-600">
                {getExpiredDays(item.expiration_date) > 0
                  ? `${getExpiredDays(item.expiration_date)}d ago`
                  : "Expired today"}
              </span>
            ) : expiryStatus.days !== null && expiryStatus.days <= 0 ? (
              <span className="text-red-600">Expires today</span>
            ) : expiryStatus.days !== null && expiryStatus.days <= 30 ? (
              <span className="text-amber-600">Expiring in {expiryStatus.days}d</span>
            ) : (
              <span className="text-emerald-700">Good shelf life</span>
            )}
          </p>
        </div>
      </dl>
    </section>
  );
}
