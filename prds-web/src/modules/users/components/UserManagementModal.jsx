import ModalShell from "../../../components/ModalShell";
import {
  formatDate,
  getDisplayEmail,
  getDisplayPhone,
  getFullName,
  getInitials,
  getRoleLabel,
  roleOptions,
  statusOptions,
} from "../userManagementUtils";
import { UserStatusBadge } from "./UserManagementBadges";

export default function UserManagementModal({
  error,
  facilities,
  formValues,
  isSaving,
  onChange,
  onClose,
  onSave,
  user,
}) {
  return (
    <ModalShell
      labelledBy="user-modal-title"
      onClose={onClose}
      overlayClassName="bg-black/40 backdrop-blur-sm"
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl shadow-neutral-950/25">
        <div className="border-b border-[#6be9c2]/40 bg-[#f2fff9] px-5 py-5">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#00a36c] text-base font-black text-white">
              {getInitials(user)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#007f5f]">
                Manage Account
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h3 id="user-modal-title" className="truncate text-2xl font-black text-black">
                  {getFullName(user)}
                </h3>
                <UserStatusBadge status={user.status} />
              </div>
              <p className="mt-1 text-sm font-semibold text-neutral-600">
                {getRoleLabel(user.role)} · {getDisplayEmail(user) || getDisplayPhone(user) || "No login method shown"}
              </p>
            </div>
          </div>
        </div>

        <div className="prds-modal-scrollbar flex-1 overflow-y-auto bg-[#f8f9ff] p-5">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}

          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">Profile Information</p>
                <h4 className="mt-1 text-sm font-black text-black">Read-only identity and contact details</h4>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ReadOnlyField label="First Name" value={user.first_name} />
              <ReadOnlyField label="Last Name" value={user.last_name} />
              <ReadOnlyField label="Email" value={getDisplayEmail(user)} emptyLabel="No email linked" />
              <ReadOnlyField label="Phone" value={getDisplayPhone(user)} emptyLabel="No phone linked" />
              <ReadOnlyField label="Approved At" value={formatDate(user.approved_at)} />
              <ReadOnlyField label="Last Updated" value={formatDate(user.updated_at)} />
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">Account Controls</p>
            <h4 className="mt-1 text-sm font-black text-black">Role, facility, and access status</h4>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SelectField label="Role" name="role" value={formValues.role} onChange={onChange} options={roleOptions} />
              <SelectField label="Status" name="status" value={formValues.status} onChange={onChange} options={statusOptions} />
              <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600 sm:col-span-2">
                Facility
                <select
                  name="facility_id"
                  value={formValues.facility_id}
                  onChange={onChange}
                  className="h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/30"
                >
                  <option value="">No facility assigned</option>
                  {facilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.facility_name} ({facility.facility_code})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-100 bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-neutral-100 px-6 text-sm font-bold text-neutral-700 transition hover:bg-neutral-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="h-10 rounded-lg bg-black px-6 text-sm font-black text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ReadOnlyField({ emptyLabel = "Not set", label, value }) {
  return (
    <div className="rounded-lg bg-neutral-50 p-4 ring-1 ring-neutral-100">
      <p className="text-xs font-black uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 min-h-5 break-words text-sm font-semibold text-black">{value || emptyLabel}</p>
    </div>
  );
}

function SelectField({ label, options, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600">
      {label}
      <select
        {...props}
        className="h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/30"
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
