import { FieldIcon, GoogleIcon } from "./ProfileIcons";

export function ProfileField({ icon, label, readOnly, ...props }) {
  return (
    <label className="block rounded-lg bg-[#faf9f7] px-4 py-3">
      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-neutral-500">
        <FieldIcon type={icon} />
        {label}
      </span>
      <input
        {...props}
        readOnly={readOnly}
        className="mt-3 w-full bg-transparent text-sm font-semibold text-black outline-none read-only:cursor-default"
      />
    </label>
  );
}

export function ModalField({ label, readOnly, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
      {label}
      <input
        {...props}
        readOnly={readOnly}
        className="h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 read-only:cursor-default read-only:bg-[#faf9f7] read-only:focus:border-neutral-200 read-only:focus:ring-0"
      />
    </label>
  );
}

export function ReadonlyBlock({ actionLabel, isActionLoading, label, onAction, value }) {
  return (
    <div className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
      {label}
      <div className="rounded-lg border border-neutral-200 bg-[#faf9f7] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-black">
        {value}
      </div>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          disabled={isActionLoading}
          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <GoogleIcon />
          {isActionLoading ? "Opening Google..." : actionLabel}
        </button>
      )}
    </div>
  );
}
