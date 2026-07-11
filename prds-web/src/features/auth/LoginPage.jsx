import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/useAuth";
import {
  getAuthErrorMessage,
  isPhilippineMobileNumber,
  normalizePhoneNumber,
  sendPhoneOtp,
  signInWithPhonePassword,
  signInWithGoogle,
} from "./AuthService";
import { getProfileById } from "./ProfileService";
import { setPendingRegistration } from "./PendingRegistrationStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isProfileApproved, loading } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOtpSubmitting, setIsOtpSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !isAuthenticated) {
      return;
    }

    navigate(isProfileApproved ? "/dashboard" : "/pending-approval", {
      replace: true,
    });
  }, [isAuthenticated, isProfileApproved, loading, navigate]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!isPhilippineMobileNumber(phoneNumber)) {
      setErrorMessage("Phone number must use the format 09XXXXXXXXX.");
      return;
    }

    if (!password) {
      setErrorMessage("Password is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
      const { user } = await signInWithPhonePassword({
        phoneNumber: normalizedPhoneNumber,
        password,
      });
      const profile = await getProfileById(user?.id);

      navigate(
        profile?.status === "ACTIVE" ? "/dashboard" : "/pending-approval",
        { replace: true }
      );
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSignIn = async () => {
    setErrorMessage("");

    if (!isPhilippineMobileNumber(phoneNumber)) {
      setErrorMessage("Phone number must use the format 09XXXXXXXXX.");
      return;
    }

    setIsOtpSubmitting(true);

    try {
      const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
      await sendPhoneOtp(normalizedPhoneNumber, { shouldCreateUser: false });

      setPendingRegistration({
        mode: "login",
        phoneNumber: normalizedPhoneNumber,
      });

      navigate("/otp-verification");
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsOtpSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await signInWithGoogle();
    } catch (error) {
      setErrorMessage(
        error?.message || "Unable to sign in with Google. Please try again."
      );
      setIsSubmitting(false);
    }
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
            A centralized platform for managing medicine inventory, requests, forecasting, and healthcare resource distribution across City of Naga facilities.
          </p>
        </div>

        <div className="relative z-10 text-sm text-blue-200/60 font-medium tracking-wide">
          &copy; 2026 City Health Office - City of Naga, Cebu. All rights reserved.
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-white min-h-screen relative">
        <div className="flex-1 flex flex-col justify-center items-center px-6 md:px-12 py-12">
          <form className="w-full max-w-md" onSubmit={handleLogin}>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-slate-800 mb-2">
                Sign In
              </h2>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Phone Number
              </label>
              <div className="flex rounded-xl border border-gray-300 shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-green-600/20 focus-within:border-green-600 transition-all bg-white">
                <div className="relative flex-1 flex items-center">
                  <div className="absolute left-3.5 pointer-events-none text-gray-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="09623702834"
                    value={phoneNumber}
                    onChange={(event) =>
                      setPhoneNumber(event.target.value.replace(/\D/g, ""))
                    }
                    required
                    className="w-full bg-transparent pl-10 pr-4 py-3.5 text-gray-900 placeholder-gray-300 focus:outline-none text-sm font-medium tracking-wide"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleOtpSignIn}
                disabled={isSubmitting || isOtpSubmitting}
                className="mt-2 text-xs font-bold text-[#1d3f8c] transition hover:text-green-700 hover:underline disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isOtpSubmitting ? "Sending OTP" : "Sign in using OTP verification"}
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Password
              </label>
              <div className="relative flex rounded-xl border border-gray-300 shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-green-600/20 focus-within:border-green-600 transition-all bg-white">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="w-full bg-transparent pl-10 pr-12 py-3.5 text-gray-900 placeholder-gray-300 focus:outline-none text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d={showPassword ? "M3 3l18 18M10.584 10.587A2 2 0 0012 14a2 2 0 001.414-.586M9.88 4.243A9.77 9.77 0 0112 4c4.478 0 8.268 2.943 9.542 7a9.975 9.975 0 01-3.043 4.426M6.228 6.228A9.984 9.984 0 002.458 11c1.274 4.057 5.065 7 9.542 7a9.96 9.96 0 004.132-.894" : "M15 12a3 3 0 11-6 0 3 3 0 016 0z"} />
                    {!showPassword && (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {errorMessage && (
              <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#008000] hover:bg-[#006600] text-white font-bold py-3.5 px-4 rounded-xl shadow-md shadow-green-800/10 hover:shadow-lg hover:shadow-green-800/20 flex items-center justify-center gap-2 active:scale-[0.99] transition-all duration-150 text-sm tracking-wide disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span>{isSubmitting ? "Logging In" : "Log In"}</span>
              <img
                src="./src/assets/login-icon.svg"
                alt="Login Icon"
                className="w-4 h-4 object-contain"
              />
            </button>

            <div className="flex items-center my-6">
              <div className="grow border-t border-gray-200"></div>
              <span className="px-4 text-xs font-bold tracking-wider text-gray-400 uppercase">
                OR
              </span>
              <div className="grow border-t border-gray-200"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-3 border border-gray-200 bg-white text-slate-600 font-semibold py-3.5 rounded-xl hover:bg-gray-50 hover:border-gray-300 active:scale-[0.99] transition-all duration-150 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M5.266 9.765A7.077 7.077 0 0112 4.909c1.69 0 3.218.6 4.418 1.582l3.51-3.51C17.827 1.127 15.118 0 12 0 7.34 0 3.314 2.673 1.311 6.56l3.955 3.205z"
                />
                <path
                  fill="#4285F4"
                  d="M23.49 12.275c0-.796-.073-1.564-.2-2.305H12v4.51h6.464a5.523 5.523 0 01-2.397 3.623l3.714 2.877c2.173-2.002 3.423-4.952 3.423-8.705z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.266 14.235L1.311 17.44A11.944 11.944 0 0012 24c3.118 0 5.964-1.005 8.082-2.732l-3.714-2.877a7.114 7.114 0 01-4.368 1.218 7.098 7.098 0 01-6.734-4.874z"
                />
                <path
                  fill="#34A853"
                  d="M5.266 9.765A7.038 7.038 0 015 12c0 .782.095 1.54.266 2.235l-3.955 3.205A11.947 11.947 0 010 12c0-2.01.5-3.905 1.311-5.595l3.955 3.205z"
                />
              </svg>
              Sign in with Google
            </button>

            <div className="text-center mt-8 text-sm text-gray-500 font-medium">
              Don't have an account?{" "}
              <Link
                to="/register"
                className="text-[#1d3f8c] font-bold hover:text-green-700 hover:underline bg-transparent border-0 cursor-pointer transition"
              >
                Register here
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
