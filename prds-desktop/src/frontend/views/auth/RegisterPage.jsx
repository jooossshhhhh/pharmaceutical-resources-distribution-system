import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  User,
  X,
} from "lucide-react";

import ModalShell from "@frontend/components/ModalShell";
import { useAuth } from "@frontend/context/useAuth";
import { supabase } from "@backend/client/supabase";
import {
  checkGoogleRegistrationProfile,
  getGoogleRegistrationOutcome,
  getPasswordStrength,
  MIN_PASSWORD_LENGTH,
  routeGoogleRegistrationProfile,
  sanitizeName,
  validateRegistrationFields,
} from "@shared/utils/authRegistrationUtils";
import { isChoFacility } from "@shared/utils/facilityUtils";
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
  const [isFacilityOpen, setIsFacilityOpen] = useState(false);
  const facilityDropdownRef = useRef(null);
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [facilities, setFacilities] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [oauthNotice, setOauthNotice] = useState(location.state?.oauthNotice || "");
  const visibleOauthNotice = supabaseUser?.id
    ? ""
    : location.state?.oauthNotice || oauthNotice;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [showActiveAccountModal, setShowActiveAccountModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [hasAgreedToTerms, setHasAgreedToTerms] = useState(false);
  const [googleAccountCheck, setGoogleAccountCheck] = useState({
    userId: null,
    status: "idle",
    profile: null,
  });
  const [googleAccountCheckAttempt, setGoogleAccountCheckAttempt] = useState(0);

  const isGoogleRegistration = Boolean(supabaseUser?.email);
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
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
    if (!isFacilityOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        facilityDropdownRef.current &&
        !facilityDropdownRef.current.contains(event.target)
      ) {
        setIsFacilityOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsFacilityOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFacilityOpen]);

  useEffect(() => {
    if (loading || !supabaseUser?.email || !supabaseUser.id) {
      return;
    }

    let isCurrent = true;
    const checkExistingGoogleProfile = async () => {
      try {
        const { profile: existingProfile } = await checkGoogleRegistrationProfile(
          supabaseUser.id,
          (id) => getProfileByIdForRegistration(id, supabaseUser.email),
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
  const selectedFacility = useMemo(() => {
    return facilities.find((item) => String(item.id) === String(facilityIdValue)) || null;
  }, [facilities, facilityIdValue]);
  const autoRole = selectedFacility
    ? (isChoFacility(selectedFacility) ? "PHARMA_I" : "BHW")
    : "";
  const roleValue =
    autoRole ||
    role ||
    (isGoogleRegistration && verifiedProfile?.role !== "PHARMA_II"
      ? verifiedProfile?.role || ""
      : "");

  const handleSelectFacility = (selectedFacility) => {
    if (!selectedFacility) {
      setFacilityId("");
      setRole("");
      return;
    }
    setFacilityId(selectedFacility.id);
    setRole(isChoFacility(selectedFacility) ? "PHARMA_I" : "BHW");
    setIsFacilityOpen(false);
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!isGoogleAccountCheckReady) {
      setErrorMessage("Verify the Gmail account before creating an account.");
      return;
    }

    const sanitizedFirstName = sanitizeName(firstNameValue);
    const sanitizedLastName = sanitizeName(lastNameValue);

    const sharedError = validateRegistrationFields({
      firstName: sanitizedFirstName,
      lastName: sanitizedLastName,
      phoneNumber,
      facilityId: facilityIdValue,
      facilities,
      role: roleValue,
      allowedRoles: roleOptions.map((option) => option.value),
      password,
      confirmPassword,
      isGoogleRegistration,
      options: { enforceComplexity: true },
    });

    if (sharedError) {
      setErrorMessage(sharedError);
      return;
    }

    if (!hasAgreedToTerms) {
      setErrorMessage("Please review and agree to the PRDS Terms of Service and System Usage Regulations.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isGoogleRegistration) {
        const { profile: existingProfile } = await checkGoogleRegistrationProfile(
          supabaseUser.id,
          (id) => getProfileByIdForRegistration(id, supabaseUser.email),
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
          firstName: sanitizedFirstName,
          lastName: sanitizedLastName,
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
        firstName: sanitizedFirstName,
        lastName: sanitizedLastName,
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
      <div className="relative hidden min-h-0 min-w-0 overflow-hidden bg-[#1d3f8c] p-8 text-white lg:flex lg:w-[44%] xl:w-[46%] flex-col justify-between xl:p-12">
        <div className="absolute inset-0 bg-linear-to-br from-[#1d3f8c] via-[#254fa8] to-[#0e1f47] opacity-100 z-0"></div>
        <div className="absolute -top-20 -right-20 w-125 h-125 bg-[#dc8939] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.15] z-0"></div>
        <div className="absolute -bottom-40 -left-20 w-150 h-150 bg-[#b53e53] rounded-full mix-blend-screen filter blur-[140px] opacity-20 z-0"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-size-[32px_32px] z-0"></div>

        <div className="relative z-10">
          <div className="mb-6 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white p-2 shadow-md xl:mb-8 xl:h-14 xl:w-14">
            <img
              src={prdsLogo}
              alt="PRDS Logo"
              className="w-full h-full object-contain"
            />
          </div>

          <h1 className="mb-4 text-3xl font-extrabold leading-[1.15] tracking-tight xl:mb-5 xl:text-4xl">
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

          <p className="max-w-md text-sm font-medium leading-relaxed text-blue-100/80 xl:text-base">
            Request access to the centralized medicine inventory and healthcare resource distribution platform.
          </p>
        </div>

        <div className="relative z-10 text-xs text-blue-200/60 font-medium tracking-wide">
          &copy; 2026 City Health Office - City of Naga, Cebu. All rights reserved.
        </div>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-slate-50/60">
        <div className="flex min-h-full flex-1 flex-col justify-between">
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-3 sm:px-6 md:px-8">
            <form
              className="my-auto w-full max-w-[535px] rounded-2xl border border-slate-200/90 bg-white p-5 shadow-lg shadow-slate-200/50 sm:p-6"
              onSubmit={handleRegister}
            >
              <div className="mb-4 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs lg:hidden">
                  <img src={prdsLogo} alt="PRDS Logo" className="h-full w-full object-contain" />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#008f68] ring-1 ring-emerald-500/20">
                  <ShieldCheck className="h-3 w-3 text-[#008f68]" />
                  PRDS Access
                </span>
                <h2 className="mt-1.5 text-xl font-black tracking-tight text-[#0d1117] sm:text-2xl">
                  Register Account
                </h2>
                {isGoogleRegistration ? (
                  <p className="mt-1 text-xs font-medium leading-4 text-slate-500">
                    Complete the required account details for{" "}
                    <span className="font-bold text-slate-700">
                      {supabaseUser.email}
                    </span>
                    .
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    Centralized pharmaceutical logistics and distribution platform
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label
                    htmlFor="register-first-name"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600"
                  >
                    First Name
                  </label>
                  <div className="group relative flex items-center rounded-xl border border-slate-200 bg-slate-50/70 shadow-xs transition-all duration-150 focus-within:border-[#008f68] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#6be9c2]/25">
                    <User className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-slate-400 transition-colors group-focus-within:text-[#008f68]" />
                    <input
                      id="register-first-name"
                      type="text"
                      value={firstNameValue}
                      onChange={(event) => setFirstName(event.target.value)}
                      onBlur={(event) => setFirstName(sanitizeName(event.target.value))}
                      autoComplete="given-name"
                      required
                      placeholder="First name"
                      className="w-full bg-transparent py-2 pl-9.5 pr-3 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="register-last-name"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600"
                  >
                    Last Name
                  </label>
                  <div className="group relative flex items-center rounded-xl border border-slate-200 bg-slate-50/70 shadow-xs transition-all duration-150 focus-within:border-[#008f68] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#6be9c2]/25">
                    <User className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-slate-400 transition-colors group-focus-within:text-[#008f68]" />
                    <input
                      id="register-last-name"
                      type="text"
                      value={lastNameValue}
                      onChange={(event) => setLastName(event.target.value)}
                      onBlur={(event) => setLastName(sanitizeName(event.target.value))}
                      autoComplete="family-name"
                      required
                      placeholder="Last name"
                      className="w-full bg-transparent py-2 pl-9.5 pr-3 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                  </div>
                </div>
              </div>

              {isGoogleRegistration && !isGoogleAccountCheckReady && (
                <div
                  className={`mt-2.5 rounded-xl border px-3.5 py-2 text-xs font-medium leading-5 ${
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

              <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 sm:items-start">
                {!isGoogleRegistration ? (
                  <div>
                    <label
                      htmlFor="register-phone"
                      className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600"
                    >
                      Phone Number
                    </label>
                    <div className="group relative flex items-center rounded-xl border border-slate-200 bg-slate-50/70 shadow-xs transition-all duration-150 focus-within:border-[#008f68] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#6be9c2]/25">
                      <Smartphone className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-slate-400 transition-colors group-focus-within:text-[#008f68]" />
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
                        className="w-full bg-transparent py-2 pl-9.5 pr-3 text-xs sm:text-sm font-medium tracking-wide text-slate-900 placeholder:text-slate-400 outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Gmail Account
                    </label>
                    <div className="flex items-center truncate rounded-xl border border-slate-200 bg-slate-100/70 px-3 py-2 text-xs font-semibold text-slate-800 shadow-xs">
                      <User className="mr-2 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{supabaseUser.email}</span>
                    </div>
                  </div>
                )}

                <div ref={facilityDropdownRef} className="relative">
                  <label
                    htmlFor="register-facility"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600"
                  >
                    Health Center / Facility
                  </label>
                  <button
                    id="register-facility"
                    type="button"
                    onClick={() => setIsFacilityOpen((prev) => !prev)}
                    aria-expanded={isFacilityOpen}
                    aria-haspopup="listbox"
                    className={`group relative flex w-full items-center rounded-xl border bg-slate-50/70 shadow-xs transition-all duration-150 py-2 pl-9.5 pr-8 text-left text-xs sm:text-sm font-medium outline-none cursor-pointer ${
                      isFacilityOpen
                        ? "border-[#008f68] bg-white ring-2 ring-[#6be9c2]/25"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-100/50 focus:border-[#008f68] focus:bg-white focus:ring-2 focus:ring-[#6be9c2]/25"
                    }`}
                  >
                    <Building2
                      className={`pointer-events-none absolute left-3.5 h-3.5 w-3.5 transition-colors ${
                        isFacilityOpen ? "text-[#008f68]" : "text-slate-400 group-focus:text-[#008f68]"
                      }`}
                    />
                    <span
                      className={`block truncate ${
                        selectedFacility ? "text-slate-900 font-semibold" : "text-slate-400"
                      }`}
                    >
                      {selectedFacility ? selectedFacility.facility_name : "Select facility"}
                    </span>
                    <ChevronDown
                      className={`pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                        isFacilityOpen ? "rotate-180 text-[#008f68]" : ""
                      }`}
                    />
                  </button>

                  {isFacilityOpen && (
                    <div
                      role="listbox"
                      aria-label="Health Center / Facility"
                      className="absolute left-0 right-0 top-full z-40 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg shadow-slate-200/60 transition-all duration-150 prds-modal-scrollbar"
                    >
                      {facilities.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-400">Loading facilities...</div>
                      ) : (
                        facilities.map((facility) => {
                          const isSelected = String(facility.id) === String(facilityIdValue);
                          return (
                            <button
                              key={facility.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => handleSelectFacility(facility)}
                              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-emerald-50 text-[#008f68] font-bold"
                                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                              }`}
                            >
                              <span className="truncate">{facility.facility_name}</span>
                              {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#008f68]" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                  <input type="hidden" name="facility_id" value={facilityIdValue} />
                  <input type="hidden" id="register-role" value={roleValue} readOnly />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label
                    htmlFor="register-password"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600"
                  >
                    Password
                  </label>
                  <div className="group relative flex items-center rounded-xl border border-slate-200 bg-slate-50/70 shadow-xs transition-all duration-150 focus-within:border-[#008f68] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#6be9c2]/25">
                    <Lock className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-slate-400 transition-colors group-focus-within:text-[#008f68]" />
                    <input
                      id="register-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      placeholder="••••••••••••"
                      className="w-full bg-transparent py-2 pl-9.5 pr-8 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-2 flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="register-confirm-password"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600"
                  >
                    Confirm Password
                  </label>
                  <div className="group relative flex items-center rounded-xl border border-slate-200 bg-slate-50/70 shadow-xs transition-all duration-150 focus-within:border-[#008f68] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#6be9c2]/25">
                    <Lock className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-slate-400 transition-colors group-focus-within:text-[#008f68]" />
                    <input
                      id="register-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      placeholder="••••••••••••"
                      className="w-full bg-transparent py-2 pl-9.5 pr-8 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      className="absolute right-2 flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600"
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {password.length > 0 && (
                <div className="mt-2 space-y-1 rounded-xl border border-slate-200/70 bg-slate-50/80 p-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-500">Security strength:</span>
                    <span
                      className={`font-black ${
                        passwordStrength.level === "strong"
                          ? "text-emerald-600"
                          : passwordStrength.level === "fair"
                            ? "text-amber-600"
                            : "text-rose-600"
                      }`}
                    >
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 h-1">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        passwordStrength.level === "weak"
                          ? "bg-rose-500"
                          : passwordStrength.level === "fair"
                            ? "bg-amber-500"
                            : passwordStrength.level === "strong"
                              ? "bg-emerald-500"
                              : "bg-slate-200"
                      }`}
                    />
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        passwordStrength.level === "fair"
                          ? "bg-amber-500"
                          : passwordStrength.level === "strong"
                            ? "bg-emerald-500"
                            : "bg-slate-200"
                      }`}
                    />
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        passwordStrength.level === "strong"
                          ? "bg-emerald-500"
                          : "bg-slate-200"
                      }`}
                    />
                  </div>
                </div>
              )}

              <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5 transition-colors hover:bg-slate-50">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    id="register-terms-consent"
                    checked={hasAgreedToTerms}
                    onChange={(e) => {
                      setHasAgreedToTerms(e.target.checked);
                      if (e.target.checked && errorMessage.includes("Terms")) {
                        setErrorMessage("");
                      }
                    }}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-[#008f68]"
                  />
                  <span className="text-[11px] leading-4 text-slate-600 select-none">
                    I have read and agree to the{" "}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="font-bold text-[#008f68] underline decoration-emerald-500/50 underline-offset-2 hover:text-emerald-700 cursor-pointer"
                    >
                      PRDS Terms of Service
                    </button>{" "}
                    and{" "}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="font-bold text-[#008f68] underline decoration-emerald-500/50 underline-offset-2 hover:text-emerald-700 cursor-pointer"
                    >
                      System Usage Regulations
                    </button>
                    .
                  </span>
                </label>
              </div>

              {errorMessage && !isGoogleAccountCheckFailed && (
                <div
                  className="mt-2.5 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-semibold leading-5 text-red-700"
                  role="alert"
                >
                  <p>{errorMessage}</p>
                  {!isGoogleRegistration && (errorMessage.includes("SMS") || errorMessage.includes("Twilio") || errorMessage.includes("provider")) && (
                    <button
                      type="button"
                      onClick={handleGoogleRegister}
                      disabled={isSubmitting || isGoogleSubmitting}
                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-900 transition hover:bg-red-200 cursor-pointer"
                    >
                      <span>Use Google Registration Instead</span>
                      <span aria-hidden="true">&rarr;</span>
                    </button>
                  )}
                </div>
              )}

              {visibleOauthNotice && (
                <p className="mt-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium leading-5 text-emerald-800" role="status">
                  {visibleOauthNotice}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !isGoogleAccountCheckReady}
                className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs sm:text-sm font-bold tracking-wide text-white shadow-sm shadow-slate-900/10 transition-all duration-150 hover:bg-slate-800 hover:shadow-md hover:shadow-slate-900/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4 text-[#6be9c2]" />
                <span>{isSubmitting ? "Creating Account..." : "Create Account"}</span>
              </button>

              {!isGoogleRegistration && (
                <>
                  <div className="my-2.5 flex items-center">
                    <div className="grow border-t border-gray-200"></div>
                    <span className="px-3 text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                      OR
                    </span>
                    <div className="grow border-t border-gray-200"></div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleRegister}
                    disabled={isSubmitting || isGoogleSubmitting}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-white py-2.5 text-xs sm:text-sm font-semibold text-slate-700 shadow-xs transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
                  >
                    <svg aria-hidden="true" className="w-3.5 h-3.5" viewBox="0 0 24 24">
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

              <div className="mt-2.5 text-center text-xs font-medium text-slate-500">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={handleGoToSignIn}
                  className="font-bold text-[#1d3f8c] hover:text-[#008f68] hover:underline cursor-pointer"
                >
                  Sign in
                </button>
              </div>
            </form>
          </div>

          <div className="relative flex shrink-0 w-full select-none items-center justify-between border-t border-slate-200/70 bg-white px-6 py-2.5 md:px-10">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-px bg-slate-200 hidden md:block"></div>

            <div className="h-7 w-7 opacity-60 grayscale filter transition-all duration-200 hover:opacity-100 hover:grayscale-0">
              <img
                src={citySeal}
                alt="City of Naga Seal"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="h-7 w-7 opacity-60 grayscale filter transition-all duration-200 hover:opacity-100 hover:grayscale-0">
              <img
                src={nagaGarbo}
                alt="Naga Atong Garbo"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
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

        {showTermsModal && (
          <ModalShell
            labelledBy="terms-modal-title"
            onClose={() => setShowTermsModal(false)}
            panelClassName="w-full max-w-2xl px-4 sm:px-0"
          >
            <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl">
              <div className="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#008f68] ring-1 ring-emerald-500/20">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 id="terms-modal-title" className="text-base font-bold text-slate-900">
                      PRDS Terms of Service & System Usage Regulations
                    </h2>
                    <p className="text-xs font-medium text-slate-500">
                      City Health Office &bull; City of Naga, Cebu
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition cursor-pointer"
                  aria-label="Close terms modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="prds-modal-scrollbar max-h-[60vh] w-full space-y-4 overflow-y-auto px-6 py-5 text-xs text-slate-600 leading-relaxed">
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-blue-900">
                  <p className="font-bold flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-blue-700" />
                    Official Notice for Healthcare & Logistics Personnel:
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-blue-800">
                    The Pharmaceutical Resources Distribution System (PRDS) manages official pharmaceutical inventories and distribution channels for the City of Naga. Access is subject to government compliance and statutory accountability.
                  </p>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-700">1</span>
                    Authorized Scope & Account Eligibility
                  </h3>
                  <p className="pl-7 text-slate-600">
                    Access is exclusively limited to authorized City Health Office (CHO) healthcare professionals and accredited Barangay Health Workers (BHWs). User accounts are non-transferable and must only be utilized within designated official duties.
                  </p>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-700">2</span>
                    Pharmaceutical Stewardship & Accountability
                  </h3>
                  <p className="pl-7 text-slate-600">
                    All medicine requests, batch receipts, stock returns, and dispensing transactions constitute official municipal health records. Personnel are directly responsible for ensuring accuracy in recorded quantities, batch numbers, and expiration dates. Falsification, diversion, or unauthorized movement of public medicines is subject to civil, administrative, and criminal liability.
                  </p>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-700">3</span>
                    Data Privacy & Patient Confidentiality (R.A. 10173)
                  </h3>
                  <p className="pl-7 text-slate-600">
                    In strict compliance with Republic Act No. 10173 (Data Privacy Act of 2012), all patient records, medical conditions, and dispensing logs accessed via PRDS are treated with the highest degree of confidentiality. Any unauthorized viewing, copying, or external dissemination is strictly prohibited.
                  </p>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-700">4</span>
                    Digital Audit Logs & Security Integrity
                  </h3>
                  <p className="pl-7 text-slate-600">
                    PRDS maintains immutable system audit logs that track every session, stock alteration, approval, and dispensing record with user identifiers and timestamps. Users must keep login credentials secure and immediately report compromised accounts.
                  </p>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-700">5</span>
                    Administrative Review & Access Verification
                  </h3>
                  <p className="pl-7 text-slate-600">
                    Submitting this registration places the account in a <strong>Pending Approval</strong> state. Full system access will only be granted following official verification by the CHO Chief Pharmacist or Designated Administrator.
                  </p>
                </div>
              </div>

              <div className="flex w-full items-center justify-between border-t border-slate-100 bg-slate-50/80 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setHasAgreedToTerms(true);
                    setShowTermsModal(false);
                    if (errorMessage.includes("Terms")) {
                      setErrorMessage("");
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#008f68] px-5 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-[#007a58] transition active:scale-[0.99] cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  <span>I Understand & Agree</span>
                </button>
              </div>
            </div>
          </ModalShell>
        )}
      </div>
    </div>
  );
}
