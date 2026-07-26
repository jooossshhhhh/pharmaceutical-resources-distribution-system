import { useState } from "react";

import { ModalField } from "./ProfileFields";

export default function PasswordModal({ authEmail, onChange, onClose, onSend, onSubmit, phoneNumber, state }) {
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
              Use phone OTP or a Gmail reset link before setting a new password.
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
              label="Send reset link to Gmail"
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
            <PasswordField
              isVisible={showNewPassword}
              label="New Password"
              onToggle={() => setShowNewPassword((current) => !current)}
              value={state.newPassword}
              onChange={(event) => updateState({ newPassword: event.target.value })}
            />
            <PasswordField
              isVisible={showConfirmPassword}
              label="Confirm Password"
              onToggle={() => setShowConfirmPassword((current) => !current)}
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
              ? state.isSending
                ? "Sending..."
                : state.method === "email"
                  ? "Send Reset Link"
                  : "Send Code"
              : state.isVerifying ? "Saving..." : "Change Password"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PasswordField({ isVisible, label, onChange, onToggle, value }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
      {label}
      <span className="relative block">
        <input
          type={isVisible ? "text" : "password"}
          value={value}
          onChange={onChange}
          className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 pr-11 text-sm font-semibold normal-case tracking-normal text-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
          aria-label={isVisible ? "Hide password" : "Show password"}
        >
          <EyeIcon hidden={isVisible} />
        </button>
      </span>
    </label>
  );
}

function EyeIcon({ hidden }) {
  if (hidden) {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.88 4.24A9.77 9.77 0 0 1 12 4c4.48 0 8.27 2.94 9.54 7a9.98 9.98 0 0 1-3.04 4.43M6.23 6.23A9.98 9.98 0 0 0 2.46 11c1.27 4.06 5.06 7 9.54 7a9.96 9.96 0 0 0 4.13-.89" />
      </svg>
    );
  }

  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.46 12C3.73 7.94 7.52 5 12 5s8.27 2.94 9.54 7c-1.27 4.06-5.06 7-9.54 7s-8.27-2.94-9.54-7Z" />
    </svg>
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
