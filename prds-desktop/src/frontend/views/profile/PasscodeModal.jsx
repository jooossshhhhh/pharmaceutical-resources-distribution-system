import { useEffect, useMemo, useState } from "react";
import ModalShell from "../../components/ModalShell";
import {
  getAuthErrorMessage,
  sendEmailOtp,
  sendPhoneOtp,
  setupUserPasscode,
  removeUserPasscode,
  verifyEmailOtp,
  verifyPhoneOtp,
} from "@backend/services/auth/authService";
import { maskPhoneNumber } from "@shared/utils/profileSettingsUtils";

const RESEND_COOLDOWN_SECONDS = 60;

export default function PasscodeModal({
  authEmail = "",
  hasPasscode = false,
  isOpen = false,
  mode = "setup", // 'setup' | 'change' | 'remove'
  onClose,
  onSuccess,
  phoneNumber = "",
}) {
  // Step definitions:
  // For 'change': 'request_change_permission' -> 'verify_change_permission' -> 'enter_new_passcode'
  // For 'setup':  'setup_input' -> 'setup_verify'
  // For 'remove': 'remove_confirm' -> 'remove_verify'
  const [step, setStep] = useState("setup_input");
  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationMethod, setVerificationMethod] = useState(
    authEmail ? "email" : phoneNumber ? "phone" : "email"
  );
  const [error, setError] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // Initialize or reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (mode === "change") {
        setStep("request_change_permission");
      } else if (mode === "remove") {
        setStep("remove_confirm");
      } else {
        setStep("setup_input");
      }
      setPasscode("");
      setConfirmPasscode("");
      setShowPasscode(false);
      setVerificationCode("");
      setError("");
      setIsSendingCode(false);
      setIsSubmitting(false);
      setSecondsRemaining(0);
      setVerificationMethod(authEmail ? "email" : phoneNumber ? "phone" : "email");
    }
  }, [isOpen, mode, phoneNumber, authEmail]);

  // Resend cooldown timer
  useEffect(() => {
    if (secondsRemaining <= 0) return undefined;

    const timer = window.setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [secondsRemaining]);

  const maskedEmail = useMemo(() => {
    if (!authEmail || !authEmail.includes("@")) return authEmail;
    const [user, domain] = authEmail.split("@");
    if (user.length <= 2) return `${user[0]}*@${domain}`;
    return `${user.slice(0, 2)}${"•".repeat(Math.min(user.length - 2, 5))}@${domain}`;
  }, [authEmail]);

  const maskedPhone = useMemo(() => {
    return phoneNumber ? maskPhoneNumber(phoneNumber) : "";
  }, [phoneNumber]);

  if (!isOpen) return null;

  // --- SEND VERIFICATION CODE HELPERS ---
  const sendCodeToSelectedMethod = async () => {
    if (verificationMethod === "phone" && !phoneNumber) {
      throw new Error("No verified phone number linked to this account.");
    }
    if (verificationMethod === "email" && !authEmail) {
      throw new Error("No verified Gmail address linked to this account.");
    }

    if (verificationMethod === "phone") {
      await sendPhoneOtp(phoneNumber, { shouldCreateUser: false });
    } else {
      await sendEmailOtp(authEmail, { shouldCreateUser: false });
    }
  };

  // 1. Change Passcode: Step 1 -> Request verification code to gain permission
  const handleRequestChangePermission = async (event) => {
    if (event) event.preventDefault();
    setError("");
    setIsSendingCode(true);

    try {
      await sendCodeToSelectedMethod();
      setStep("verify_change_permission");
      setSecondsRemaining(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(getAuthErrorMessage(err) || "Failed to send authorization code. Please try again.");
    } finally {
      setIsSendingCode(false);
    }
  };

  // 2. Change Passcode: Step 2 -> Verify code to unlock permission
  const handleVerifyChangePermission = async (event) => {
    if (event) event.preventDefault();
    setError("");

    const cleanCode = (verificationCode || "").trim();
    if (!cleanCode || cleanCode.length < 6 || !/^\d{6,8}$/.test(cleanCode)) {
      setError("Please enter the 6-digit verification code sent to your " + (verificationMethod === "phone" ? "phone" : "Gmail") + ".");
      return;
    }

    setIsSubmitting(true);

    try {
      if (verificationMethod === "phone") {
        await verifyPhoneOtp({ phoneNumber, verificationCode: cleanCode });
      } else {
        await verifyEmailOtp({ email: authEmail, verificationCode: cleanCode });
      }

      // Permission granted! Proceed to entering the new passcode
      setVerificationCode("");
      setError("");
      setStep("enter_new_passcode");
    } catch (err) {
      setError(getAuthErrorMessage(err) || "Verification failed. Check the 6-digit code and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Change Passcode: Step 3 -> Save New Passcode once permission granted
  const handleSaveChangedPasscode = async (event) => {
    if (event) event.preventDefault();
    setError("");

    if (!passcode || passcode.length !== 6 || !/^\d{6}$/.test(passcode)) {
      setError("Passcode must be exactly 6 numeric digits.");
      return;
    }
    if (passcode !== confirmPasscode) {
      setError("The confirmed passcode does not match.");
      return;
    }
    if (/^(.)\1{5}$/.test(passcode)) {
      setError("Please choose a more secure passcode (avoid repeating digits like 111111).");
      return;
    }

    setIsSubmitting(true);

    try {
      await setupUserPasscode({ passcode });
      onSuccess?.("Your 6-digit Quick Passcode has been updated successfully.", true);
      onClose();
    } catch (err) {
      setError(getAuthErrorMessage(err) || "Failed to update passcode. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Setup Passcode: Step 1 -> Enter passcode inputs & request OTP
  const handleSetupSendCode = async (event) => {
    if (event) event.preventDefault();
    setError("");

    if (!passcode || passcode.length !== 6 || !/^\d{6}$/.test(passcode)) {
      setError("Passcode must be exactly 6 numeric digits.");
      return;
    }
    if (passcode !== confirmPasscode) {
      setError("The confirmed passcode does not match.");
      return;
    }
    if (/^(.)\1{5}$/.test(passcode)) {
      setError("Please choose a more secure passcode (avoid repeating digits like 111111).");
      return;
    }

    setIsSendingCode(true);

    try {
      await sendCodeToSelectedMethod();
      setStep("setup_verify");
      setSecondsRemaining(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(getAuthErrorMessage(err) || "Failed to send verification code. Please try again.");
    } finally {
      setIsSendingCode(false);
    }
  };

  // 5. Setup Passcode: Step 2 -> Verify OTP and save passcode
  const handleSetupConfirmAndSave = async (event) => {
    if (event) event.preventDefault();
    setError("");

    const cleanCode = (verificationCode || "").trim();
    if (!cleanCode || cleanCode.length < 6 || !/^\d{6,8}$/.test(cleanCode)) {
      setError("Please enter the 6-digit verification code sent to your " + (verificationMethod === "phone" ? "phone" : "Gmail") + ".");
      return;
    }

    setIsSubmitting(true);

    try {
      if (verificationMethod === "phone") {
        await verifyPhoneOtp({ phoneNumber, verificationCode: cleanCode });
      } else {
        await verifyEmailOtp({ email: authEmail, verificationCode: cleanCode });
      }

      await setupUserPasscode({ passcode });
      onSuccess?.(
        "Your 6-digit Quick Passcode has been configured successfully! You can now use it on the login screen.",
        true
      );
      onClose();
    } catch (err) {
      setError(getAuthErrorMessage(err) || "Verification failed. Check the 6-digit code and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 6. Remove Passcode: Step 1 -> Request code
  const handleRemoveSendCode = async (event) => {
    if (event) event.preventDefault();
    setError("");
    setIsSendingCode(true);

    try {
      await sendCodeToSelectedMethod();
      setStep("remove_verify");
      setSecondsRemaining(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(getAuthErrorMessage(err) || "Failed to send authorization code. Please try again.");
    } finally {
      setIsSendingCode(false);
    }
  };

  // 7. Remove Passcode: Step 2 -> Verify OTP and remove passcode
  const handleRemoveConfirm = async (event) => {
    if (event) event.preventDefault();
    setError("");

    const cleanCode = (verificationCode || "").trim();
    if (!cleanCode || cleanCode.length < 6 || !/^\d{6,8}$/.test(cleanCode)) {
      setError("Please enter the 6-digit verification code sent to your " + (verificationMethod === "phone" ? "phone" : "Gmail") + ".");
      return;
    }

    setIsSubmitting(true);

    try {
      if (verificationMethod === "phone") {
        await verifyPhoneOtp({ phoneNumber, verificationCode: cleanCode });
      } else {
        await verifyEmailOtp({ email: authEmail, verificationCode: cleanCode });
      }

      await removeUserPasscode();
      onSuccess?.("6-digit Quick Passcode has been removed from your account.", false);
      onClose();
    } catch (err) {
      setError(getAuthErrorMessage(err) || "Verification failed. Check the 6-digit code and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resend code handler
  const handleResendCode = async () => {
    if (secondsRemaining > 0 || isSendingCode) return;
    setError("");
    setIsSendingCode(true);

    try {
      await sendCodeToSelectedMethod();
      setSecondsRemaining(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(getAuthErrorMessage(err) || "Failed to resend code.");
    } finally {
      setIsSendingCode(false);
    }
  };

  // Determine Title and Subtitle dynamically
  const headerInfo = (() => {
    if (mode === "remove") {
      return {
        title: "Remove 6-Digit Passcode",
        subtitle: step === "remove_confirm"
          ? "Verify your identity via OTP to disable quick passcode sign-in."
          : `Enter the 6-digit code sent to your ${verificationMethod === "phone" ? "mobile number" : "Gmail"}.`,
      };
    }
    if (mode === "change") {
      if (step === "request_change_permission") {
        return {
          title: "Change 6-Digit Passcode",
          subtitle: "Step 1 of 2: Verify your identity to authorize changing your passcode.",
        };
      }
      if (step === "verify_change_permission") {
        return {
          title: "Authorize Passcode Change",
          subtitle: `Step 1 of 2: Enter the 6-digit code sent to your ${verificationMethod === "phone" ? "mobile number" : "Gmail"}.`,
        };
      }
      return {
        title: "Set New 6-Digit Passcode",
        subtitle: "Step 2 of 2: Enter and confirm your new 6-digit PIN.",
      };
    }
    // mode === 'setup'
    return {
      title: "Set Up 6-Digit Passcode",
      subtitle: step === "setup_input"
        ? "Create a 6-digit PIN for rapid and secure terminal sign-in."
        : `Enter the 6-digit authorization code sent to your ${verificationMethod === "phone" ? "mobile number" : "Gmail"}.`,
    };
  })();

  return (
    <ModalShell
      labelledBy="passcode-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-[480px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all">
        {/* Header Banner */}
        <div className="border-b border-slate-100 bg-linear-to-r from-slate-50 to-white px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-xs">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div>
                <h3 id="passcode-modal-title" className="text-base font-black text-slate-900">
                  {headerInfo.title}
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {headerInfo.subtitle}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* FLOW 1: CHANGE PASSCODE - Step 1: Request Permission (Send OTP) */}
        {/* ------------------------------------------------------------- */}
        {mode === "change" && step === "request_change_permission" && (
          <form onSubmit={handleRequestChangePermission} className="p-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white mt-0.5">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div className="text-xs text-emerald-950">
                  <p className="font-bold">Identity Verification Required</p>
                  <p className="mt-1 text-emerald-800">
                    To protect your PRDS account and clinic terminal, you must verify your identity before gaining permission to change your 6-digit passcode.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600">
                Send 6-Digit Authorization Code To:
              </label>
              <div className="grid gap-2">
                {authEmail && (
                  <label
                    className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition ${
                      verificationMethod === "email"
                        ? "border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-600"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="changeVerificationMethod"
                        value="email"
                        checked={verificationMethod === "email"}
                        onChange={() => setVerificationMethod("email")}
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">Gmail Verification Code</div>
                        <div className="text-[11px] font-medium text-slate-500">{maskedEmail}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full">
                      Primary
                    </span>
                  </label>
                )}

                {phoneNumber && (
                  <label
                    className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition ${
                      verificationMethod === "phone"
                        ? "border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-600"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="changeVerificationMethod"
                        value="phone"
                        checked={verificationMethod === "phone"}
                        onChange={() => setVerificationMethod("phone")}
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">Phone SMS OTP</div>
                        <div className="text-[11px] font-medium text-slate-500">{maskedPhone}</div>
                      </div>
                    </div>
                  </label>
                )}
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSendingCode}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {isSendingCode ? "Sending Code..." : "Send Verification Code"}
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* FLOW 1: CHANGE PASSCODE - Step 2: Verify Code to Unlock Permission */}
        {/* ------------------------------------------------------------- */}
        {mode === "change" && step === "verify_change_permission" && (
          <form onSubmit={handleVerifyChangePermission} className="p-6">
            <div className="text-center">
              <p className="text-xs font-medium text-slate-600">
                We sent a 6-digit authorization code to:
              </p>
              <p className="mt-1 text-sm font-black text-slate-900">
                {verificationMethod === "phone" ? maskedPhone : maskedEmail}
              </p>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-center text-xs font-bold uppercase tracking-wider text-slate-600">
                Enter 6-Digit Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                placeholder="••••••"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                onPaste={(event) => {
                  event.preventDefault();
                  const pasted = event.clipboardData.getData("text") || "";
                  setVerificationCode(pasted.replace(/\D/g, "").slice(0, 8));
                }}
                className="h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-xl md:text-2xl font-black tracking-[0.35em] text-slate-900 shadow-xs focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition"
                autoFocus
                required
              />
              <p className="mt-1.5 text-center text-[11px] font-medium text-slate-500">
                Enter the 6-digit code received in your inbox
              </p>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-500">
                {secondsRemaining > 0 ? (
                  `Resend code in ${secondsRemaining}s`
                ) : (
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isSendingCode}
                    className="font-bold text-emerald-700 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Resend Code
                  </button>
                )}
              </span>
              <button
                type="button"
                onClick={() => setStep("request_change_permission")}
                className="font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
              >
                Change Channel
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || verificationCode.length < 6}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? "Verifying..." : "Verify & Grant Permission"}
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* FLOW 1: CHANGE PASSCODE - Step 3: Enter & Save New Passcode */}
        {/* ------------------------------------------------------------- */}
        {mode === "change" && step === "enter_new_passcode" && (
          <form onSubmit={handleSaveChangedPasscode} className="p-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 mb-4">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Identity Verified! Permission granted to set a new passcode.</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600">
                  <span>New 6-Digit Passcode</span>
                  <button
                    type="button"
                    onClick={() => setShowPasscode((prev) => !prev)}
                    className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    {showPasscode ? "Hide digits" : "Show digits"}
                  </button>
                </label>
                <div className="relative">
                  <input
                    type={showPasscode ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••••"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-2xl font-black tracking-[0.6em] text-slate-900 shadow-xs focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition"
                    autoFocus
                    required
                  />
                </div>
                <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                  Only numbers are permitted. Must be exactly 6 digits.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Confirm 6-Digit Passcode
                </label>
                <input
                  type={showPasscode ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-2xl font-black tracking-[0.6em] text-slate-900 shadow-xs focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || passcode.length !== 6 || confirmPasscode.length !== 6}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? "Saving Passcode..." : "Save New Passcode"}
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* FLOW 2: SET UP PASSCODE - Step 1: Input Passcode & Channel */}
        {/* ------------------------------------------------------------- */}
        {mode === "setup" && step === "setup_input" && (
          <form onSubmit={handleSetupSendCode} className="p-6">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600">
                  <span>6-Digit Passcode</span>
                  <button
                    type="button"
                    onClick={() => setShowPasscode((prev) => !prev)}
                    className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    {showPasscode ? "Hide digits" : "Show digits"}
                  </button>
                </label>
                <div className="relative">
                  <input
                    type={showPasscode ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••••"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-2xl font-black tracking-[0.6em] text-slate-900 shadow-xs focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition"
                    autoFocus
                    required
                  />
                </div>
                <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                  Only numbers are permitted. Must be exactly 6 digits.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Confirm 6-Digit Passcode
                </label>
                <input
                  type={showPasscode ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-2xl font-black tracking-[0.6em] text-slate-900 shadow-xs focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition"
                  required
                />
              </div>

              <div className="pt-2">
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Send Authorization Code To:
                </label>
                <div className="grid gap-2">
                  {authEmail && (
                    <label
                      className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition ${
                        verificationMethod === "email"
                          ? "border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-600"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="setupVerificationMethod"
                          value="email"
                          checked={verificationMethod === "email"}
                          onChange={() => setVerificationMethod("email")}
                          className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-900">Gmail Verification Code</div>
                          <div className="text-[11px] font-medium text-slate-500">{maskedEmail}</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full">
                        Primary
                      </span>
                    </label>
                  )}

                  {phoneNumber && (
                    <label
                      className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition ${
                        verificationMethod === "phone"
                          ? "border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-600"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="setupVerificationMethod"
                          value="phone"
                          checked={verificationMethod === "phone"}
                          onChange={() => setVerificationMethod("phone")}
                          className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-900">Phone SMS OTP</div>
                          <div className="text-[11px] font-medium text-slate-500">{maskedPhone}</div>
                        </div>
                      </div>
                    </label>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSendingCode || passcode.length !== 6 || confirmPasscode.length !== 6}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {isSendingCode ? "Sending Code..." : "Continue to Verification"}
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* FLOW 2: SET UP PASSCODE - Step 2: Verify Code and Save */}
        {/* ------------------------------------------------------------- */}
        {mode === "setup" && step === "setup_verify" && (
          <form onSubmit={handleSetupConfirmAndSave} className="p-6">
            <div className="text-center">
              <p className="text-xs font-medium text-slate-600">
                We sent a 6-digit authorization code to:
              </p>
              <p className="mt-1 text-sm font-black text-slate-900">
                {verificationMethod === "phone" ? maskedPhone : maskedEmail}
              </p>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-center text-xs font-bold uppercase tracking-wider text-slate-600">
                Enter 6-Digit Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                placeholder="••••••"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                onPaste={(event) => {
                  event.preventDefault();
                  const pasted = event.clipboardData.getData("text") || "";
                  setVerificationCode(pasted.replace(/\D/g, "").slice(0, 8));
                }}
                className="h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-xl md:text-2xl font-black tracking-[0.35em] text-slate-900 shadow-xs focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition"
                autoFocus
                required
              />
              <p className="mt-1.5 text-center text-[11px] font-medium text-slate-500">
                Enter the 6-digit code received in your inbox
              </p>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-500">
                {secondsRemaining > 0 ? (
                  `Resend code in ${secondsRemaining}s`
                ) : (
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isSendingCode}
                    className="font-bold text-emerald-700 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Resend Code
                  </button>
                )}
              </span>
              <button
                type="button"
                onClick={() => setStep("setup_input")}
                className="font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
              >
                Back to Edit
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || verificationCode.length < 6}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? "Configuring..." : "Confirm & Save Passcode"}
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* FLOW 3: REMOVE PASSCODE - Step 1: Warning and Channel */}
        {/* ------------------------------------------------------------- */}
        {mode === "remove" && step === "remove_confirm" && (
          <form onSubmit={handleRemoveSendCode} className="p-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 mb-4">
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-xs text-amber-800">
                  <p className="font-bold">Disable Quick Passcode Sign In?</p>
                  <p className="mt-1 text-amber-700">
                    Removing your passcode means you will need to sign in using your account password or OTP verification.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600">
                Authorize Removal Via:
              </label>
              <div className="grid gap-2">
                {authEmail && (
                  <label
                    className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition ${
                      verificationMethod === "email"
                        ? "border-red-500 bg-red-50/50 shadow-xs ring-1 ring-red-500"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="removeVerificationMethod"
                        value="email"
                        checked={verificationMethod === "email"}
                        onChange={() => setVerificationMethod("email")}
                        className="h-4 w-4 text-red-600 focus:ring-red-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">Gmail Verification Code</div>
                        <div className="text-[11px] font-medium text-slate-500">{maskedEmail}</div>
                      </div>
                    </div>
                  </label>
                )}

                {phoneNumber && (
                  <label
                    className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition ${
                      verificationMethod === "phone"
                        ? "border-red-500 bg-red-50/50 shadow-xs ring-1 ring-red-500"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="removeVerificationMethod"
                        value="phone"
                        checked={verificationMethod === "phone"}
                        onChange={() => setVerificationMethod("phone")}
                        className="h-4 w-4 text-red-600 focus:ring-red-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">Phone SMS OTP</div>
                        <div className="text-[11px] font-medium text-slate-500">{maskedPhone}</div>
                      </div>
                    </div>
                  </label>
                )}
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSendingCode}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {isSendingCode ? "Sending Code..." : "Send Verification Code"}
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* FLOW 3: REMOVE PASSCODE - Step 2: Verify Code and Remove */}
        {/* ------------------------------------------------------------- */}
        {mode === "remove" && step === "remove_verify" && (
          <form onSubmit={handleRemoveConfirm} className="p-6">
            <div className="text-center">
              <p className="text-xs font-medium text-slate-600">
                We sent a 6-digit authorization code to:
              </p>
              <p className="mt-1 text-sm font-black text-slate-900">
                {verificationMethod === "phone" ? maskedPhone : maskedEmail}
              </p>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-center text-xs font-bold uppercase tracking-wider text-slate-600">
                Enter 6-Digit Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                placeholder="••••••"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                onPaste={(event) => {
                  event.preventDefault();
                  const pasted = event.clipboardData.getData("text") || "";
                  setVerificationCode(pasted.replace(/\D/g, "").slice(0, 8));
                }}
                className="h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-xl md:text-2xl font-black tracking-[0.35em] text-slate-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100 transition"
                autoFocus
                required
              />
              <p className="mt-1.5 text-center text-[11px] font-medium text-slate-500">
                Enter the 6-digit code received in your inbox
              </p>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-500">
                {secondsRemaining > 0 ? (
                  `Resend code in ${secondsRemaining}s`
                ) : (
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isSendingCode}
                    className="font-bold text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Resend Code
                  </button>
                )}
              </span>
              <button
                type="button"
                onClick={() => setStep("remove_confirm")}
                className="font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
              >
                Back
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || verificationCode.length < 6}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? "Removing..." : "Confirm & Remove Passcode"}
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
}
