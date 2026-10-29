import { useState, useEffect } from "react";
import ModalShell from "../../components/ModalShell";
import { isValidEmail } from "@shared/utils/profileSettingsUtils";

export default function UpdateGmailModal({
  currentEmail,
  isBhw,
  isOpen,
  onClose,
  onInitiate,
  onVerify,
  state,
}) {
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setNewEmail("");
      setCode("");
      setResendCooldown(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  if (!isOpen) return null;

  const isInputStep = state.step === "input";
  const isSameEmail = currentEmail && newEmail.trim().toLowerCase() === currentEmail.trim().toLowerCase();
  const canSend = isValidEmail(newEmail) && !isSameEmail && !state.isSending;
  const canVerify = code.trim().length >= 6 && !state.isVerifying;

  const handleSendCode = async (e) => {
    e?.preventDefault();
    if (!canSend) return;
    const success = await onInitiate(newEmail.trim().toLowerCase());
    if (success) {
      setResendCooldown(60);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || state.isSending) return;
    const success = await onInitiate(newEmail.trim().toLowerCase());
    if (success) {
      setResendCooldown(60);
    }
  };

  const handleVerifySubmit = (e) => {
    e?.preventDefault();
    if (!canVerify) return;
    onVerify({ newEmail: newEmail.trim().toLowerCase(), code: code.trim() });
  };

  return (
    <ModalShell
      labelledBy="update-gmail-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-[500px] rounded-2xl bg-white p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 border border-blue-200 shadow-2xs">
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
            </div>
            <div>
              <h3 id="update-gmail-modal-title" className="text-base font-black text-slate-900">
                {isInputStep ? "Update Primary Gmail" : "Verify New Gmail"}
              </h3>
              <p className="text-xs font-semibold text-slate-500">
                {isInputStep
                  ? "Change your official login and notification email address"
                  : `Enter the verification code sent to ${newEmail}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
            aria-label="Close modal"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step 1: Input New Gmail */}
        {isInputStep && (
          <form onSubmit={handleSendCode} className="mt-5 space-y-4">
            {/* Current Gmail Display */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Current Gmail
              </span>
              <p className="mt-0.5 text-xs font-bold text-slate-900 truncate">
                {currentEmail || "No Gmail recorded"}
              </p>
            </div>

            {/* New Gmail Input */}
            <div className="grid gap-1.5">
              <label className="text-xs font-bold text-slate-700">
                New Gmail Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="e.g. username@gmail.com"
                className="h-10.5 w-full rounded-xl border border-[#d8dadc] bg-white px-3.5 text-xs font-semibold text-slate-900 outline-none transition focus:border-[#007f5f] focus:ring-2 focus:ring-[#007f5f]/15"
              />
              {isSameEmail && (
                <p className="text-xs font-medium text-amber-600">
                  New Gmail must be different from your current Gmail.
                </p>
              )}
            </div>

            {/* Informative Note */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3.5 text-[11px] leading-relaxed text-blue-800">
              <div className="flex items-start gap-2">
                <svg className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <div>
                  <p className="font-bold">Security Verification:</p>
                  <p className="mt-0.5 text-blue-700 font-medium">
                    A 6-digit confirmation code and verification link will be sent to the new email address.
                  </p>
                  {isBhw && (
                    <p className="mt-1 font-bold text-blue-900">
                      City Health Office (CHO) administrators will be automatically notified once your Gmail is updated.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {state.error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
                {state.error}
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSend}
                className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold text-white transition cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {state.isSending ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Sending Code...</span>
                  </>
                ) : (
                  <span>Send Verification Code</span>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Verification Code Entry */}
        {!isInputStep && (
          <form onSubmit={handleVerifySubmit} className="mt-5 space-y-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5">
              <p className="text-xs font-bold text-emerald-900">
                Verification email sent to:
              </p>
              <p className="text-xs font-black text-emerald-800 truncate mt-0.5">
                {newEmail}
              </p>
              <p className="text-[11px] text-emerald-700 mt-1 leading-relaxed">
                Check your inbox for the 6-digit confirmation code. You can also click the verification link in the email.
              </p>
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-bold text-slate-700">
                6-Digit Verification Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                maxLength={8}
                autoFocus
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\s+/g, ""))}
                placeholder="123456"
                className="h-11 w-full rounded-xl border border-[#d8dadc] bg-white px-3.5 text-center font-mono text-base font-black tracking-widest text-slate-900 outline-none transition focus:border-[#007f5f] focus:ring-2 focus:ring-[#007f5f]/15"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || state.isSending}
                className="font-bold text-blue-700 hover:text-blue-900 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : state.isSending
                  ? "Resending..."
                  : "Resend verification code"}
              </button>
            </div>

            {state.error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
                {state.error}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3">
              <button
                type="button"
                onClick={() => state.setStep("input")}
                disabled={state.isVerifying}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canVerify}
                  className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold text-white transition cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {state.isVerifying ? (
                    <>
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Verify & Update</span>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
}
