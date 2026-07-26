import { FieldIcon } from "./ProfileIcons";
import { getLoginMethodStatusLabel } from "./profileSettingsUtils";

export function LoginMethod({ active, canRemove = false, isRemoving = false, label, onRemove, value }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-[#faf9f7] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-black text-black">{label}</p>
        <p className="truncate text-sm font-medium text-neutral-500">{value}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={isRemoving}
            className="rounded-full px-3 py-1 text-xs font-black text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRemoving ? "Removing..." : "Remove"}
          </button>
        )}
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {getLoginMethodStatusLabel(active)}
        </span>
      </div>
    </div>
  );
}

export function PreferenceRow({ icon, label, description, enabled }) {
  return (
    <div className="flex items-center justify-between gap-5 py-4">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#faf9f7]">
          <FieldIcon type={icon} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-black">{label}</p>
          <p className="truncate text-sm font-medium text-neutral-500">{description}</p>
        </div>
      </div>
      <button
        type="button"
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          enabled ? "bg-emerald-600" : "bg-neutral-200"
        }`}
        aria-pressed={enabled}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
            enabled ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}
