import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock, RotateCcw } from "lucide-react";

import {
  getAuthErrorMessage,
  logoutUser,
  sendEmailOtp,
  verifyEmailOtp,
} from "@backend/services/auth/authService";
import {
  clearPendingOtp,
  getPendingOtp,
  PHONE_OTP_PURPOSES,
} from "@backend/services/auth/pendingPhoneOtpStore";
import {
  getProfileById,
} from "@backend/services/auth/profileService";
import citySeal from "@frontend/assets/city-of-naga-seal.png";
import nagaGarbo from "@frontend/assets/naga-atong-garbo.png";
import prdsLogo from "@frontend/assets/prds-logo-main.svg";
import { getLoginAccountStatus } from "@shared/utils/authRegistrationUtils.js";

const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 120;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 3;

function maskEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return email || "";
  }
  const [username, domain] = email.split("@");
  if (username.length <= 2) {
    return `${username[0]}***@${domain}`;
  }
  const visiblePrefix = username.slice(0, 2);
  const maskedLength = Math.max(username.length - 2, 3);
  return `${visiblePrefix}${"*".repeat(maskedLength)}@${domain}`;
}

export default function OTPVerification() {
  const navigate = useNavigate();
  const [pendingOtp] = useState(() => getPendingOtp());
  const [otpDigits, setOtpDigits] = useState(() => Array(OTP_LENGTH).fill(""));
  const inputRefs = useRef([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [resendNotice, setResendNotice] = useState("");
  const [showPendingApprovalModal, setShowPendingApprovalModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(OTP_EXPIRY_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const verificationCode = otpDigits.join("");

  useEffect(() => {
    if (!pendingOtp) {
      navigate("/", { replace: true });
    }
  }, [navigate, pendingOtp]);

  useEffect(() => {
    if (pendingOtp) {
      const timer = setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [pendingOtp]);

  useEffect(() => {
    if (!pendingOtp || secondsRemaining <= 0) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setSecondsRemaining((currentSeconds) =>
        currentSeconds > 0 ? currentSeconds - 1 : 0
      );
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [pendingOtp, secondsRemaining]);

  useEffect(() => {
    if (resendCooldown <= 0) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setResendCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [resendCooldown]);

  if (!pendingOtp) {
    return null;
  }

  const {
    email,
    purpose,
  } = pendingOtp;

  const isPasswordResetOtp = purpose === PHONE_OTP_PURPOSES.PASSWORD_RESET;
  const isOtpExpired = secondsRemaining <= 0;
  const canResend =
    resendCooldown <= 0 || isOtpExpired || failedAttempts >= MAX_OTP_ATTEMPTS;
  const formattedTimeRemaining = `${String(
    Math.floor(secondsRemaining / 60)
  ).padStart(2, "0")}:${String(secondsRemaining % 60).padStart(2, "0")}`;

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setResendNotice("");

    if (failedAttempts >= MAX_OTP_ATTEMPTS) {
      setErrorMessage("Maximum verification attempts reached (3/3). This code has been invalidated. Please request a new code.");
      return;
    }

    if (isOtpExpired) {
      setErrorMessage("Verification code has expired. Please request a new code.");
      return;
    }

    const cleanCode = verificationCode.trim();
    if (cleanCode.length !== OTP_LENGTH) {
      setErrorMessage(`Please enter the complete ${OTP_LENGTH}-digit verification code.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const { user } = await verifyEmailOtp({
        email,
        verificationCode: cleanCode,
      });

      if (!user) {
        throw new Error("Unable to verify Gmail code. Please try again.");
      }

      if (isPasswordResetOtp) {
        clearPendingOtp();
        navigate("/reset-password", {
          replace: true,
          state: { isPhoneReset: false, identifier: email },
        });
        return;
      }

      const profile = await getProfileById(user.id);
      clearPendingOtp();

      const accountStatus = getLoginAccountStatus(profile);
      if (accountStatus === "pending") {
        await logoutUser();
        clearPendingOtp();
        setShowPendingApprovalModal(true);
        return;
      }

      if (accountStatus === "unregistered") {
        await logoutUser();
        navigate("/", {
          replace: true,
          state: {
            accountAccessStatus: accountStatus,
          },
        });
        return;
      }

      if (profile.status === "DEACTIVATED") {
        await logoutUser();
        navigate("/", {
          replace: true,
          state: {
            noticeMessage:
              "This account is deactivated. Please contact a PRDS administrator for assistance.",
          },
        });
        return;
      }

      navigate("/dashboard", { replace: true });
      return;
    } catch (error) {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      if (nextAttempts >= MAX_OTP_ATTEMPTS) {
        setErrorMessage("Maximum verification attempts reached (3/3). This code has been invalidated. Please request a new code.");
      } else {
        const errorMsg = getAuthErrorMessage(error);
        setErrorMessage(`${errorMsg} (${nextAttempts}/${MAX_OTP_ATTEMPTS} attempts used)`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDigitChange = (index, value) => {
    const clean = value.replace(/\D/g, "");

    if (clean.length > 1) {
      const chars = clean.slice(0, OTP_LENGTH).split("");
      const nextDigits = [...otpDigits];
      chars.forEach((char, i) => {
        if (index + i < OTP_LENGTH) {
          nextDigits[index + i] = char;
        }
      });
      setOtpDigits(nextDigits);
      setErrorMessage("");
      const nextFocus = Math.min(index + chars.length, OTP_LENGTH - 1);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    const nextDigits = [...otpDigits];
    nextDigits[index] = clean;
    setOtpDigits(nextDigits);
    setErrorMessage("");

    if (clean && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
      inputRefs.current[index + 1]?.select();
    }
  };

  const handleKeyDown = (index, event) => {
    if (event.key === "Backspace") {
      if (otpDigits[index]) {
        const nextDigits = [...otpDigits];
        nextDigits[index] = "";
        setOtpDigits(nextDigits);
      } else if (index > 0) {
        const nextDigits = [...otpDigits];
        nextDigits[index - 1] = "";
        setOtpDigits(nextDigits);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
      inputRefs.current[index - 1]?.select();
    } else if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
      inputRefs.current[index + 1]?.select();
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pasted = (event.clipboardData.getData("text") || "")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (!pasted) return;

    const nextDigits = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((char, i) => {
      nextDigits[i] = char;
    });
    setOtpDigits(nextDigits);
    setErrorMessage("");
    const targetFocus = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[targetFocus]?.focus();
  };

  const handleResendCode = async () => {
    if (!canResend) {
      return;
    }
    setErrorMessage("");
    setResendNotice("");
    setIsResending(true);

    try {
      await sendEmailOtp(email, { shouldCreateUser: false });
      setResendNotice("A new verification code has been sent to your Gmail.");
      setSecondsRemaining(OTP_EXPIRY_SECONDS);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setFailedAttempts(0);
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsResending(false);
    }
  };

  const handleChangeDestination = () => {
    clearPendingOtp();
    navigate(
      isPasswordResetOtp
        ? "/forgot-password"
        : "/",
      { replace: true }
    );
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-[#E5EFF1] font-sans antialiased">
      <div className="relative hidden min-h-0 min-w-0 overflow-hidden bg-[#1F4E5A] p-16 text-white lg:flex lg:w-1/2 flex-col justify-between">
        <div className="absolute inset-0 bg-linear-to-br from-[#1F4E5A] via-[#286575] to-[#163a43] opacity-100 z-0"></div>
        <div className="absolute -top-20 -right-20 w-125 h-125 bg-[#34769B] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.25] z-0"></div>
        <div className="absolute -bottom-40 -left-20 w-150 h-150 bg-[#4C9F80] rounded-full mix-blend-screen filter blur-[140px] opacity-20 z-0"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-size-[32px_32px] z-0"></div>

        <div className="relative z-10">
          <div className="w-16 h-16 rounded-full bg-white p-2 flex items-center justify-center shadow-md mb-10 overflow-hidden">
            <img
              src={prdsLogo}
              alt="PRDS Logo"
              className="w-full h-full object-contain"
            />
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight leading-[1.15] mb-6">
            Pharmaceutical
            <br />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-white to-gray-300">
              Resources
            </span>
            <br />
            Distribution
            <br />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-[#FEF08A] to-[#F5D461]">System</span>
          </h1>

          <p className="text-lg text-teal-100/80 max-w-md font-medium leading-relaxed">
            {isPasswordResetOtp
              ? "Enter the verification code sent to your Gmail inbox to reset your password."
              : "Enter the verification code sent to your Gmail inbox to sign in to your PRDS account."}
          </p>
        </div>

        <div className="relative z-10 text-sm text-teal-200/60 font-medium tracking-wide">
          &copy; 2026 City Health Office - City of Naga, Cebu. All rights reserved.
        </div>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-12 md:px-12">
          <form className="w-full max-w-md" onSubmit={handleVerifyOtp}>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-slate-800 mb-2">
                Verify Gmail Code
              </h2>
              <p className="text-sm font-medium text-slate-500">
                Enter the verification code sent to{" "}
                <span className="font-bold text-slate-700">
                  {maskEmail(email)}
                </span>
                .
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold ${
                    isOtpExpired || failedAttempts >= MAX_OTP_ATTEMPTS
                      ? "text-[#D9826B]"
                      : "text-[#226048]"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  {failedAttempts >= MAX_OTP_ATTEMPTS
                    ? "Code invalidated (3/3 attempts used)"
                    : isOtpExpired
                      ? "Code expired"
                      : `Code expires in ${formattedTimeRemaining}`}
                </span>

                {canResend ? (
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isResending}
                    className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold text-white shadow-xs transition hover:brightness-105 active:scale-[0.98] cursor-pointer disabled:opacity-60"
                  >
                    <RotateCcw className={`h-3 w-3 ${isResending ? "animate-spin" : ""}`} />
                    <span>{isResending ? "Resending Code..." : "Resend Code"}</span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-2.5 py-1 text-xs font-medium text-[#5B7077]">
                    <Clock className="h-3 w-3 text-[#5B7077]" />
                    Resend code in {resendCooldown}s
                  </span>
                )}
              </div>
              {resendNotice && (
                <p className="mt-2 text-xs font-semibold text-[#2D7A5D]">
                  {resendNotice}
                </p>
              )}
            </div>

            <label className="block text-xs font-bold uppercase tracking-wider text-[#5B7077] mb-3 text-center sm:text-left">
              Verification Code
            </label>

            <div
              className="flex items-center justify-between gap-2 sm:gap-3 my-2"
              role="group"
              aria-label="6-digit verification code"
            >
              {otpDigits.map((digit, index) => {
                const isFilled = Boolean(digit);
                return (
                  <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={OTP_LENGTH}
                    value={digit}
                    onChange={(e) => handleDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={handlePaste}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.target.select()}
                    disabled={isSubmitting || isOtpExpired || failedAttempts >= MAX_OTP_ATTEMPTS}
                    aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    className={`h-14 w-11 sm:h-16 sm:w-13 rounded-2xl border text-center text-xl sm:text-2xl font-bold tracking-tight text-[#1B2B30] shadow-2xs outline-none transition-all duration-150 ${
                      isFilled
                        ? "border-[#1F4E5A] bg-white ring-1 ring-[#1F4E5A]/20"
                        : "border-[#CFDDE0] bg-[#F9FBFB] hover:border-[#1F4E5A]/40"
                    } focus:border-[#1F4E5A] focus:bg-white focus:ring-2 focus:ring-[#1F4E5A]/25 disabled:cursor-not-allowed disabled:bg-[#E5EFF1] disabled:opacity-60`}
                  />
                );
              })}
            </div>

            {errorMessage && (
              <p className="mt-5 rounded-lg border border-[#faedf0] bg-[#faedf0] px-4 py-3 text-sm font-semibold text-[#D9826B]">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={
                isSubmitting ||
                isOtpExpired ||
                failedAttempts >= MAX_OTP_ATTEMPTS ||
                verificationCode.length !== OTP_LENGTH
              }
              className="mt-6 flex w-full items-center justify-center rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-xs transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
            >
              {isSubmitting
                ? "Verifying Code..."
                : isPasswordResetOtp
                  ? "Verify Code and Reset Password"
                  : "Verify Code and Log In"}
            </button>

            <button
              type="button"
              onClick={handleChangeDestination}
              disabled={isSubmitting}
              className="mt-4 w-full text-center text-sm font-bold text-[#1F4E5A] transition hover:text-[#286575] hover:underline disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
            >
              {isPasswordResetOtp
                ? "Use a different email address"
                : "Back to log in"}
            </button>

            <div className="text-center mt-8 text-sm text-[#5B7077] font-medium">
              Already have an account?{" "}
              <Link
                to="/"
                className="text-[#1F4E5A] font-bold hover:text-[#286575] hover:underline cursor-pointer"
              >
                Log in
              </Link>
            </div>
          </form>
        </div>

        <div className="w-full border-t border-gray-100 py-6 px-12 flex justify-between items-center select-none bg-white relative">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-px bg-gray-200 hidden md:block"></div>

          <div className="w-10 h-10 filter grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-200">
            <img
              src={citySeal}
              alt="City of Naga Seal"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="w-10 h-10 filter grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-200">
            <img
              src={nagaGarbo}
              alt="Naga Atong Garbo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      </div>

      {showPendingApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-xs" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pending-approval-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700" aria-hidden="true">
              <span className="text-lg font-bold">!</span>
            </div>
            <h2 id="pending-approval-title" className="text-lg font-bold text-slate-900">
              Registration Under Review
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Your account is pending administrator approval. You can sign in after your registration has been reviewed and activated.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => navigate("/", { replace: true })}
                className="btn-primary rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition cursor-pointer"
              >
                Okay
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
