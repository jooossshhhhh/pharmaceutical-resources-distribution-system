import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  getAuthErrorMessage,
  logoutUser,
  sendEmailOtp,
  sendPhoneOtp,
  toPhilippineE164PhoneNumber,
  verifyEmailOtp,
  verifyPhoneOtp,
} from "@backend/services/auth/authService";
import {
  clearPendingOtp,
  getPendingOtp,
  getPendingPhoneOtp,
  OTP_CHANNELS,
  PHONE_OTP_PURPOSES,
} from "@backend/services/auth/pendingPhoneOtpStore";
import {
  createPhoneProfile,
  getProfileById,
  isProfileRegistrationComplete,
} from "@backend/services/auth/profileService";
import citySeal from "@frontend/assets/city-of-naga-seal.png";
import nagaGarbo from "@frontend/assets/naga-atong-garbo.png";
import prdsLogo from "@frontend/assets/prds-logo-main.svg";
import { getLoginAccountStatus } from "@shared/utils/authRegistrationUtils.js";

const OTP_EXPIRY_SECONDS = 120;

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
  const [pendingOtp] = useState(() => getPendingOtp() || getPendingPhoneOtp());
  const [verificationCode, setVerificationCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [resendNotice, setResendNotice] = useState("");
  const [showPendingApprovalModal, setShowPendingApprovalModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(OTP_EXPIRY_SECONDS);

  useEffect(() => {
    if (!pendingOtp) {
      navigate("/", { replace: true });
    }
  }, [navigate, pendingOtp]);

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

  if (!pendingOtp) {
    return null;
  }

  const {
    channel,
    email,
    facilityId,
    firstName,
    lastName,
    phoneNumber,
    purpose,
    role,
  } = pendingOtp;

  const isEmailOtp =
    channel === OTP_CHANNELS.EMAIL || (!phoneNumber && Boolean(email));
  const isRegistrationOtp = purpose === PHONE_OTP_PURPOSES.REGISTRATION;
  const isOtpExpired = secondsRemaining <= 0;
  const formattedTimeRemaining = `${String(
    Math.floor(secondsRemaining / 60)
  ).padStart(2, "0")}:${String(secondsRemaining % 60).padStart(2, "0")}`;

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setResendNotice("");

    if (isOtpExpired) {
      setErrorMessage("Verification code has expired. Please request a new code.");
      return;
    }

    const cleanCode = verificationCode.trim();
    if (cleanCode.length < 6 || cleanCode.length > 8) {
      setErrorMessage("Please enter the complete verification code.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEmailOtp) {
        const { user } = await verifyEmailOtp({
          email,
          verificationCode: cleanCode,
        });

        if (!user) {
          throw new Error("Unable to verify Gmail code. Please try again.");
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
      }

      // Phone OTP Verification
      const { user } = await verifyPhoneOtp({
        verificationCode: cleanCode,
        phoneNumber,
      });

      if (!user) {
        throw new Error("Unable to verify OTP. Please try again.");
      }

      if (isRegistrationOtp) {
        const existingProfile = await getProfileById(user.id);

        if (!isProfileRegistrationComplete(existingProfile)) {
          await createPhoneProfile({
            facilityId,
            firstName,
            lastName,
            phoneNumber,
            role,
            userId: user.id,
          });
        }

        clearPendingOtp();
        navigate("/pending-approval", { replace: true });
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
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    setErrorMessage("");
    setResendNotice("");
    setIsResending(true);

    try {
      if (isEmailOtp) {
        await sendEmailOtp(email, { shouldCreateUser: false });
        setResendNotice("A new verification code has been sent to your Gmail.");
      } else {
        await sendPhoneOtp(phoneNumber, { shouldCreateUser: isRegistrationOtp });
        setResendNotice("A new verification code has been sent to your phone.");
      }
      setSecondsRemaining(OTP_EXPIRY_SECONDS);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsResending(false);
    }
  };

  const handleChangeDestination = () => {
    clearPendingOtp();
    navigate(isRegistrationOtp ? "/register" : "/", { replace: true });
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-gray-50 font-sans antialiased">
      <div className="relative hidden min-h-0 min-w-0 overflow-hidden bg-[#1d3f8c] p-16 text-white lg:flex lg:w-1/2 flex-col justify-between">
        <div className="absolute inset-0 bg-linear-to-br from-[#1d3f8c] via-[#254fa8] to-[#0e1f47] opacity-100 z-0"></div>
        <div className="absolute -top-20 -right-20 w-125 h-125 bg-[#dc8939] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.15] z-0"></div>
        <div className="absolute -bottom-40 -left-20 w-150 h-150 bg-[#b53e53] rounded-full mix-blend-screen filter blur-[140px] opacity-20 z-0"></div>
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
            <span className="text-[#dc8939]">System</span>
          </h1>

          <p className="text-lg text-blue-100/80 max-w-md font-medium leading-relaxed">
            {isEmailOtp
              ? "Enter the verification code sent to your Gmail inbox to sign in to your PRDS account."
              : isRegistrationOtp
                ? "Verify your phone number before your access request is submitted for approval."
                : "Use the one-time code to sign in without your account password."}
          </p>
        </div>

        <div className="relative z-10 text-sm text-blue-200/60 font-medium tracking-wide">
          &copy; 2026 City Health Office - City of Naga, Cebu. All rights reserved.
        </div>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-12 md:px-12">
          <form className="w-full max-w-md" onSubmit={handleVerifyOtp}>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-slate-800 mb-2">
                {isEmailOtp ? "Verify Gmail Code" : "Verify Phone Number"}
              </h2>
              <p className="text-sm font-medium text-slate-500">
                {isEmailOtp ? (
                  <>
                    Enter the verification code sent to{" "}
                    <span className="font-bold text-slate-700">
                      {maskEmail(email)}
                    </span>
                    .
                  </>
                ) : (
                  <>
                    {isRegistrationOtp
                      ? "Enter the registration code sent to "
                      : "Enter the sign-in code sent to "}
                    <span className="font-bold text-slate-700">
                      {toPhilippineE164PhoneNumber(phoneNumber)}
                    </span>
                    .
                  </>
                )}
              </p>
              <div className="mt-3 flex items-center justify-center gap-3">
                <p
                  className={`text-sm font-bold ${
                    isOtpExpired ? "text-red-600" : "text-green-700"
                  }`}
                >
                  {isOtpExpired
                    ? "Code expired"
                    : `Code expires in ${formattedTimeRemaining}`}
                </p>
                {isOtpExpired && (
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isResending}
                    className="text-xs font-bold text-[#1d3f8c] hover:text-green-700 hover:underline disabled:opacity-70"
                  >
                    {isResending ? "Resending..." : "Resend Code"}
                  </button>
                )}
              </div>
              {resendNotice && (
                <p className="mt-2 text-xs font-semibold text-green-700">
                  {resendNotice}
                </p>
              )}
            </div>

            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Verification Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={verificationCode}
              onChange={(event) =>
                setVerificationCode(
                  event.target.value.replace(/\D/g, "").slice(0, 8)
                )
              }
              onPaste={(event) => {
                event.preventDefault();
                const pastedText = event.clipboardData.getData("text") || "";
                setVerificationCode(pastedText.replace(/\D/g, "").slice(0, 8));
              }}
              placeholder="Enter code"
              required
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-center text-lg font-bold tracking-[0.35em] text-gray-900 shadow-sm outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
            />

            {errorMessage && (
              <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isOtpExpired}
              className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#008000] px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-md shadow-green-800/10 transition-all duration-150 hover:bg-[#006600] hover:shadow-lg hover:shadow-green-800/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting
                ? "Verifying Code..."
                : isEmailOtp
                  ? "Verify Code and Sign In"
                  : isRegistrationOtp
                    ? "Verify OTP and Create Account"
                    : "Verify OTP and Sign In"}
            </button>

            <button
              type="button"
              onClick={handleChangeDestination}
              disabled={isSubmitting}
              className="mt-4 w-full text-center text-sm font-bold text-[#1d3f8c] transition hover:text-green-700 hover:underline disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isEmailOtp
                ? "Use a different email address"
                : isRegistrationOtp
                  ? "Change registration number"
                  : "Back to sign in"}
            </button>

            <div className="text-center mt-8 text-sm text-gray-500 font-medium">
              Already have an account?{" "}
              <Link
                to="/"
                className="text-[#1d3f8c] font-bold hover:text-green-700 hover:underline"
              >
                Sign in
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
                className="rounded-lg bg-[#0d1117] px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
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
