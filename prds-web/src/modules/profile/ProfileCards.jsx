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
