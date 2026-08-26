import { useState } from "react";

import ModalShell from "../../../components/ModalShell";
import {
  CUSTOM_UNIT_VALUE,
  UNIT_OF_MEASURE_OPTIONS,
} from "../medicineUtils";
import { ChevronIcon, PlusIcon, XIcon } from "./MedicineIcons";

export default function MedicineFormModal({
  error,
  fieldErrors,
  formValues,
  isSaving,
  mode,
  onBlur,
  onChange,
  onClose,
  onEdit,
  onSubmit,
  onViewExisting,
  rejectedMedicine,
}) {
  const isReadOnly = mode === "view";
  const title =
    mode === "create" ? "Add New Medicine" : mode === "edit" ? "Edit Medicine" : "Medicine Details";

  const savedUnit = (formValues.unit_of_measure || "").trim().toLowerCase();
  const [showCustomUnit, setShowCustomUnit] = useState(
    savedUnit !== "" && !UNIT_OF_MEASURE_OPTIONS.includes(savedUnit)
  );

  return (
    <ModalShell labelledBy="medicine-modal-title" onClose={onClose} panelClassName="max-w-2xl">
      <form
        onSubmit={onSubmit}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-neutral-100 px-6 py-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
              Medicine Catalog
            </p>
            <h3 id="medicine-modal-title" className="mt-1 text-xl font-black text-black">
              {title}
            </h3>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              {isReadOnly
                ? "Review the registered medicine information."
                : "Use the exact medicine details used in inventory and requests."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close medicine modal"
          >
            <XIcon />
          </button>
        </div>

        <div className="prds-modal-scrollbar flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-semibold text-red-700">{error}</p>
              {rejectedMedicine && (
                <button
                  type="button"
                  onClick={() => onViewExisting(rejectedMedicine.id)}
                  className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-black text-red-800 transition hover:bg-red-200"
                >
                  View existing
                </button>
              )}
            </div>
          )}

          <section className="rounded-xl border border-neutral-100 bg-neutral-50/70 p-4">
            <h4 className="text-sm font-black text-black">Medicine Details</h4>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label="Generic Name"
                name="generic_name"
                value={formValues.generic_name}
                onChange={onChange}
                onBlur={onBlur}
                disabled={isReadOnly}
                error={fieldErrors.generic_name}
                required
              />
              <Field
                label="Brand Name"
                name="brand_name"
                value={formValues.brand_name}
                onChange={onChange}
                onBlur={onBlur}
                disabled={isReadOnly}
                error={fieldErrors.brand_name}
                required
              />
              <UnitField
                error={fieldErrors.unit_of_measure}
                formValues={formValues}
                isReadOnly={isReadOnly}
                onBlur={onBlur}
                onChange={onChange}
                savedUnit={savedUnit}
                setShowCustomUnit={setShowCustomUnit}
                showCustomUnit={showCustomUnit}
              />
              <Field
                label="Dosage"
                name="dosage"
                value={formValues.dosage}
                onChange={onChange}
                onBlur={onBlur}
                disabled={isReadOnly}
                error={fieldErrors.dosage}
                required
              />
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-neutral-100 bg-white p-4">
            <h4 className="text-sm font-black text-black">Pricing</h4>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label="Unit Cost"
                name="unit_cost"
                type="number"
                min="0"
                step="0.01"
                value={formValues.unit_cost}
                onChange={onChange}
                onBlur={onBlur}
                disabled={isReadOnly}
                placeholder="Optional"
                prefix="PHP"
                className="pl-11"
                error={fieldErrors.unit_cost}
                helper="Leave blank if unknown"
              />
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 border-t border-neutral-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-neutral-100 px-6 text-sm font-black text-neutral-700 transition hover:bg-neutral-200"
          >
            {isReadOnly ? "Close" : "Cancel"}
          </button>
          {isReadOnly ? (
            <button
              type="button"
              onClick={onEdit}
              className="h-10 rounded-lg bg-emerald-600 px-6 text-sm font-black text-white transition hover:bg-emerald-700"
            >
              Edit Medicine
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-6 text-sm font-black text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
            >
              <PlusIcon />
              {isSaving ? "Saving..." : mode === "create" ? "Add Medicine" : "Save Changes"}
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  );
}

function UnitField({
  error,
  formValues,
  isReadOnly,
  onBlur,
  onChange,
  savedUnit,
  setShowCustomUnit,
  showCustomUnit,
}) {
  if (isReadOnly) {
    return (
      <Field
        label="Unit"
        name="unit_of_measure"
        value={formValues.unit_of_measure}
        onChange={onChange}
        disabled
        error={error}
        required
      />
    );
  }

  if (showCustomUnit) {
    return (
      <label className="grid gap-1.5 text-xs font-black uppercase tracking-wide text-neutral-600">
        Unit
        <span className="relative block">
          <input
            name="unit_of_measure"
            value={formValues.unit_of_measure}
            onChange={onChange}
            onBlur={onBlur}
            required
            placeholder="Type the unit"
            className={`h-10 w-full rounded-lg border bg-white px-3 pr-20 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:ring-2 ${
              error
                ? "border-red-300 focus:border-red-500 focus:ring-red-100"
                : "border-neutral-200 focus:border-emerald-500 focus:ring-emerald-100"
            }`}
          />
          <button
            type="button"
            onClick={() => {
              setShowCustomUnit(false);
              onChange({ target: { name: "unit_of_measure", value: "" } });
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-neutral-100 px-2 py-1 text-xs font-black text-neutral-600 transition hover:bg-neutral-200"
          >
            Use list
          </button>
        </span>
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      </label>
    );
  }

  return (
    <label className="grid gap-1.5 text-xs font-black uppercase tracking-wide text-neutral-600">
      Unit
      <span className="relative block">
        <select
          name="unit_of_measure"
          value={
            UNIT_OF_MEASURE_OPTIONS.includes(savedUnit)
              ? formValues.unit_of_measure.trim().toLowerCase()
              : ""
          }
          onChange={(event) => {
            if (event.target.value === CUSTOM_UNIT_VALUE) {
              setShowCustomUnit(true);
              onChange({ target: { name: "unit_of_measure", value: "" } });
            } else {
              onChange(event);
            }
          }}
          onBlur={onBlur}
          required
          className={`h-10 w-full appearance-none rounded-lg border bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:ring-2 ${
            error
              ? "border-red-300 focus:border-red-500 focus:ring-red-100"
              : "border-neutral-200 focus:border-emerald-500 focus:ring-emerald-100"
          }`}
        >
          <option value="" disabled>
            Select a unit
          </option>
          {UNIT_OF_MEASURE_OPTIONS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
          <option value={CUSTOM_UNIT_VALUE}>Other...</option>
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
          <ChevronIcon />
        </span>
      </span>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </label>
  );
}

function Field({ label, className = "", prefix, error, helper, ...props }) {
  return (
    <label className="grid gap-1.5 text-xs font-black uppercase tracking-wide text-neutral-600">
      {label}
      <span className="relative block">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-neutral-400">
            {prefix}
          </span>
        )}
        <input
          {...props}
          className={`h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:ring-2 ${
            error
              ? "border-red-300 focus:border-red-500 focus:ring-red-100"
              : "border-neutral-200 focus:border-emerald-500 focus:ring-emerald-100"
          } disabled:bg-neutral-50 disabled:text-neutral-500 ${className}`}
        />
      </span>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      {!error && helper && <p className="text-xs font-medium text-neutral-400">{helper}</p>}
    </label>
  );
}
