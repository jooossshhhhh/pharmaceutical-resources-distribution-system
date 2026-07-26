import { ModalField } from "./ProfileFields";

export default function PasswordModal({ authEmail, onChange, onClose, onSend, onSubmit, phoneNumber, state }) {
  const updateState = (updates) => onChange((current) => ({ ...current, ...updates }));

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 py-5">
      <form
        onSubmit={state.step === "choose" ? onSend : onSubmit}
        className="w-full max-w-[500px] rounded-xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-black">Change Password</h3>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Verify your identity before setting a new phone-login password.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"
            aria-label="Close change password"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {state.step === "choose" ? (
          <div className="mt-6 grid gap-3">
            <VerificationChoice
              checked={state.method === "phone"}
              disabled={!phoneNumber}
              label="Send OTP to phone"
              value={phoneNumber || "No phone linked"}
              onClick={() => updateState({ method: "phone" })}
            />
            <VerificationChoice
              checked={state.method === "email"}
              disabled={!authEmail}
              label="Send code to Gmail"
              value={authEmail || "No Gmail linked"}
              onClick={() => updateState({ method: "email" })}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            <ModalField
              label="Verification Code"
              value={state.code}
              onChange={(event) => updateState({ code: event.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
              maxLength={6}
            />
            <ModalField
              label="New Password"
              type="password"
              value={state.newPassword}
              onChange={(event) => updateState({ newPassword: event.target.value })}
            />
            <ModalField
              label="Confirm Password"
              type="password"
              value={state.confirmPassword}
              onChange={(event) => updateState({ confirmPassword: event.target.value })}
            />
          </div>
        )}

        {state.error && (
          <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {state.error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-50 px-5 py-2.5 text-sm font-bold text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={state.isSending || state.isVerifying}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {state.step === "choose"
              ? state.isSending ? "Sending..." : "Send Verification"
              : state.isVerifying ? "Saving..." : "Change Password"}
          </button>
        </div>
      </form>
    </div>
  );
}

function VerificationChoice({ checked, disabled, label, onClick, value }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-emerald-500 bg-emerald-50"
          : "border-neutral-200 bg-white hover:bg-neutral-50"
      }`}
    >
      <span>
        <span className="block text-sm font-black text-black">{label}</span>
        <span className="mt-1 block text-sm font-medium text-neutral-500">{value}</span>
      </span>
      <span
        className={`h-4 w-4 rounded-full border ${
          checked ? "border-emerald-600 bg-emerald-600" : "border-neutral-300"
        }`}
      />
    </button>
  );
}
