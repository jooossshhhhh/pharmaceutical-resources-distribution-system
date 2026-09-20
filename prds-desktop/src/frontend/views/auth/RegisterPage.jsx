import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@frontend/context/useAuth";
import { supabase } from "@backend/client/supabase";
import {
  checkGoogleRegistrationProfile,
  getGoogleRegistrationOutcome,
  MIN_PASSWORD_LENGTH,
  routeGoogleRegistrationProfile,
  validateRegistrationFields,
} from "@shared/utils/authRegistrationUtils";
import {
  getAuthErrorMessage,
  logoutUser,
  normalizePhoneNumber,
  signInWithGoogle,
  signUpWithPhonePassword,
  updateUserPassword,
} from "@backend/services/auth/authService";
import {
  PHONE_OTP_PURPOSES,
  setPendingPhoneOtp,
} from "@backend/services/auth/pendingPhoneOtpStore";
import {
  createGoogleProfile,
  getProfileByIdForRegistration,
} from "@backend/services/auth/profileService";
import citySeal from "@frontend/assets/city-of-naga-seal.png";
import nagaGarbo from "@frontend/assets/naga-atong-garbo.png";
import prdsLogo from "@frontend/assets/prds-logo-main.svg";

const roleOptions = [
  { value: "PHARMA_I", label: "Pharmacist I" },
  { value: "BHW", label: "Barangay Health Worker" },
];

