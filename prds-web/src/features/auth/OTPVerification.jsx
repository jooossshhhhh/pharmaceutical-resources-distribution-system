import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  getAuthErrorMessage,
  logoutUser,
  toPhilippineE164PhoneNumber,
  verifyPhoneOtp,
} from "./AuthService";
import {
  clearPendingPhoneOtp,
  getPendingPhoneOtp,
  PHONE_OTP_PURPOSES,
} from "./PendingPhoneOtpStore";
import {
  createPhoneProfile,
  getProfileById,
  isProfileRegistrationComplete,
} from "./ProfileService";

const OTP_EXPIRY_SECONDS = 120;

export default function OTPVerification() {
  const navigate = useNavigate();
  const [pendingPhoneOtp] = useState(() => getPendingPhoneOtp());
  const [verificationCode, setVerificationCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(OTP_EXPIRY_SECONDS);

  useEffect(() => {
    if (!pendingPhoneOtp) {
      navigate("/", { replace: true });
    }
  }, [navigate, pendingPhoneOtp]);

  useEffect(() => {
    if (!pendingPhoneOtp || secondsRemaining <= 0) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setSecondsRemaining((currentSeconds) =>
        currentSeconds > 0 ? currentSeconds - 1 : 0
      );
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [pendingPhoneOtp, secondsRemaining]);

  if (!pendingPhoneOtp) {
    return null;
  }

  const {
    facilityId,
    firstName,
    lastName,
    phoneNumber,
    purpose,
    role,
  } = pendingPhoneOtp;
  const isRegistrationOtp = purpose === PHONE_OTP_PURPOSES.REGISTRATION;
  const isOtpExpired = secondsRemaining <= 0;
  const formattedTimeRemaining = `${String(
    Math.floor(secondsRemaining / 60)
  ).padStart(2, "0")}:${String(secondsRemaining % 60).padStart(2, "0")}`;

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (isOtpExpired) {
      setErrorMessage("OTP has expired. Please request a new code.");
      return;
    }

    setIsSubmitting(true);

    try {
      const {
        user,
      } = await verifyPhoneOtp({
        verificationCode,
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

        clearPendingPhoneOtp();
        navigate("/pending-approval", { replace: true });
        return;
      }

      const profile = await getProfileById(user.id);

      clearPendingPhoneOtp();

      if (!isProfileRegistrationComplete(profile)) {
        await logoutUser();
        navigate("/", {
          replace: true,
          state: {
            noticeMessage:
              "This phone number is not registered in PRDS yet. Please register an account before signing in.",
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

      navigate(
        profile.status === "ACTIVE" ? "/dashboard" : "/pending-approval",
        { replace: true }
      );
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePhoneNumber = async () => {
    clearPendingPhoneOtp();
    navigate(isRegistrationOtp ? "/register" : "/", { replace: true });
  };

  return (
    <div className="min-h-screen flex font-sans antialiased bg-gray-50">
      <div className="hidden lg:flex lg:w-1/2 bg-[#1d3f8c] relative text-white p-16 flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-[#1d3f8c] via-[#254fa8] to-[#0e1f47] opacity-100 z-0"></div>
        <div className="absolute -top-20 -right-20 w-125 h-125 bg-[#dc8939] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.15] z-0"></div>
        <div className="absolute -bottom-40 -left-20 w-150 h-150 bg-[#b53e53] rounded-full mix-blend-screen filter blur-[140px] opacity-20 z-0"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-size-[32px_32px] z-0"></div>

        <div className="relative z-10">
          <div className="w-16 h-16 rounded-full bg-white p-2 flex items-center justify-center shadow-md mb-10 overflow-hidden">
            <img
              src="./src/assets/prds-logo-main.svg"
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
            {isRegistrationOtp
              ? "Verify your phone number before your access request is submitted for approval."
              : "Use the one-time code to sign in without your account password."}
          </p>
        </div>

        <div className="relative z-10 text-sm text-blue-200/60 font-medium tracking-wide">
          &copy; 2026 City Health Office - City of Naga, Cebu. All rights reserved.
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-white min-h-screen relative">
        <div className="flex-1 flex flex-col justify-center items-center px-6 md:px-12 py-12">
          <form className="w-full max-w-md" onSubmit={handleVerifyOtp}>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-slate-800 mb-2">
                Verify Phone Number
              </h2>
              <p className="text-sm font-medium text-slate-500">
                {isRegistrationOtp
                  ? "Enter the registration code sent to "
                  : "Enter the sign-in code sent to "}
                <span className="font-bold text-slate-700">
                  {toPhilippineE164PhoneNumber(phoneNumber)}
                </span>
                .
              </p>
              <p
                className={`mt-3 text-sm font-bold ${
                  isOtpExpired ? "text-red-600" : "text-green-700"
                }`}
              >
                {isOtpExpired
                  ? "OTP expired"
                  : `OTP expires in ${formattedTimeRemaining}`}
              </p>
            </div>

            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Verification Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={verificationCode}
              onChange={(event) =>
                setVerificationCode(event.target.value.replace(/\D/g, ""))
              }
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
                ? "Verifying OTP"
                : isRegistrationOtp
                  ? "Verify OTP and Create Account"
                  : "Verify OTP and Sign In"}
            </button>

            <button
              type="button"
              onClick={handleChangePhoneNumber}
              disabled={isSubmitting}
              className="mt-4 w-full text-center text-sm font-bold text-[#1d3f8c] transition hover:text-green-700 hover:underline disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isRegistrationOtp ? "Change registration number" : "Back to sign in"}
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
              src="./src/assets/city-of-naga-seal.png"
              alt="City of Naga Seal"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="w-10 h-10 filter grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-200">
            <img
              src="./src/assets/naga-atong-garbo.png"
              alt="Naga Atong Garbo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
