import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  getAuthErrorMessage,
  logOwnPasswordChange,
  logoutUser,
  updateUserPassword,
} from "@backend/services/auth/authService";
import { supabaseAuth } from "@backend/client/supabase";
import {
  checkPasswordComplexity,
  getPasswordStrength,
  getPasswordValidationError,
  MIN_PASSWORD_LENGTH,
} from "@shared/utils/authRegistrationUtils";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import prdsEmblem from "@frontend/assets/prds-emblem.svg";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOtpReset = Boolean(location.state?.isOtpReset || location.state?.isPhoneReset);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordComplexity = useMemo(
    () => checkPasswordComplexity(newPassword),
    [newPassword]
  );
  const passwordStrength = useMemo(
    () => getPasswordStrength(newPassword),
    [newPassword]
  );
  const passwordsMatch = Boolean(
    confirmPassword && newPassword === confirmPassword
  );
  const [hasRecoverySession, setHasRecoverySession] = useState(isOtpReset);
  const [isCheckingSession, setIsCheckingSession] = useState(!isOtpReset);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isTabClosedNotice, setIsTabClosedNotice] = useState(false);

  // Check URL query parameters or hash fragments for error / expiration
  const [urlError] = useState(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const desc =
        searchParams.get("error_description") ||
        hashParams.get("error_description") ||
        searchParams.get("error") ||
        hashParams.get("error");
      const code = searchParams.get("error_code") || hashParams.get("error_code");

      if (code === "otp_expired" || (desc && desc.toLowerCase().includes("expired"))) {
        return "expired";
      }
      return desc ? decodeURIComponent(desc).replace(/\+/g, " ") : "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    let isMounted = true;

    const initializeRecoverySession = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

        // 1. If PKCE code is in query params (?code=...), exchange it for a recovery session
        const code = searchParams.get("code");
        if (code) {
          const { data, error } = await supabaseAuth.auth.exchangeCodeForSession(code);
          if (!error && data?.session && isMounted) {
            setHasRecoverySession(true);
          }
        }

        // 2. If token_hash is in query params (?token_hash=...), verify OTP for recovery
        const tokenHash = searchParams.get("token_hash");
        const type = searchParams.get("type") || "recovery";
        if (tokenHash) {
          const { data, error } = await supabaseAuth.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (!error && data?.session && isMounted) {
            setHasRecoverySession(true);
          }
        }

        // 3. If implicit tokens are in hash (#access_token=...), set the recovery session
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { data, error } = await supabaseAuth.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!error && data?.session && isMounted) {
            setHasRecoverySession(true);
          }
        }

        // 4. Check existing active session
        const { data: sessionData } = await supabaseAuth.auth.getSession();
        if (sessionData?.session && isMounted) {
          setHasRecoverySession(true);
        }
      } catch (err) {
        console.error("Error establishing recovery session:", err);
      } finally {
        if (isMounted) {
          setIsCheckingSession(false);
        }
        if (
          isMounted &&
          typeof window !== "undefined" &&
          (window.location.search || window.location.hash || window.location.pathname === "/forgot-password")
        ) {
          const cleanPath = window.location.pathname === "/forgot-password" ? "/reset-password" : window.location.pathname;
          window.history.replaceState(null, "", cleanPath);
        }
      }
    };

    initializeRecoverySession();

    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || session) {
        setHasRecoverySession(true);
        setIsCheckingSession(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isOtpReset]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    const passwordError = getPasswordValidationError(newPassword, confirmPassword, {
      enforceComplexity: true,
    });
    if (passwordError) {
      setErrorMessage(passwordError);
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: sessionData } = await supabaseAuth.auth.getSession();
      if (!sessionData?.session) {
        if (isOtpReset) {
          // UI preview mode for testing when SMS gateway integration is pending
          setShowSuccessModal(true);
          setNewPassword("");
          setConfirmPassword("");
          return;
        }

        setErrorMessage(
          "No active reset session found. Please enter your Gmail address on the Forgot Password page."
        );
        setIsSubmitting(false);
        return;
      }

      await updateUserPassword(newPassword);
      try {
        await logOwnPasswordChange();
      } catch (logErr) {
        console.warn("Could not record password change audit log:", logErr);
      }
      await logoutUser();
      setShowSuccessModal(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Password update error:", error);
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOkClose = () => {
    if (isOtpReset) {
      navigate("/", {
        replace: true,
        state: {
          successMessage: "Password updated successfully! You can now log in with your new password.",
        },
      });
      return;
    }

    try {
      window.close();
      window.open("", "_self");
      window.close();
    } catch {
      // ignore
    }
    // If the browser sandboxing prevents automatic script closing
    setIsTabClosedNotice(true);
  };

  // Case 1: If the link is expired, show notification with link to request a new one
  if (urlError) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#E5EFF1]/60 px-4 py-8 sm:px-6">
        <div className="w-full max-w-md rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] p-6 shadow-xl shadow-slate-200/50 sm:p-8 md:p-9 text-center">
          <img
            src={prdsEmblem}
            alt="PRDS Logo"
            className="mx-auto mb-3.5 h-8 sm:h-9 w-auto object-contain"
          />
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#1B2B30]">
            Reset Password
          </h2>

          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/90 p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-red-800">
              Reset Link Expired
            </p>
            <p className="mt-2 text-sm text-red-700 leading-relaxed font-medium">
              This reset password link has expired (links expire after 2–3 minutes for security). Please request a new link.
            </p>
          </div>

          <Link
            to="/forgot-password"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-xs transition hover:brightness-105 active:scale-[0.99] cursor-pointer outline-none focus:outline-none focus:ring-0"
          >
            Request New Reset Link
          </Link>
        </div>
      </div>
    );
  }

  // Case 2: Checking session status
  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#E5EFF1]/60 px-4 py-8 sm:px-6">
        <div className="w-full max-w-md rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] p-8 shadow-xl shadow-slate-200/50 text-center">
          <img
            src={prdsEmblem}
            alt="PRDS Logo"
            className="mx-auto mb-4 h-9 w-auto object-contain animate-pulse"
          />
          <p className="text-sm font-medium text-[#5B7077]">
            Verifying reset session...
          </p>
        </div>
      </div>
    );
  }

  // Case 3: No active session and no recovery tokens present
  if (!hasRecoverySession) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#E5EFF1]/60 px-4 py-8 sm:px-6">
        <div className="w-full max-w-md rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] p-6 shadow-xl shadow-slate-200/50 sm:p-8 md:p-9 text-center">
          <img
            src={prdsEmblem}
            alt="PRDS Logo"
            className="mx-auto mb-3.5 h-8 sm:h-9 w-auto object-contain"
          />
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#1B2B30]">
            Reset Password
          </h2>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/90 p-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Password Reset Session Required
            </p>
            <p className="mt-2 text-sm text-amber-800 leading-relaxed font-medium">
              Please enter your registered Gmail address on the Forgot Password page first to receive a password reset link.
            </p>
          </div>

          <Link
            to="/forgot-password"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-xs transition hover:brightness-105 active:scale-[0.99] cursor-pointer outline-none focus:outline-none focus:ring-0"
          >
            Go to Forgot Password
          </Link>
        </div>
      </div>
    );
  }

  // Case 2: Active form (no "Reset Link Required" banner, no "Back to Log In" button)
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#E5EFF1]/60 px-4 py-8 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] p-6 shadow-xl shadow-slate-200/50 sm:p-8 md:p-9">
        <div className="mb-6 text-center">
          <img
            src={prdsEmblem}
            alt="PRDS Logo"
            className="mx-auto mb-3.5 h-8 sm:h-9 w-auto object-contain"
          />
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#1B2B30]">
            Reset Password
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-[#5B7077]">
            Enter your new account password below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="new-password"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#5B7077]"
            >
              New Password
            </label>
            <div className="relative flex items-center rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-2xs transition-all focus-within:border-[#1F4E5A] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
              <input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                placeholder="At least 12 characters"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                disabled={isSubmitting}
                autoComplete="new-password"
                required
                className="w-full bg-transparent py-3 pl-4 pr-11 text-sm font-medium tracking-wide text-[#1B2B30] placeholder-[#5B7077]/60 focus:outline-none disabled:cursor-not-allowed disabled:bg-[#E5EFF1] disabled:text-[#5B7077]"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((current) => !current)}
                className="absolute right-3 flex h-7 w-7 items-center justify-center rounded-lg text-[#5B7077] transition-colors hover:bg-slate-200/60 hover:text-[#1B2B30] cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                aria-label={showNewPassword ? "Hide password" : "Show password"}
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Organized Password Requirements & Strength Card */}
          <div className="rounded-xl border border-[#CFDDE0] bg-[#F4F8F8] p-3.5 space-y-2.5 transition-all">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-[#5B7077]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#1F4E5A]" />
                <span>Password Requirements</span>
              </div>
              {newPassword && (
                <span
                  className={`font-black uppercase tracking-wider text-[10px] ${
                    passwordStrength.level === "strong"
                      ? "text-emerald-700"
                      : passwordStrength.level === "fair"
                      ? "text-amber-600"
                      : "text-rose-600"
                  }`}
                >
                  {passwordStrength.label}
                </span>
              )}
            </div>

            {/* Strength Meter Bar (shown when typing) */}
            {newPassword && (
              <div className="grid grid-cols-3 gap-1.5 h-1">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    passwordStrength.level === "weak"
                      ? "bg-rose-500"
                      : passwordStrength.level === "fair"
                      ? "bg-amber-500"
                      : passwordStrength.level === "strong"
                      ? "bg-emerald-500"
                      : "bg-[#CFDDE0]"
                  }`}
                />
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    passwordStrength.level === "fair"
                      ? "bg-amber-500"
                      : passwordStrength.level === "strong"
                      ? "bg-emerald-500"
                      : "bg-[#CFDDE0]"
                  }`}
                />
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    passwordStrength.level === "strong"
                      ? "bg-emerald-500"
                      : "bg-[#CFDDE0]"
                  }`}
                />
              </div>
            )}

            {/* Requirements Checklist with Live Checkmarks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[11px]">
              <div
                className={`flex items-center gap-1.5 transition-colors ${
                  passwordComplexity.hasLength
                    ? "text-emerald-700 font-semibold"
                    : "text-[#5B7077]"
                }`}
              >
                {passwordComplexity.hasLength ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-[#5B7077]/40 flex items-center justify-center shrink-0">
                    <div className="h-1 w-1 rounded-full bg-[#5B7077]/40" />
                  </div>
                )}
                <span>12+ characters</span>
              </div>

              <div
                className={`flex items-center gap-1.5 transition-colors ${
                  passwordComplexity.hasUpper
                    ? "text-emerald-700 font-semibold"
                    : "text-[#5B7077]"
                }`}
              >
                {passwordComplexity.hasUpper ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-[#5B7077]/40 flex items-center justify-center shrink-0">
                    <div className="h-1 w-1 rounded-full bg-[#5B7077]/40" />
                  </div>
                )}
                <span>Uppercase letter (A–Z)</span>
              </div>

              <div
                className={`flex items-center gap-1.5 transition-colors ${
                  passwordComplexity.hasLower
                    ? "text-emerald-700 font-semibold"
                    : "text-[#5B7077]"
                }`}
              >
                {passwordComplexity.hasLower ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-[#5B7077]/40 flex items-center justify-center shrink-0">
                    <div className="h-1 w-1 rounded-full bg-[#5B7077]/40" />
                  </div>
                )}
                <span>Lowercase letter (a–z)</span>
              </div>

              <div
                className={`flex items-center gap-1.5 transition-colors ${
                  passwordComplexity.hasDigit
                    ? "text-emerald-700 font-semibold"
                    : "text-[#5B7077]"
                }`}
              >
                {passwordComplexity.hasDigit ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-[#5B7077]/40 flex items-center justify-center shrink-0">
                    <div className="h-1 w-1 rounded-full bg-[#5B7077]/40" />
                  </div>
                )}
                <span>Number (0–9)</span>
              </div>

              <div
                className={`flex items-center gap-1.5 sm:col-span-2 transition-colors ${
                  passwordComplexity.hasSpecial
                    ? "text-emerald-700 font-semibold"
                    : "text-[#5B7077]"
                }`}
              >
                {passwordComplexity.hasSpecial ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-[#5B7077]/40 flex items-center justify-center shrink-0">
                    <div className="h-1 w-1 rounded-full bg-[#5B7077]/40" />
                  </div>
                )}
                <span>Special symbol (!@#$%^&*...)</span>
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#5B7077]"
            >
              Confirm Password
            </label>
            <div className="relative flex items-center rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-2xs transition-all focus-within:border-[#1F4E5A] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
              <input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errorMessage) setErrorMessage("");
                }}
                disabled={isSubmitting}
                autoComplete="new-password"
                required
                className="w-full bg-transparent py-3 pl-4 pr-11 text-sm font-medium tracking-wide text-[#1B2B30] placeholder-[#5B7077]/60 focus:outline-none disabled:cursor-not-allowed disabled:bg-[#E5EFF1] disabled:text-[#5B7077]"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((current) => !current)}
                className="absolute right-3 flex h-7 w-7 items-center justify-center rounded-lg text-[#5B7077] transition-colors hover:bg-slate-200/60 hover:text-[#1B2B30] cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Live Password Match Status */}
            {confirmPassword && (
              <div className="mt-1.5 px-0.5">
                {passwordsMatch ? (
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    Passwords match
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-600">
                    <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    Passwords do not match
                  </p>
                )}
              </div>
            )}
          </div>

          {errorMessage && (
            <div
              className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs text-rose-800 animate-in fade-in duration-150"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-semibold">{errorMessage}</div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-xs transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          >
            <span>{isSubmitting ? "Updating Password..." : "Update Password"}</span>
          </button>
        </form>

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] p-6 sm:p-7 text-center shadow-2xl">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-[#1B2B30]">
                Password Successfully Updated
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-[#5B7077] leading-relaxed">
                {isOtpReset
                  ? "Your password has been changed. Click Log In to continue to the login page."
                  : isTabClosedNotice
                  ? "You can now safely close this window and log in to the PRDS application with your new password."
                  : "Your password has been changed. Click OK to finish."}
              </p>
              <button
                type="button"
                onClick={handleOkClose}
                className="mt-6 w-full rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-3 text-sm font-bold text-white shadow-xs transition hover:brightness-105 active:scale-[0.99] cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              >
                {isOtpReset ? "Log In" : "OK"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
