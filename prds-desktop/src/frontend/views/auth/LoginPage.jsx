import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@frontend/context/useAuth";
import {
  getAuthErrorMessage,
  logoutUser,
  sendEmailOtp,
  signInWithPasscode,
  signInWithUnifiedPassword,
} from "@backend/services/auth/authService";
import { supabase } from "@backend/client/supabase";
import { getProfileById } from "@backend/services/auth/profileService";
import {
  OTP_CHANNELS,
  OTP_PURPOSES,
  setPendingOtp,
} from "@backend/services/auth/pendingPhoneOtpStore";
import {
  getCachedUserSession,
  saveUserSession,
  getTerminalPasscodeAccounts,
} from "@backend/database/snapshotStore";
import { syncAllData } from "@backend/sync/syncManager";
import { isCurrentNetworkOnline } from "@backend/sync/networkStatus";
import {
  getLoginAccountStatus,
  getLockoutDurationSeconds,
} from "@shared/utils/authRegistrationUtils.js";
import citySeal from "@frontend/assets/city-of-naga-seal.png";
import loginIcon from "@frontend/assets/login-icon.svg";
import nagaGarbo from "@frontend/assets/naga-atong-garbo.png";
import prdsEmblem from "@frontend/assets/prds-emblem.svg";
import prdsLogo from "@frontend/assets/prds-logo-main.svg";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading, profile, loginWithOfflineSession, supabaseUser } = useAuth();
  const isHandlingPasswordLogin = useRef(false);
  const [loginMode, setLoginMode] = useState("standard");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // 6-digit passcode state
  const [isPasscodeFieldVisible, setIsPasscodeFieldVisible] = useState(false);
  const [passcodeDigits, setPasscodeDigits] = useState(Array(6).fill(""));
  const passcode = passcodeDigits.join("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [isPasscodeSubmitting, setIsPasscodeSubmitting] = useState(false);
  const passcodeInputRefs = useRef([]);
  const identifierInputRef = useRef(null);
  const PASSCODE_LENGTH = 6;

  const [errorMessage, setErrorMessage] = useState("");
  const [accountAccessStatus, setAccountAccessStatus] = useState(
    location.state?.accountAccessStatus || ""
  );
  const [noticeMessage, setNoticeMessage] = useState(
    location.state?.noticeMessage || ""
  );
  const [successMessage, setSuccessMessage] = useState(
    location.state?.successMessage || ""
  );
  const [showRegisterLink, setShowRegisterLink] = useState(
    !location.state?.hideRegisterLink
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOtpSubmitting, setIsOtpSubmitting] = useState(false);
  const [failedLoginAttempts, setFailedLoginAttempts] = useState(0);
  const [lockoutRemainingSeconds, setLockoutRemainingSeconds] = useState(0);

  useEffect(() => {
    if (lockoutRemainingSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setLockoutRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockoutRemainingSeconds]);

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
        const activeUser = supabaseUser || getCachedUserSession().user;
        if (activeUser) {
          saveUserSession(activeUser, profile);
          loginWithOfflineSession?.({ user: activeUser, profile });
        }
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
  }, [isAuthenticated, loading, loginWithOfflineSession, navigate, profile, supabaseUser]);

  const routeAfterProfileCheck = async (profileToCheck, userToCheck = null) => {
    const accountStatus = getLoginAccountStatus(profileToCheck);
    if (accountStatus === "active") {
      const activeUser = userToCheck || supabaseUser || getCachedUserSession().user;
      if (activeUser && profileToCheck) {
        saveUserSession(activeUser, profileToCheck);
        loginWithOfflineSession?.({ user: activeUser, profile: profileToCheck });
      }
      if (isCurrentNetworkOnline()) {
        syncAllData();
      }
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
    setSuccessMessage("");
    setNoticeMessage("");
    setAccountAccessStatus("");

    if (lockoutRemainingSeconds > 0) {
      setErrorMessage(`Too many failed login attempts. Please wait ${lockoutRemainingSeconds}s before trying again.`);
      return;
    }

    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
      setErrorMessage("Please enter your Gmail address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedIdentifier)) {
      setErrorMessage("Please enter a valid Gmail address.");
      return;
    }

    if (!password) {
      setErrorMessage("Password is required.");
      return;
    }

    setIsSubmitting(true);
    isHandlingPasswordLogin.current = true;

    try {
      const { user } = await signInWithUnifiedPassword({
        identifier: trimmedIdentifier,
        password,
      });

      setFailedLoginAttempts(0);
      setLockoutRemainingSeconds(0);

      const profile = await getProfileById(user?.id);

      await routeAfterProfileCheck(profile, user);
    } catch (error) {
      setFailedLoginAttempts((prev) => {
        const nextAttempts = prev + 1;
        const lockoutSecs = getLockoutDurationSeconds(nextAttempts);
        if (lockoutSecs > 0) {
          setLockoutRemainingSeconds(lockoutSecs);
          setErrorMessage(
            `Account temporarily locked for ${lockoutSecs}s due to ${nextAttempts} failed attempts. If you forgot your password, please use Forgot Password or OTP verification.`
          );
        } else {
          setErrorMessage(
            `${getAuthErrorMessage(error)} Check your credentials, or sign in using OTP verification.`
          );
        }
        return nextAttempts;
      });
    } finally {
      isHandlingPasswordLogin.current = false;
      setIsSubmitting(false);
    }
  };

  const handlePasscodeDigitChange = (index, value) => {
    const clean = value.replace(/\D/g, "");

    if (clean.length > 2) {
      const chars = clean.slice(0, PASSCODE_LENGTH).split("");
      const nextDigits = [...passcodeDigits];
      chars.forEach((char, i) => {
        if (index + i < PASSCODE_LENGTH) {
          nextDigits[index + i] = char;
        }
      });
      setPasscodeDigits(nextDigits);
      setErrorMessage("");
      const nextFocus = Math.min(index + chars.length, PASSCODE_LENGTH - 1);
      passcodeInputRefs.current[nextFocus]?.focus();
      return;
    }

    let digitValue = clean;
    if (clean.length === 2) {
      if (clean[0] === passcodeDigits[index]) {
        digitValue = clean[1];
      } else {
        digitValue = clean[clean.length - 1];
      }
    }

    const nextDigits = [...passcodeDigits];
    nextDigits[index] = digitValue;
    setPasscodeDigits(nextDigits);
    setErrorMessage("");

    if (digitValue && index < PASSCODE_LENGTH - 1) {
      passcodeInputRefs.current[index + 1]?.focus();
      passcodeInputRefs.current[index + 1]?.select();
    }
  };

  const handlePasscodeKeyDown = (index, event) => {
    if (event.key === "Backspace") {
      if (passcodeDigits[index]) {
        const nextDigits = [...passcodeDigits];
        nextDigits[index] = "";
        setPasscodeDigits(nextDigits);
      } else if (index > 0) {
        const nextDigits = [...passcodeDigits];
        nextDigits[index - 1] = "";
        setPasscodeDigits(nextDigits);
        passcodeInputRefs.current[index - 1]?.focus();
      }
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      passcodeInputRefs.current[index - 1]?.focus();
      passcodeInputRefs.current[index - 1]?.select();
    } else if (event.key === "ArrowRight" && index < PASSCODE_LENGTH - 1) {
      event.preventDefault();
      passcodeInputRefs.current[index + 1]?.focus();
      passcodeInputRefs.current[index + 1]?.select();
    }
  };

  const handlePasscodePaste = (event) => {
    event.preventDefault();
    const pasted = (event.clipboardData.getData("text") || "")
      .replace(/\D/g, "")
      .slice(0, PASSCODE_LENGTH);
    if (!pasted) return;

    const nextDigits = Array(PASSCODE_LENGTH).fill("");
    pasted.split("").forEach((char, i) => {
      nextDigits[i] = char;
    });
    setPasscodeDigits(nextDigits);
    setErrorMessage("");
    const targetFocus = Math.min(pasted.length, PASSCODE_LENGTH - 1);
    passcodeInputRefs.current[targetFocus]?.focus();
  };

  const handleProceedToPasscode = () => {
    setErrorMessage("");
    const targetIdentifier = identifier.trim();

    if (!targetIdentifier) {
      setErrorMessage("Please enter your Gmail address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetIdentifier)) {
      setErrorMessage("Please enter a valid Gmail address.");
      return;
    }

    setIsPasscodeFieldVisible(true);
    setTimeout(() => {
      passcodeInputRefs.current[0]?.focus();
      passcodeInputRefs.current[0]?.select();
    }, 60);
  };

  const handleIdentifierChange = (event) => {
    const val = event.target.value;
    setIdentifier(val);
    setErrorMessage("");

    const trimmed = val.trim();
    if (loginMode === "passcode" && !trimmed) {
      setIsPasscodeFieldVisible(false);
      setPasscodeDigits(Array(PASSCODE_LENGTH).fill(""));
    }
  };

  const handleIdentifierKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleProceedToPasscode();
    }
  };

  const handleResetPasscodeIdentifier = () => {
    setIsPasscodeFieldVisible(false);
    setPasscodeDigits(Array(PASSCODE_LENGTH).fill(""));
    setErrorMessage("");
    setTimeout(() => {
      identifierInputRef.current?.focus();
      identifierInputRef.current?.select();
    }, 60);
  };

  const handleSwitchToPasscodeMode = () => {
    setLoginMode("passcode");
    setErrorMessage("");
    setIsPasscodeFieldVisible(false);
    setTimeout(() => {
      identifierInputRef.current?.focus();
    }, 60);
  };

  const handlePasscodeLogin = async (event) => {
    if (event?.preventDefault) event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setNoticeMessage("");
    setAccountAccessStatus("");

    const targetIdentifier = identifier.trim();

    if (!targetIdentifier) {
      setErrorMessage("Please enter your Gmail address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetIdentifier)) {
      setErrorMessage("Please enter a valid Gmail address.");
      return;
    }

    if (!passcode || passcode.length !== 6 || !/^\d{6}$/.test(passcode)) {
      setErrorMessage("Please enter your 6-digit numeric passcode.");
      return;
    }

    setIsPasscodeSubmitting(true);
    isHandlingPasswordLogin.current = true;

    try {
      const normalizedIdentifier = targetIdentifier.toLowerCase();

      const { user, profile: cachedPasscodeProfile } = await signInWithPasscode({
        identifier: normalizedIdentifier,
        passcode,
      });

      let profile = null;
      if (isCurrentNetworkOnline()) {
        try {
          profile = await getProfileById(user?.id);
        } catch (profileErr) {
          console.warn("Profile fetch fallback to cached after passcode login:", profileErr);
        }
      }

      const effectiveProfile = profile || cachedPasscodeProfile;
      if (!effectiveProfile) {
        throw new Error("Unable to retrieve account profile. Please sign in with Password or OTP.");
      }

      loginWithOfflineSession?.({ user, profile: effectiveProfile });
      await routeAfterProfileCheck(effectiveProfile, user);
    } catch (error) {
      const rawMsg = (error?.message || "").toLowerCase();
      if (
        rawMsg.includes("invalid login credentials") ||
        rawMsg.includes("invalid credentials") ||
        rawMsg.includes("wrong password") ||
        rawMsg.includes("incorrect passcode")
      ) {
        setErrorMessage(
          "Incorrect 6-digit passcode. Please check your digits or sign in using Password or OTP."
        );
      } else {
        setErrorMessage(getAuthErrorMessage(error));
      }
    } finally {
      isHandlingPasswordLogin.current = false;
      setIsPasscodeSubmitting(false);
    }
  };

  const handleOtpSignIn = async () => {
    setErrorMessage("");
    setSuccessMessage("");
    setNoticeMessage("");

    const targetIdentifier = identifier.trim();
    if (!targetIdentifier) {
      setErrorMessage("Please enter your Gmail address to receive an OTP code.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetIdentifier)) {
      setErrorMessage("Please enter a valid Gmail / email address.");
      return;
    }

    setIsOtpSubmitting(true);
    try {
      const trimmedEmail = targetIdentifier.toLowerCase();
      await sendEmailOtp(trimmedEmail, { shouldCreateUser: false });

      setPendingOtp({
        channel: OTP_CHANNELS.EMAIL,
        email: trimmedEmail,
        purpose: OTP_PURPOSES.LOGIN,
      });

      navigate("/otp-verification");
    } catch (error) {
      setErrorMessage(
        `${getAuthErrorMessage(error)} Email OTP sign-in only works for registered accounts.`
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
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-[#E5EFF1] font-sans antialiased">
      <div className="relative hidden min-h-0 min-w-0 overflow-hidden bg-[#1F4E5A] p-12 text-white lg:flex lg:w-[48%] flex-col justify-between xl:p-16">
        <div className="absolute inset-0 bg-linear-to-br from-[#1F4E5A] via-[#286575] to-[#163a43] opacity-100 z-0"></div>
        <div className="absolute -top-20 -right-20 w-125 h-125 bg-[#34769B] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.25] z-0"></div>
        <div className="absolute -bottom-40 -left-20 w-150 h-150 bg-[#4C9F80] rounded-full mix-blend-screen filter blur-[140px] opacity-20 z-0"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-size-[32px_32px] z-0"></div>

        <div className="relative z-10 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center xl:h-16 xl:w-16 shrink-0 drop-shadow-md">
            <img
              src={citySeal}
              alt="City of Naga Seal"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="flex h-12 w-auto items-center justify-center xl:h-14 drop-shadow-md">
            <img
              src={nagaGarbo}
              alt="Naga Atong Garbo"
              className="h-full w-auto object-contain"
            />
          </div>
        </div>

        <div className="relative z-10 my-auto py-2 -translate-y-12 xl:-translate-y-16">
          <h1 className="mb-6 text-4xl font-extrabold leading-[1.15] tracking-tight xl:mb-8 xl:text-5xl">
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

          <p className="max-w-xl text-xs font-normal leading-relaxed text-teal-100/75 xl:text-[13px]">
            A centralized platform for managing medicine inventory, requests, forecasting,
            <br />
            and healthcare resource distribution across City of Naga facilities.
          </p>
        </div>

        <div className="relative z-10 text-sm text-teal-200/60 font-medium tracking-wide">
          &copy; 2026 City Health Office - City of Naga, Cebu. All rights reserved.
        </div>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[#E5EFF1]/60">
        <div className="flex min-h-full flex-1 flex-col justify-center">
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 md:px-12">
            <form
              className="my-auto w-full max-w-md rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] p-6 shadow-xl shadow-slate-200/50 sm:p-8 md:p-9"
              onSubmit={(e) =>
                loginMode === "passcode"
                  ? isPasscodeFieldVisible
                    ? handlePasscodeLogin(e)
                    : (e.preventDefault(), handleProceedToPasscode())
                  : handleLogin(e)
              }
            >
              <div className="mb-6 sm:mb-7 text-center">
                {/* Frameless PRDS Logo Emblem - No circle or badge container */}
                <img
                  src={prdsEmblem}
                  alt="PRDS Logo"
                  className="mx-auto mb-3 sm:mb-3.5 h-8 sm:h-9 w-auto object-contain"
                />

                {/* Heading */}
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#1B2B30]">
                  {loginMode === "passcode" ? "Log In with PIN" : "Log In"}
                </h2>

                {loginMode === "passcode" && isPasscodeFieldVisible && (
                  <p className="mt-2 text-xs sm:text-sm text-[#5B7077] flex items-center justify-center gap-1.5">
                    <span className="truncate max-w-[240px] font-medium text-[#1B2B30]">{identifier}</span>
                    <span className="text-[#5B7077]/40">&bull;</span>
                    <button
                      type="button"
                      onClick={handleResetPasscodeIdentifier}
                      className="font-bold text-[#1F4E5A] hover:text-[#286575] hover:underline cursor-pointer"
                    >
                      Change
                    </button>
                  </p>
                )}
              </div>

              {loginMode === "passcode" ? (
                <>
                  {!isPasscodeFieldVisible && (
                    <div className="mb-5">
                      <label
                        htmlFor="passcode-identifier"
                        className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#5B7077]"
                      >
                        Gmail Address
                      </label>
                      <div className="flex overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-2xs transition-all focus-within:border-[#1F4E5A] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
                        <div className="relative flex-1 flex items-center">
                          <div className="absolute left-3.5 pointer-events-none text-[#5B7077]">
                            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <input
                            id="passcode-identifier"
                            ref={identifierInputRef}
                            type="email"
                            placeholder="username@gmail.com"
                            value={identifier}
                            onChange={handleIdentifierChange}
                            onKeyDown={handleIdentifierKeyDown}
                            autoComplete="username"
                            required
                            className="w-full bg-transparent py-3 pl-10 pr-4 text-sm font-medium tracking-wide text-[#1B2B30] placeholder-[#5B7077]/60 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {isPasscodeFieldVisible && (
                    <div className="mb-5">
                      <div className="mb-2 flex items-center justify-between">
                        <label
                          id="passcode-cells-label"
                          className="block text-xs font-bold uppercase tracking-wider text-[#5B7077]"
                        >
                          Enter PIN
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPasscode((current) => !current)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1F4E5A] hover:text-[#183e47] transition-colors cursor-pointer"
                          aria-label={showPasscode ? "Hide PIN digits" : "Show PIN digits"}
                        >
                          <svg
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d={
                                showPasscode
                                  ? "M3 3l18 18M10.584 10.587A2 2 0 0012 14a2 2 0 001.414-.586M9.88 4.243A9.77 9.77 0 0112 4c4.478 0 8.268 2.943 9.542 7a9.975 9.975 0 01-3.043 4.426M6.228 6.228A9.984 9.984 0 002.458 11c1.274 4.057 5.065 7 9.542 7a9.96 9.96 0 004.132-.894"
                                  : "M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              }
                            />
                            {!showPasscode && (
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            )}
                          </svg>
                          <span>{showPasscode ? "Hide digits" : "Show digits"}</span>
                        </button>
                      </div>

                      <div
                        className="flex items-center justify-between gap-2 sm:gap-3 my-2"
                        role="group"
                        aria-labelledby="passcode-cells-label"
                      >
                        {passcodeDigits.map((digit, index) => {
                          const isFilled = Boolean(digit);
                          return (
                            <input
                              key={index}
                              id={index === 0 ? "login-passcode" : `login-passcode-${index}`}
                              ref={(el) => (passcodeInputRefs.current[index] = el)}
                              type={showPasscode ? "text" : "password"}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={PASSCODE_LENGTH}
                              value={digit}
                              onChange={(e) => handlePasscodeDigitChange(index, e.target.value)}
                              onKeyDown={(e) => handlePasscodeKeyDown(index, e)}
                              onPaste={handlePasscodePaste}
                              onFocus={(e) => e.target.select()}
                              onClick={(e) => e.target.select()}
                              disabled={isPasscodeSubmitting}
                              aria-label={`Digit ${index + 1} of ${PASSCODE_LENGTH}`}
                              autoComplete={index === 0 ? "current-password" : "off"}
                              className={`h-14 w-11 sm:h-16 sm:w-13 rounded-2xl border text-center text-xl sm:text-2xl font-bold tracking-tight text-[#1B2B30] shadow-2xs outline-none transition-all duration-150 ${isFilled
                                ? "border-[#1F4E5A] bg-white ring-1 ring-[#1F4E5A]/20"
                                : "border-[#CFDDE0] bg-[#F9FBFB] hover:border-[#1F4E5A]/40"
                                } focus:border-[#1F4E5A] focus:bg-white focus:ring-2 focus:ring-[#1F4E5A]/25 disabled:cursor-not-allowed disabled:bg-[#E5EFF1] disabled:opacity-60`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {errorMessage && (
                    <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700" role="alert">
                      {errorMessage}
                    </p>
                  )}

                  {successMessage && (
                    <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-sm font-semibold leading-6 text-emerald-800">
                        {successMessage}
                      </p>
                    </div>
                  )}

                  {(location.state?.oauthNotice || noticeMessage) && (
                    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-sm font-semibold leading-6 text-amber-800">
                        {location.state?.oauthNotice || noticeMessage}
                      </p>
                    </div>
                  )}

                  {isPasscodeFieldVisible ? (
                    <button
                      type="submit"
                      disabled={isPasscodeSubmitting || !identifier.trim() || passcode.length !== 6}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-xs transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
                    >
                      <span>{isPasscodeSubmitting ? "Logging in..." : "Log In with PIN"}</span>
                      <img
                        src={loginIcon}
                        alt=""
                        aria-hidden="true"
                        className="w-4 h-4 object-contain"
                      />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleProceedToPasscode}
                      disabled={!identifier.trim()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-xs transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
                    >
                      <span>Continue</span>
                      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setLoginMode("standard");
                      setErrorMessage("");
                    }}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] px-4 py-3 text-sm font-bold text-[#1B2B30] shadow-2xs transition hover:bg-[#EBF3F5] hover:border-[#1F4E5A]/40 active:scale-[0.99] cursor-pointer"
                  >
                    <svg
                      aria-hidden="true"
                      className="w-4 h-4 text-[#5B7077]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                      />
                    </svg>
                    <span>Back to Password</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-5">
                    <label
                      htmlFor="login-identifier"
                      className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#5B7077]"
                    >
                      Gmail Address
                    </label>
                    <div className="flex overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-2xs transition-all focus-within:border-[#1F4E5A] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
                      <div className="relative flex-1 flex items-center">
                        <div className="absolute left-3.5 pointer-events-none text-[#5B7077]">
                          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <input
                          id="login-identifier"
                          ref={identifierInputRef}
                          type="email"
                          placeholder="username@gmail.com"
                          value={identifier}
                          onChange={handleIdentifierChange}
                          autoComplete="username"
                          required
                          className="w-full bg-transparent py-3 pl-10 pr-4 text-sm font-medium tracking-wide text-[#1B2B30] placeholder-[#5B7077]/60 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label
                        htmlFor="login-password"
                        className="block text-xs font-bold uppercase tracking-wider text-[#5B7077]"
                      >
                        Password
                      </label>
                      <Link
                        to="/forgot-password"
                        className="text-xs font-bold text-[#1F4E5A] transition hover:text-[#286575] hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative flex overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-2xs transition-all focus-within:border-[#1F4E5A] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#5B7077]">
                        <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        required
                        className="w-full bg-transparent py-3 pl-10 pr-12 text-sm font-medium text-[#1B2B30] placeholder-[#5B7077]/60 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#5B7077] transition-colors hover:bg-slate-100 hover:text-[#1B2B30] cursor-pointer"
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
                    <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700" role="alert">
                      {errorMessage}
                    </p>
                  )}

                  {successMessage && (
                    <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-sm font-semibold leading-6 text-emerald-800">
                        {successMessage}
                      </p>
                    </div>
                  )}

                  {(location.state?.oauthNotice || noticeMessage) && (
                    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-sm font-semibold leading-6 text-amber-800">
                        {location.state?.oauthNotice || noticeMessage}
                      </p>
                      {showRegisterLink && (
                        <Link
                          to="/register"
                          className="btn-primary mt-3 inline-flex rounded-lg px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
                        >
                          Register account
                        </Link>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || isOtpSubmitting || lockoutRemainingSeconds > 0}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-xs transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
                  >
                    <span>
                      {lockoutRemainingSeconds > 0
                        ? `Locked (${lockoutRemainingSeconds}s)`
                        : isSubmitting
                          ? "Logging in..."
                          : "Log In"}
                    </span>
                    <img
                      src={loginIcon}
                      alt=""
                      aria-hidden="true"
                      className="w-4 h-4 object-contain"
                    />
                  </button>

                  <div className="my-5 sm:my-6 flex items-center">
                    <div className="grow border-t border-[#CFDDE0]"></div>
                    <span className="px-3.5 text-[11px] font-bold tracking-widest text-[#7A8F95] uppercase">
                      OR
                    </span>
                    <div className="grow border-t border-[#CFDDE0]"></div>
                  </div>

                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleSwitchToPasscodeMode}
                      className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#1F4E5A]/30 bg-[#E5EFF1]/50 py-3 text-sm font-bold text-[#1F4E5A] shadow-2xs transition hover:bg-[#E5EFF1] hover:border-[#1F4E5A] active:scale-[0.99] cursor-pointer"
                    >
                      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>Log in using PIN</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenGoogleModal}
                      disabled={isSubmitting}
                      className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] py-3 text-sm font-semibold text-[#1B2B30] shadow-xs transition hover:bg-[#EBF3F5] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
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
                  </div>
                </>
              )}

              <div className="mt-6 sm:mt-7 text-center text-sm font-medium text-[#5B7077]">
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/register")}
                  className="border-0 bg-transparent p-0 font-bold text-[#1F4E5A] transition hover:text-[#286575] hover:underline cursor-pointer"
                >
                  Register here
                </button>
              </div>
            </form>
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
                  className="btn-primary rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition cursor-pointer"
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
                className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#5B7077]"
              >
                Gmail / Google Account
              </label>
              <div className="flex overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-2xs transition-all focus-within:border-[#1F4E5A] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
                <div className="relative flex-1 flex items-center">
                  <div className="absolute left-3.5 pointer-events-none text-[#5B7077]">
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
                    className="w-full bg-transparent py-3 pl-10 pr-4 text-sm font-medium tracking-wide text-[#1B2B30] placeholder-[#5B7077]/60 focus:outline-none"
                  />
                </div>
              </div>

              {googleModalError && (
                <p className="mt-3 rounded-xl border border-[#faedf0] bg-[#faedf0] px-3.5 py-2.5 text-xs font-semibold leading-5 text-[#D9826B]" role="alert">
                  {googleModalError}
                </p>
              )}

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowGoogleModal(false)}
                  disabled={isGoogleSubmitting}
                  className="rounded-xl border border-[#CFDDE0] px-4 py-2.5 text-xs font-bold text-[#5B7077] hover:bg-[#F4F8F8] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGoogleSubmitting}
                  className="flex items-center gap-2 rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:brightness-105 transition disabled:opacity-70 cursor-pointer"
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
