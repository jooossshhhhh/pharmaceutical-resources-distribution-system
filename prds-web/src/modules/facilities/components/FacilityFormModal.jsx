import ModalShell from "../../../components/ModalShell";
import LocationPicker from "../LocationPicker";

const facilityTypes = [
  { value: "CHO", label: "Central Health Office" },
  { value: "HEALTH_CENTER", label: "Health Center" },
];

const facilityStatuses = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

export function FacilityFormModal({
  editingFacility,
  formValues,
  error,
  isSaving,
  onClose,
  onChange,
  onPinChange,
  onSubmit,
}) {
  return (
    <ModalShell
      labelledBy="facility-form-modal-title"
      onClose={onClose}
      overlayClassName="bg-white/95 backdrop-blur-sm"
    >
      <form
        onSubmit={onSubmit}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-neutral-100 px-6 py-5">
          <div>
            <h3 id="facility-form-modal-title" className="text-xl font-black text-black">
              {editingFacility ? "Edit Facility" : "Add Facility"}
            </h3>
            <p className="text-sm font-medium text-neutral-500">
              Fill in the required details and locate the facility on the map.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close facility form"
          >
            <XIcon />
          </button>
        </div>

        <div className="prds-modal-scrollbar flex-1 overflow-y-auto bg-[#f8faf7] px-6 py-5">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#007a52]">
              Facility Information
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label="Facility Name"
                name="facility_name"
                value={formValues.facility_name}
                onChange={onChange}
                required
              />
              <Field
                label="Facility Code"
                name="facility_code"
                value={formValues.facility_code}
                onChange={onChange}
                required
              />
              <SelectField
                label="Facility Type"
                name="facility_type"
                value={formValues.facility_type}
                onChange={onChange}
                options={facilityTypes}
              />
              <SelectField
                label="Status"
                name="status"
                value={formValues.status}
                onChange={onChange}
                options={facilityStatuses}
              />
            </div>

            <label className="mt-4 grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600">
              Address
              <textarea
                name="address"
                value={formValues.address}
                onChange={onChange}
                rows="4"
                required
                className="resize-none rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </section>

          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-[#007a52]">
              Map Location
            </p>
            <LocationPicker
              value={
                formValues.latitude != null && formValues.longitude != null
                  ? {
                      latitude: formValues.latitude,
                      longitude: formValues.longitude,
                    }
                  : null
              }
              label={formValues.facility_name || null}
              onChange={onPinChange}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-neutral-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-neutral-100 px-6 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="h-10 rounded-lg bg-emerald-600 px-6 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSaving ? "Saving..." : "Save Facility"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600">
      {label}
      <input
        {...props}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

function SelectField({ label, options, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600">
      {label}
      <select
        {...props}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
