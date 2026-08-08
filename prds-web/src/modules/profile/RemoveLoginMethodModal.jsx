import ModalShell from "../../components/ModalShell";

export default function RemoveLoginMethodModal({
  error,
  isRemoving,
  methodLabel,
  onClose,
  onPasswordChange,
  onSubmit,
  password,
}) {
  return (
    <ModalShell labelledBy="remove-login-modal-title" onClose={onClose}>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[460px] overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="border-b border-neutral-100 px-6 py-5">
          <h3 id="remove-login-modal-title" className="text-lg font-black text-black">Remove {methodLabel}</h3>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Enter your current password to verify this account change.
          </p>
        </div>

        <div className="grid gap-4 px-6 py-5">
          {error && (
            <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
            Current Password
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              className="h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              autoComplete="current-password"
              required
            />
          </label>
        </div>

        <div className="flex justify-end gap-3 border-t border-neutral-100 bg-white px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-50 px-5 py-2.5 text-sm font-bold text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isRemoving}
            className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            {isRemoving ? "Removing..." : `Remove ${methodLabel}`}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
