import ModalShell from "../../../components/ModalShell";
import LocationPicker from "../LocationPicker";

const facilityTypes = [
  { value: "CHO", label: "City Health Office" },
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
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
    >
      <form
        onSubmit={onSubmit}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-[#CFDDE0] px-6 py-5">
          <div>
            <h3 id="facility-form-modal-title" className="text-xl font-bold text-[#1B2B30]">
              {editingFacility ? "Edit Facility" : "Add Facility"}
            </h3>
            <p className="text-sm font-medium text-[#5B7077]">
              Fill in the required details and locate the facility on the map.
            </p>
          </div>
        </div>

        <div className="prds-modal-scrollbar flex-1 overflow-y-auto bg-[#F4F8F8] px-6 py-5">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <section className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-4 shadow-xs">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#1F4E5A]">
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

            <label className="mt-4 grid gap-2 text-xs font-bold uppercase tracking-wide text-[#5B7077]">
              Address
              <textarea
                name="address"
                value={formValues.address}
                onChange={onChange}
                rows="4"
                required
                className="resize-none rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[#1B2B30] outline-none transition focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
              />
            </label>
          </section>

          <div className="mt-4 rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-4 shadow-xs">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#1F4E5A]">
              Map Location (Optional)
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

        <div className="flex justify-end gap-3 border-t border-[#CFDDE0] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-[#E5EFF1] px-6 text-sm font-bold text-[#1B2B30] hover:bg-[#CFDDE0] transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="h-10 rounded-lg bg-linear-to-r from-[#1F4E5A] to-[#286575] hover:brightness-105 active:scale-[0.99] border border-[#1F4E5A] px-6 text-sm font-bold text-white shadow-xs transition-all disabled:cursor-not-allowed disabled:opacity-60"
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
    <label className="grid gap-2 text-xs font-bold uppercase tracking-wide text-[#5B7077]">
      {label}
      <input
        {...props}
        className="h-10 rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3 text-sm font-semibold normal-case tracking-normal text-[#1B2B30] outline-none transition focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
      />
    </label>
  );
}

function SelectField({ label, options, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-bold uppercase tracking-wide text-[#5B7077]">
      {label}
      <select
        {...props}
        className="h-10 rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3 text-sm font-semibold normal-case tracking-normal text-[#1B2B30] outline-none transition focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
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