export default function RegisterPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading, profile, refreshProfile, supabaseUser } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [facilities, setFacilities] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [oauthNotice, setOauthNotice] = useState(location.state?.oauthNotice || "");
  const visibleOauthNotice = supabaseUser?.id
    ? ""
    : location.state?.oauthNotice || oauthNotice;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [showActiveAccountModal, setShowActiveAccountModal] = useState(false);
  const [googleAccountCheck, setGoogleAccountCheck] = useState({
    userId: null,
    status: "idle",
    profile: null,
  });
  const [googleAccountCheckAttempt, setGoogleAccountCheckAttempt] = useState(0);

  const isGoogleRegistration = Boolean(supabaseUser?.email);
  const verifiedProfile =
    googleAccountCheck.userId === supabaseUser?.id
      ? googleAccountCheck.profile
      : profile;
  const isGoogleAccountCheckReady =
    !isGoogleRegistration ||
    (googleAccountCheck.userId === supabaseUser?.id &&
      googleAccountCheck.status === "ready");
  const isGoogleAccountCheckFailed =
    isGoogleRegistration &&
    googleAccountCheck.userId === supabaseUser?.id &&
    googleAccountCheck.status === "error";
  const defaultNames = useMemo(() => {
    const metadata = supabaseUser?.user_metadata || {};
    const fullName = metadata.full_name || metadata.name || "";
    const [defaultFirstName = "", ...lastNameParts] = fullName.trim().split(" ");

    return {
      firstName: defaultFirstName,
      lastName: lastNameParts.join(" "),
    };
  }, [supabaseUser]);

  useEffect(() => {
    const loadFacilities = async () => {
      const { data, error } = await supabase
        .from("facilities")
        .select("id, facility_name, facility_code, status")
        .eq("status", "ACTIVE")
        .order("facility_name", { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setFacilities(data || []);
    };

    loadFacilities();
  }, []);

  useEffect(() => {
    if (loading || !supabaseUser?.email || !supabaseUser.id) {
      return;
    }

    let isCurrent = true;
    const checkExistingGoogleProfile = async () => {
      try {
        const { profile: existingProfile } = await checkGoogleRegistrationProfile(
          supabaseUser.id,
          getProfileByIdForRegistration,
        );
        if (!isCurrent) {
          return;
        }

        const routeResult = await routeGoogleRegistrationProfile(existingProfile, {
          logout: logoutUser,
          navigate,
        });
        if (routeResult === "active") {
          setShowActiveAccountModal(true);
          return;
        }
        if (routeResult) {
          return;
        }

        setGoogleAccountCheck({
          userId: supabaseUser.id,
          status: "ready",
          profile: existingProfile,
        });
      } catch (error) {
        if (isCurrent) {
          setGoogleAccountCheck({
            userId: supabaseUser.id,
            status: "error",
            profile: null,
          });
          setErrorMessage(getAuthErrorMessage(error));
        }
      }
    };

    checkExistingGoogleProfile();

    return () => {
      isCurrent = false;
    };
  }, [loading, navigate, supabaseUser?.email, supabaseUser?.id, googleAccountCheckAttempt]);

  const firstNameValue =
    firstName || (isGoogleRegistration ? verifiedProfile?.first_name || defaultNames.firstName : "");
  const lastNameValue =
    lastName || (isGoogleRegistration ? verifiedProfile?.last_name || defaultNames.lastName : "");
  const facilityIdValue =
    facilityId || (isGoogleRegistration ? verifiedProfile?.facility_id || "" : "");
  const roleValue =
    role ||
    (isGoogleRegistration && verifiedProfile?.role !== "PHARMA_II"
      ? verifiedProfile?.role || ""
      : "");

  const handleRegister = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!isGoogleAccountCheckReady) {
      setErrorMessage("Verify the Gmail account before creating an account.");
      return;
    }

    const sharedError = validateRegistrationFields({
      firstName: firstNameValue,
      lastName: lastNameValue,
      phoneNumber,
      facilityId: facilityIdValue,
      facilities,
      role: roleValue,
      allowedRoles: roleOptions.map((option) => option.value),
      password,
      confirmPassword,
      isGoogleRegistration,
    });

    if (sharedError) {
      setErrorMessage(sharedError);
      return;
    }

    setIsSubmitting(true);

    try {
      if (isGoogleRegistration) {
        const { profile: existingProfile } = await checkGoogleRegistrationProfile(
          supabaseUser.id,
          getProfileByIdForRegistration,
        );
        const routeResult = await routeGoogleRegistrationProfile(existingProfile, {
          logout: logoutUser,
          navigate,
        });
        if (routeResult === "active") {
          setShowActiveAccountModal(true);
          return;
        }
        if (routeResult) {
          return;
        }

        if (getGoogleRegistrationOutcome(existingProfile) === "invalid-status") {
          throw new Error("Unable to verify this account's status. Please contact a PRDS administrator.");
        }

        await updateUserPassword(password);
        await createGoogleProfile({
          email: supabaseUser.email,
          facilityId: facilityIdValue,
          firstName: firstNameValue,
          lastName: lastNameValue,
          role: roleValue,
          userId: supabaseUser.id,
        });
        await refreshProfile();
        navigate("/pending-approval", { replace: true });
        return;
      }

      const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
      await signUpWithPhonePassword({
        phoneNumber: normalizedPhoneNumber,
        password,
      });

      setPendingPhoneOtp({
        purpose: PHONE_OTP_PURPOSES.REGISTRATION,
        firstName: firstNameValue,
        lastName: lastNameValue,
        facilityId: facilityIdValue,
        phoneNumber: normalizedPhoneNumber,
        role: roleValue,
      });

      navigate("/otp-verification");
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleRegister = async () => {
    setErrorMessage("");
    setOauthNotice("");
    if (location.state?.oauthNotice) {
      navigate(location.pathname, { replace: true, state: null });
    }
    setIsGoogleSubmitting(true);

    try {
      await signInWithGoogle("/register");
      setOauthNotice("Google opened in your browser. Complete sign-in there, or use the browser's Back button to return here.");
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleGoToSignIn = async () => {
    if (supabaseUser) {
      await logoutUser();
    }

    navigate("/", { replace: true });
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
            Request access to the centralized medicine inventory and healthcare resource distribution platform.
          </p>
        </div>

        <div className="relative z-10 text-sm text-blue-200/60 font-medium tracking-wide">
          &copy; 2026 City Health Office - City of Naga, Cebu. All rights reserved.
        </div>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white">
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-5 md:px-10">
          <form
            className="w-full max-w-xl rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-xl shadow-slate-200/70 md:p-6"
            onSubmit={handleRegister}
          >
      <div className="mb-5 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e5e7eb] bg-white p-2 shadow-sm lg:hidden">
                <img src={prdsLogo} alt="PRDS Logo" className="h-full w-full object-contain" />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#008f68]">
                PRDS Access
              </p>
              <h2 className="mt-1 text-3xl font-black tracking-tight text-[#0d1117]">
                Register Account
              </h2>
            {isGoogleRegistration && (
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                  Complete the required account details for{" "}
                  <span className="font-bold text-slate-700">
                    {supabaseUser.email}
                  </span>
                  .
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="register-first-name"
                  className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600"
                >
                  First Name
                </label>
                <input
                  id="register-first-name"
                  type="text"
                  value={firstNameValue}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-[#008f68] focus:ring-2 focus:ring-[#6be9c2]/35"
                />
              </div>

              <div>
                <label
                  htmlFor="register-last-name"
                  className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600"
                >
                  Last Name
                </label>
                <input
                  id="register-last-name"
                  type="text"
                  value={lastNameValue}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-[#008f68] focus:ring-2 focus:ring-[#6be9c2]/35"
                />
              </div>
            </div>

            {isGoogleRegistration && !isGoogleAccountCheckReady && (
              <div
                className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium leading-6 ${
                  isGoogleAccountCheckFailed
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-blue-200 bg-blue-50 text-blue-800"
                }`}
                role={isGoogleAccountCheckFailed ? "alert" : "status"}
              >
                {isGoogleAccountCheckFailed
                  ? errorMessage || "Could not verify this Gmail account. Try again before creating an account."
                  : "Checking whether this Gmail is already registered..."}
                {isGoogleAccountCheckFailed && (
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage("");
                      setGoogleAccountCheckAttempt((attempt) => attempt + 1);
                    }}
                    className="ml-2 font-bold underline"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {!isGoogleRegistration ? (
              <div className="mt-4">
                <label
                  htmlFor="register-phone"
                  className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600"
                >
                  Phone Number
                </label>
                <div className="relative flex overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm transition-all focus-within:border-[#008f68] focus-within:ring-2 focus-within:ring-[#6be9c2]/35">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    id="register-phone"
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
                    className="w-full bg-transparent py-3 pl-10 pr-4 text-sm font-medium tracking-wide text-gray-900 placeholder-gray-300 outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Gmail
                </label>
                <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900">
                  {supabaseUser.email}
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="register-facility"
                  className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600"
                >
                  Facility
                </label>
                <select
                  id="register-facility"
                  value={facilityIdValue}
                  onChange={(event) => setFacilityId(event.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-[#008f68] focus:ring-2 focus:ring-[#6be9c2]/35"
                >
                  <option value="">Select facility</option>
                  {facilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.facility_name} ({facility.facility_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="register-role"
                  className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600"
                >
                  Role
                </label>
                <select
                  id="register-role"
                  value={roleValue}
                  onChange={(event) => setRole(event.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-[#008f68] focus:ring-2 focus:ring-[#6be9c2]/35"
                >
                  <option value="">Select role</option>
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="register-password"
                  className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="register-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onFocus={() => setIsPasswordFocused(true)}
                    onBlur={() => setIsPasswordFocused(false)}
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-12 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-[#008f68] focus:ring-2 focus:ring-[#6be9c2]/35"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d={showPassword ? "M3 3l18 18M10.584 10.587A2 2 0 0012 14a2 2 0 001.414-.586M9.88 4.243A9.77 9.77 0 0112 4c4.478 0 8.268 2.943 9.542 7a9.975 9.975 0 01-3.043 4.426M6.228 6.228A9.984 9.984 0 002.458 11c1.274 4.057 5.065 7 9.542 7a9.96 9.96 0 004.132-.894" : "M15 12a3 3 0 11-6 0 3 3 0 016 0z"} />
                      {!showPassword && (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      )}
                    </svg>
                  </button>
                </div>
                <div className="mt-1 min-h-8" aria-live="polite">
                  {(isPasswordFocused || password.length > 0) && (
                    <p className="text-xs font-medium text-slate-500">
                      {password.length >= MIN_PASSWORD_LENGTH
                        ? "Minimum length met."
                        : `Use at least ${MIN_PASSWORD_LENGTH} characters (${MIN_PASSWORD_LENGTH - password.length} more). Passphrases are accepted.`}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="register-confirm-password"
                  className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="register-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-12 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-[#008f68] focus:ring-2 focus:ring-[#6be9c2]/35"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d={showConfirmPassword ? "M3 3l18 18M10.584 10.587A2 2 0 0012 14a2 2 0 001.414-.586M9.88 4.243A9.77 9.77 0 0112 4c4.478 0 8.268 2.943 9.542 7a9.975 9.975 0 01-3.043 4.426M6.228 6.228A9.984 9.984 0 002.458 11c1.274 4.057 5.065 7 9.542 7a9.96 9.96 0 004.132-.894" : "M15 12a3 3 0 11-6 0 3 3 0 016 0z"} />
                      {!showConfirmPassword && (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      )}
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {errorMessage && !isGoogleAccountCheckFailed && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700" role="alert">
                {errorMessage}
              </p>
            )}

            {visibleOauthNotice && (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium leading-6 text-emerald-800" role="status">
                {visibleOauthNotice}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !isGoogleAccountCheckReady}
              className="mt-5 flex w-full items-center justify-center rounded-xl bg-black px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-md shadow-slate-900/10 transition-all duration-150 hover:bg-[#0d1117] hover:shadow-lg hover:shadow-slate-900/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Creating Account" : "Create Account"}
            </button>

            {!isGoogleRegistration && (
              <>
                <div className="my-4 flex items-center">
                  <div className="grow border-t border-gray-200"></div>
                  <span className="px-4 text-xs font-bold tracking-wider text-gray-400 uppercase">
                    OR
                  </span>
                  <div className="grow border-t border-gray-200"></div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleRegister}
                  disabled={isSubmitting || isGoogleSubmitting}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
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
                  {isGoogleSubmitting ? "Opening Google" : "Register with Google"}
                </button>
              </>
            )}

            <div className="mt-5 text-center text-sm font-medium text-gray-500">
              Already have an account?{" "}
              <button
                type="button"
                onClick={handleGoToSignIn}
                className="font-bold text-[#1d3f8c] hover:text-[#008f68] hover:underline"
              >
                Sign in
              </button>
            </div>
          </form>
        </div>

        {showActiveAccountModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-5 backdrop-blur-sm"
            role="presentation"
          >
            <section
              aria-labelledby="active-account-title"
              aria-describedby="active-account-message"
              aria-modal="true"
              className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl"
              role="dialog"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#008f68]">
                PRDS Account
              </p>
              <h2 id="active-account-title" className="mt-2 text-xl font-bold text-[#0d1117]">
                Account already active
              </h2>
              <p id="active-account-message" className="mt-3 text-sm leading-6 text-slate-600">
                {supabaseUser?.email ? `${supabaseUser.email} is` : "This Gmail is"} already registered and active. Sign in to continue.
              </p>
              <button
                type="button"
                onClick={() => navigate("/", { replace: true })}
                className="mt-6 flex w-full items-center justify-center rounded-lg bg-[#0d1117] px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#008f68] focus:ring-offset-2"
              >
                Go to Login
              </button>
            </section>
          </div>
        )}

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
    </div>
  );
}
