import ModalShell from "../../components/ModalShell";

export default function PasswordModal({
  authEmail,
  onClose,
  onSend,
  state,
}) {
  return (
    <ModalShell
      labelledBy="password-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
    >
      <form
        onSubmit={onSend}
        className="w-full max-w-[480px] rounded-xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="password-modal-title" className="text-lg font-black text-black">Reset Password</h3>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Send a secure password reset link to your verified Gmail address.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 cursor-pointer"
            aria-label="Close change password"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50/70 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Destination Gmail
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {authEmail || "No Gmail linked"}
          </p>
          <p className="mt-2 text-xs text-slate-500 leading-relaxed">
            A password reset link will be sent to this Gmail address. Click the link to open the password reset page and set your new password.
          </p>
        </div>

        {state.error && (
          <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {state.error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-50 px-5 py-2.5 text-sm font-bold text-neutral-700 hover:bg-neutral-100 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={state.isSending || !authEmail}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300 cursor-pointer"
          >
            {state.isSending ? "Sending Link..." : "Send Reset Link"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
