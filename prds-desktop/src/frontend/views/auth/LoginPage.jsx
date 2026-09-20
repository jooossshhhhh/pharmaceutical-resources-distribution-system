import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@frontend/context/useAuth";
import {
  getAuthErrorMessage,
  isPhilippineMobileNumber,
  logoutUser,
  normalizePhoneNumber,
  sendEmailOtp,
  sendPhoneOtp,
  signInWithPhonePassword,
} from "@backend/services/auth/authService";
import { getProfileById } from "@backend/services/auth/profileService";
import {
  OTP_CHANNELS,
  OTP_PURPOSES,
  PHONE_OTP_PURPOSES,
  setPendingOtp,
  setPendingPhoneOtp,
} from "@backend/services/auth/pendingPhoneOtpStore";
import { saveUserSession } from "@backend/database/snapshotStore";
import { syncAllData } from "@backend/sync/syncManager";
import { getLoginAccountStatus } from "@shared/utils/authRegistrationUtils.js";
import citySeal from "@frontend/assets/city-of-naga-seal.png";
import loginIcon from "@frontend/assets/login-icon.svg";
import nagaGarbo from "@frontend/assets/naga-atong-garbo.png";
import prdsLogo from "@frontend/assets/prds-logo-main.svg";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading, profile } = useAuth();
  const isHandlingPasswordLogin = useRef(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [accountAccessStatus, setAccountAccessStatus] = useState(
    location.state?.accountAccessStatus || ""
  );
  const [noticeMessage, setNoticeMessage] = useState(
    location.state?.noticeMessage || ""
  );
  const [showRegisterLink, setShowRegisterLink] = useState(
    !location.state?.hideRegisterLink
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOtpSubmitting, setIsOtpSubmitting] = useState(false);

  // Google sign-in modal state
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleEmail, setGoogleEmail] = useState("");
  const [googleModalError, setGoogleModalError] = useState("");
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !isAuthenticated || isHandlingPasswordLogin.current) {
      return;
    }

    const accountStatus = getLoginAccountStatus(profile);
    if (accountStatus === "active") {
      if (profile) {
        saveUserSession(null, profile);
      }
      navigate("/dashboard", { replace: true });
      return;
    }

    let isMounted = true;

    const rejectBlockedSession = async () => {
      await logoutUser();

      if (isMounted) {
        if (accountStatus === "deactivated") {
          setShowRegisterLink(false);
          setNoticeMessage(
            "This account is deactivated. Please contact a PRDS administrator for assistance."
          );
        } else {
          setAccountAccessStatus(accountStatus);
        }
      }
    };

    rejectBlockedSession();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, loading, navigate, profile]);

  const routeAfterProfileCheck = async (profileToCheck) => {
    const accountStatus = getLoginAccountStatus(profileToCheck);
    if (accountStatus === "active") {
      saveUserSession(null, profileToCheck);
      syncAllData();
      navigate("/dashboard", { replace: true });
      return;
    }

    if (accountStatus === "pending" || accountStatus === "unregistered") {
      await logoutUser();
      setAccountAccessStatus(accountStatus);
      return;
    }

    await logoutUser();
    setShowRegisterLink(false);
    setNoticeMessage(
      "This account is deactivated. Please contact a PRDS administrator for assistance."
    );
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setNoticeMessage("");
    setAccountAccessStatus("");

    if (!isPhilippineMobileNumber(phoneNumber)) {
      setErrorMessage("Phone number must use the format 09XXXXXXXXX.");
      return;
    }

    if (!password) {
      setErrorMessage("Password is required.");
      return;
    }

    setIsSubmitting(true);
    isHandlingPasswordLogin.current = true;

    try {
      const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
      const { user } = await signInWithPhonePassword({
        phoneNumber: normalizedPhoneNumber,
        password,
      });

      const profile = await getProfileById(user?.id);

      await routeAfterProfileCheck(profile);
    } catch (error) {
      setErrorMessage(
        `${getAuthErrorMessage(error)} Check the phone number and password, or sign in using OTP verification.`
      );
    } finally {
      isHandlingPasswordLogin.current = false;
      setIsSubmitting(false);
    }
  };

  const handleOtpSignIn = async () => {
    setErrorMessage("");
    setNoticeMessage("");

    if (!isPhilippineMobileNumber(phoneNumber)) {
      setErrorMessage("Phone number must use the format 09XXXXXXXXX.");
      return;
    }

    setIsOtpSubmitting(true);

    try {
      const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
      await sendPhoneOtp(normalizedPhoneNumber, { shouldCreateUser: false });

      setPendingPhoneOtp({
        purpose: PHONE_OTP_PURPOSES.LOGIN,
        phoneNumber: normalizedPhoneNumber,
      });

      navigate("/otp-verification");
    } catch (error) {
      setErrorMessage(
        `${getAuthErrorMessage(error)} OTP sign-in only works for registered phone accounts.`
      );
    } finally {
      setIsOtpSubmitting(false);
    }
  };

  const handleOpenGoogleModal = () => {
    setGoogleModalError("");
    setGoogleEmail("");
    setShowGoogleModal(true);
  };

  const handleGoogleModalSubmit = async (event) => {
    event.preventDefault();
    setGoogleModalError("");

    const trimmedEmail = googleEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setGoogleModalError("Please enter a valid Gmail address.");
      return;
    }

    setIsGoogleSubmitting(true);

    try {
      await sendEmailOtp(trimmedEmail, { shouldCreateUser: false });

      setPendingOtp({
        channel: OTP_CHANNELS.EMAIL,
        email: trimmedEmail,
        purpose: OTP_PURPOSES.LOGIN,
      });

      setShowGoogleModal(false);
      navigate("/otp-verification");
    } catch (error) {
      const msg = (error?.message || "").toLowerCase();
      const code = error?.code || "";
      const status = error?.status;

      if (
        msg.includes("signups not allowed") ||
        code === "otp_disabled" ||
        status === 422 ||
        msg.includes("user not found")
      ) {
        setGoogleModalError("This account hasn't registered yet in the system.");
      } else if (msg.includes("rate limit") || status === 429) {
        setGoogleModalError(
          "Too many email requests. Please wait a moment before trying again."
        );
      } else if (msg.includes("error sending") || status === 500) {
        setGoogleModalError(
          "Unable to send email: Email delivery service failed. (Check your Supabase SMTP credentials or disable custom SMTP)."
        );
      } else {
        setGoogleModalError(
          error?.message || "Failed to send verification code. Please try again."
        );
      }
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-[#f5f7fb] font-sans antialiased">
      <div className="relative hidden min-h-0 min-w-0 overflow-hidden bg-[#1d3f8c] p-12 text-white lg:flex lg:w-[48%] flex-col justify-between xl:p-16">
        <div className="absolute inset-0 bg-linear-to-br from-[#1d3f8c] via-[#254fa8] to-[#0e1f47] opacity-100 z-0"></div>
        <div className="absolute -top-20 -right-20 w-125 h-125 bg-[#dc8939] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.15] z-0"></div>
        <div className="absolute -bottom-40 -left-20 w-150 h-150 bg-[#b53e53] rounded-full mix-blend-screen filter blur-[140px] opacity-20 z-0"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-size-[32px_32px] z-0"></div>

        <div className="relative z-10">
          <div className="mb-8 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white p-2 shadow-md xl:mb-10 xl:h-16 xl:w-16">
            <img
              src={prdsLogo}
              alt="PRDS Logo"
              className="w-full h-full object-contain"
            />
          </div>

          <h1 className="mb-5 text-4xl font-extrabold leading-[1.15] tracking-tight xl:mb-6 xl:text-5xl">
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

          <p className="max-w-md text-base font-medium leading-relaxed text-blue-100/80 xl:text-lg">
            A centralized platform for managing medicine inventory, requests, forecasting, and healthcare resource distribution across City of Naga facilities.
          </p>
        </div>

        <div className="relative z-10 text-sm text-blue-200/60 font-medium tracking-wide">
          &copy; 2026 City Health Office - City of Naga, Cebu. All rights reserved.
        </div>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white">
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-5 md:px-12">
          <form
            className="w-full max-w-md rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-xl shadow-slate-200/70 md:p-6"
            onSubmit={handleLogin}
          >
            <div className="mb-5 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e5e7eb] bg-white p-2 shadow-sm lg:hidden">
                <img src={prdsLogo} alt="PRDS Logo" className="h-full w-full object-contain" />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#008f68]">
                PRDS Account
              </p>
              <h2 className="mt-1 text-3xl font-black tracking-tight text-[#0d1117]">
                Sign In
              </h2>
              <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                Access medicine inventory, requests, transfers, and dispensing records.
              </p>
            </div>

            <div className="mb-4">
              <label
                htmlFor="login-phone"
                className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Phone Number
              </label>
              <div className="flex overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm transition-all focus-within:border-[#008f68] focus-within:ring-2 focus-within:ring-[#6be9c2]/35">
                <div className="relative flex-1 flex items-center">
                  <div className="absolute left-3.5 pointer-events-none text-gray-400">
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    id="login-phone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="09XXXXXXXXX"
                    value={phoneNumber}
                    onChange={(event) =>
                      setPhoneNumber(event.target.value.replace(/\D/g, ""))
                    }
                    autoComplete="tel"
                    required
                    className="w-full bg-transparent py-3 pl-10 pr-4 text-sm font-medium tracking-wide text-gray-900 placeholder-gray-300 focus:outline-none"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs font-medium text-slate-500">
                Use the mobile number linked to your PRDS account.
              </p>
              <button
                type="button"
                onClick={handleOtpSignIn}
                disabled={isSubmitting || isOtpSubmitting}
                className="mt-2 text-xs font-bold text-[#1d3f8c] transition hover:text-[#008f68] hover:underline disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isOtpSubmitting ? "Sending OTP..." : "Use OTP instead"}
              </button>
            </div>

            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600"
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-bold text-[#1d3f8c] transition hover:text-[#008f68] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative flex overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm transition-all focus-within:border-[#008f68] focus-within:ring-2 focus-within:ring-[#6be9c2]/35">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full bg-transparent py-3 pl-10 pr-12 text-sm font-medium text-gray-900 placeholder-gray-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d={showPassword ? "M3 3l18 18M10.584 10.587A2 2 0 0012 14a2 2 0 001.414-.586M9.88 4.243A9.77 9.77 0 0112 4c4.478 0 8.268 2.943 9.542 7a9.975 9.975 0 01-3.043 4.426M6.228 6.228A9.984 9.984 0 002.458 11c1.274 4.057 5.065 7 9.542 7a9.96 9.96 0 004.132-.894" : "M15 12a3 3 0 11-6 0 3 3 0 016 0z"} />
                    {!showPassword && (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {errorMessage && (
              <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700" role="alert">
                {errorMessage}
              </p>
            )}

            {(location.state?.oauthNotice || noticeMessage) && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold leading-6 text-amber-800">
                  {location.state?.oauthNotice || noticeMessage}
                </p>
                {showRegisterLink && (
                  <Link
                    to="/register"
                    className="mt-3 inline-flex rounded-lg bg-black px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0d1117]"
                  >
                    Register account
                  </Link>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isOtpSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-md shadow-slate-900/10 transition-all duration-150 hover:bg-[#0d1117] hover:shadow-lg hover:shadow-slate-900/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span>{isSubmitting ? "Signing In..." : "Sign In"}</span>
              <img
                src={loginIcon}
                alt=""
                aria-hidden="true"
                className="w-4 h-4 object-contain"
              />
            </button>

            <div className="my-4 flex items-center">
              <div className="grow border-t border-gray-200"></div>
              <span className="px-4 text-xs font-bold tracking-wider text-gray-400 uppercase">
                OR
              </span>
              <div className="grow border-t border-gray-200"></div>
            </div>

            <button
              type="button"
              onClick={handleOpenGoogleModal}
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
            >
              <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24">
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

            <div className="mt-5 text-center text-sm font-medium text-gray-500">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="border-0 bg-transparent p-0 font-bold text-[#1d3f8c] transition hover:text-[#008f68] hover:underline"
              >
                Register here
              </button>
            </div>
          </form>
        </div>

        <div className="relative flex w-full select-none items-center justify-between border-t border-gray-100 bg-white px-8 py-3 md:px-12">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-px bg-gray-200 hidden md:block"></div>

          <div className="h-8 w-8 opacity-60 grayscale filter transition-all duration-200 hover:opacity-100 hover:grayscale-0">
            <img
              src={citySeal}
              alt="City of Naga Seal"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="h-8 w-8 opacity-60 grayscale filter transition-all duration-200 hover:opacity-100 hover:grayscale-0">
            <img
              src={nagaGarbo}
              alt="Naga Atong Garbo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      </div>

      {accountAccessStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-xs" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-access-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700" aria-hidden="true">
              <span className="text-lg font-bold">!</span>
            </div>
            <h2 id="account-access-title" className="text-lg font-bold text-slate-900">
              {accountAccessStatus === "pending" ? "Registration Under Review" : "Account Not Registered"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {accountAccessStatus === "pending"
                ? "Your registration is awaiting administrator approval. You can sign in after your account has been activated."
                : "No completed PRDS registration was found for this account. Register to request access, or return to sign in."}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              {accountAccessStatus === "unregistered" && (
                <button
                  type="button"
                  onClick={() => navigate("/register")}
                  className="rounded-lg bg-[#0d1117] px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Register account
                </button>
              )}
              <button
                type="button"
                onClick={() => setAccountAccessStatus("")}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to login
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Google Sign In Modal */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-2xl shadow-slate-900/20 sm:p-7">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 24 24">
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
                <h3 className="text-lg font-black text-slate-900">Sign in with Google</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGoogleModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mb-5 text-xs font-medium leading-5 text-slate-500">
              Enter your registered Google / Gmail account. We will send a 6-digit PRDS verification code directly to your inbox to sign you in.
            </p>

            <form onSubmit={handleGoogleModalSubmit}>
              <label
                htmlFor="modal-google-email"
                className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Gmail / Google Account
              </label>
              <div className="flex overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm transition-all focus-within:border-[#008f68] focus-within:ring-2 focus-within:ring-[#6be9c2]/35">
                <div className="relative flex-1 flex items-center">
                  <div className="absolute left-3.5 pointer-events-none text-gray-400">
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    id="modal-google-email"
                    type="email"
                    placeholder="user@gmail.com"
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                    required
                    className="w-full bg-transparent py-3 pl-10 pr-4 text-sm font-medium tracking-wide text-gray-900 placeholder-gray-300 focus:outline-none"
                  />
                </div>
              </div>

              {googleModalError && (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold leading-5 text-red-700" role="alert">
                  {googleModalError}
                </p>
              )}

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowGoogleModal(false)}
                  disabled={isGoogleSubmitting}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGoogleSubmitting}
                  className="flex items-center gap-2 rounded-xl bg-[#1d3f8c] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-900/15 hover:bg-[#15306d] transition disabled:opacity-70 cursor-pointer"
                >
                  {isGoogleSubmitting ? "Sending Code..." : "Send Code to Gmail"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
