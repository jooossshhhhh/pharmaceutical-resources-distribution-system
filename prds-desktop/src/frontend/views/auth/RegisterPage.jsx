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
  Mail,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  User,
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
  updateUserPassword,
} from "@backend/services/auth/authService";
import {
  createGoogleProfile,
  getProfileByIdForRegistration,
} from "@backend/services/auth/profileService";
import citySeal from "@frontend/assets/city-of-naga-seal.png";
import nagaGarbo from "@frontend/assets/naga-atong-garbo.png";
import prdsEmblem from "@frontend/assets/prds-emblem.svg";
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
  const [email, setEmail] = useState("");
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
      email,
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
          phoneNumber: phoneNumber ? normalizePhoneNumber(phoneNumber) : null,
          role: roleValue,
          userId: supabaseUser.id,
        });
        await refreshProfile();
        navigate("/pending-approval", { replace: true });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const normalizedPhoneNumber = phoneNumber ? normalizePhoneNumber(phoneNumber) : null;

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (signUpError) {
        throw signUpError;
      }

      if (signUpData?.user?.id) {
        await createGoogleProfile({
          email: cleanEmail,
          facilityId: facilityIdValue,
          firstName: sanitizedFirstName,
          lastName: sanitizedLastName,
          phoneNumber: normalizedPhoneNumber,
          role: roleValue,
          userId: signUpData.user.id,
        });
      }

      await refreshProfile();
      navigate("/pending-approval", { replace: true });
      return;
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
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-6 sm:px-6 md:px-8">
            <form
              className="my-auto w-full max-w-[535px] rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] p-6 shadow-xl shadow-slate-200/50 sm:p-7 md:p-8"
              onSubmit={handleRegister}
            >
              <div className="mb-5 sm:mb-6 text-center">
                {/* Frameless PRDS Logo Emblem - Matching Login Page */}
                <img
                  src={prdsEmblem}
                  alt="PRDS Logo"
                  className="mx-auto mb-2 sm:mb-2.5 h-8 sm:h-9 w-auto object-contain"
                />

                {/* Heading */}
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#1B2B30]">
                  Register Account
                </h2>
                {isGoogleRegistration && (
                  <p className="mt-1 text-xs font-medium leading-4 text-slate-500">
                    Complete the required account details for{" "}
                    <span className="font-bold text-slate-700">
                      {supabaseUser.email}
                    </span>
                    .
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label
                    htmlFor="register-first-name"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#5B7077]"
                  >
                    First Name
                  </label>
                  <div className="group relative flex items-center rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs transition-all duration-150 focus-within:border-[#1F4E5A] focus-within:bg-[#F9FBFB] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
                    <User className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-[#5B7077] transition-colors group-focus-within:text-[#1F4E5A]" />
                    <input
                      id="register-first-name"
                      type="text"
                      value={firstNameValue}
                      onChange={(event) => setFirstName(event.target.value)}
                      onBlur={(event) => setFirstName(sanitizeName(event.target.value))}
                      autoComplete="given-name"
                      required
                      placeholder="First name"
                      className="w-full bg-transparent py-2 pl-9.5 pr-3 text-xs sm:text-sm font-medium text-[#1B2B30] placeholder:text-[#5B7077]/60 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="register-last-name"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#5B7077]"
                  >
                    Last Name
                  </label>
                  <div className="group relative flex items-center rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs transition-all duration-150 focus-within:border-[#1F4E5A] focus-within:bg-[#F9FBFB] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
                    <User className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-[#5B7077] transition-colors group-focus-within:text-[#1F4E5A]" />
                    <input
                      id="register-last-name"
                      type="text"
                      value={lastNameValue}
                      onChange={(event) => setLastName(event.target.value)}
                      onBlur={(event) => setLastName(sanitizeName(event.target.value))}
                      autoComplete="family-name"
                      required
                      placeholder="Last name"
                      className="w-full bg-transparent py-2 pl-9.5 pr-3 text-xs sm:text-sm font-medium text-[#1B2B30] placeholder:text-[#5B7077]/60 outline-none"
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
                  <>
                    <div>
                      <label
                        htmlFor="register-email"
                        className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#5B7077]"
                      >
                        Gmail Address
                      </label>
                      <div className="group relative flex items-center rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs transition-all duration-150 focus-within:border-[#1F4E5A] focus-within:bg-[#F9FBFB] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
                        <Mail className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-[#5B7077] transition-colors group-focus-within:text-[#1F4E5A]" />
                        <input
                          id="register-email"
                          type="email"
                          placeholder="name@gmail.com"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          autoComplete="email"
                          required
                          className="w-full bg-transparent py-2 pl-9.5 pr-3 text-xs sm:text-sm font-medium text-[#1B2B30] placeholder:text-[#5B7077]/60 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="register-phone"
                        className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#5B7077]"
                      >
                        Phone Number <span className="text-[10px] font-normal lowercase tracking-normal text-[#5B7077]">(optional)</span>
                      </label>
                      <div className="group relative flex items-center rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs transition-all duration-150 focus-within:border-[#1F4E5A] focus-within:bg-[#F9FBFB] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
                        <Smartphone className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-[#5B7077] transition-colors group-focus-within:text-[#1F4E5A]" />
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
                          className="w-full bg-transparent py-2 pl-9.5 pr-3 text-xs sm:text-sm font-medium tracking-wide text-[#1B2B30] placeholder:text-[#5B7077]/60 outline-none"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#5B7077]">
                        Gmail Account
                      </label>
                      <div className="flex items-center truncate rounded-xl border border-[#CFDDE0] bg-[#F4F8F8] px-3 py-2 text-xs font-semibold text-[#1B2B30] shadow-xs">
                        <User className="mr-2 h-3.5 w-3.5 shrink-0 text-[#5B7077]" />
                        <span className="truncate">{supabaseUser.email}</span>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="register-phone-optional"
                        className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#5B7077]"
                      >
                        Phone Number <span className="text-[10px] font-normal lowercase tracking-normal text-[#5B7077]">(optional)</span>
                      </label>
                      <div className="group relative flex items-center rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs transition-all duration-150 focus-within:border-[#1F4E5A] focus-within:bg-[#F9FBFB] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
                        <Smartphone className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-[#5B7077] transition-colors group-focus-within:text-[#1F4E5A]" />
                        <input
                          id="register-phone-optional"
                          type="tel"
                          inputMode="numeric"
                          maxLength={11}
                          placeholder="09XXXXXXXXX"
                          value={phoneNumber}
                          onChange={(event) =>
                            setPhoneNumber(event.target.value.replace(/\D/g, ""))
                          }
                          autoComplete="tel"
                          className="w-full bg-transparent py-2 pl-9.5 pr-3 text-xs sm:text-sm font-medium tracking-wide text-[#1B2B30] placeholder:text-[#5B7077]/60 outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-3">
                <div ref={facilityDropdownRef} className="relative">
                  <label
                    htmlFor="register-facility"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#5B7077]"
                  >
                    Health Center or Facility
                  </label>
                  <button
                    id="register-facility"
                    type="button"
                    onClick={() => setIsFacilityOpen((prev) => !prev)}
                    aria-expanded={isFacilityOpen}
                    aria-haspopup="listbox"
                    className={`group relative flex w-full items-center rounded-xl border bg-[#F9FBFB] shadow-xs transition-all duration-150 py-2 pl-9.5 pr-8 text-left text-xs sm:text-sm font-medium outline-none cursor-pointer ${
                      isFacilityOpen
                        ? "border-[#1F4E5A] ring-2 ring-[#1F4E5A]/20"
                        : "border-[#CFDDE0] hover:border-[#1F4E5A]/50 hover:bg-[#F4F8F8] focus:border-[#1F4E5A] focus:bg-[#F9FBFB] focus:ring-2 focus:ring-[#1F4E5A]/20"
                    }`}
                  >
                    <Building2
                      className={`pointer-events-none absolute left-3.5 h-3.5 w-3.5 transition-colors ${
                        isFacilityOpen ? "text-[#1F4E5A]" : "text-[#5B7077] group-focus:text-[#1F4E5A]"
                      }`}
                    />
                    <span
                      className={`block truncate ${
                        selectedFacility ? "text-[#1B2B30] font-semibold" : "text-[#5B7077]/60"
                      }`}
                    >
                      {selectedFacility ? selectedFacility.facility_name : "Select facility"}
                    </span>
                    <ChevronDown
                      className={`pointer-events-none absolute right-2.5 h-3.5 w-3.5 transition-transform duration-200 ${
                        isFacilityOpen ? "rotate-180 text-[#1F4E5A]" : "text-[#5B7077]"
                      }`}
                    />
                  </button>

                  {isFacilityOpen && (
                    <div
                      role="listbox"
                      aria-label="Health Center or Facility"
                      className="absolute left-0 right-0 top-full z-40 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-1 shadow-lg shadow-slate-200/60 transition-all duration-150 prds-modal-scrollbar"
                    >
                      {facilities.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-[#5B7077]">Loading facilities...</div>
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
                                  ? "bg-[#E8F5F1] text-[#2D7A5D] font-bold"
                                  : "text-[#1B2B30] hover:bg-[#F4F8F8] hover:text-[#1F4E5A]"
                              }`}
                            >
                              <span className="truncate">{facility.facility_name}</span>
                              {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#2D7A5D]" />}
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
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#5B7077]"
                  >
                    Password
                  </label>
                  <div className="group relative flex items-center rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs transition-all duration-150 focus-within:border-[#1F4E5A] focus-within:bg-[#F9FBFB] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
                    <Lock className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-[#5B7077] transition-colors group-focus-within:text-[#1F4E5A]" />
                    <input
                      id="register-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      placeholder="••••••••••••"
                      className="w-full bg-transparent py-2 pl-9.5 pr-8 text-xs sm:text-sm font-medium text-[#1B2B30] placeholder:text-[#5B7077]/60 outline-none"
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
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#5B7077]"
                  >
                    Confirm Password
                  </label>
                  <div className="group relative flex items-center rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs transition-all duration-150 focus-within:border-[#1F4E5A] focus-within:bg-[#F9FBFB] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
                    <Lock className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-[#5B7077] transition-colors group-focus-within:text-[#1F4E5A]" />
                    <input
                      id="register-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      placeholder="••••••••••••"
                      className="w-full bg-transparent py-2 pl-9.5 pr-8 text-xs sm:text-sm font-medium text-[#1B2B30] placeholder:text-[#5B7077]/60 outline-none"
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
                <div className="mt-2 space-y-1 rounded-xl border border-[#CFDDE0] bg-[#F4F8F8] p-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#5B7077]">Security strength:</span>
                    <span
                      className={`font-black ${
                        passwordStrength.level === "strong"
                          ? "text-[#2D7A5D]"
                          : passwordStrength.level === "fair"
                            ? "text-amber-600"
                            : "text-[#D9826B]"
                      }`}
                    >
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 h-1">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        passwordStrength.level === "weak"
                          ? "bg-[#D9826B]"
                          : passwordStrength.level === "fair"
                            ? "bg-amber-500"
                            : passwordStrength.level === "strong"
                              ? "bg-[#4C9F80]"
                              : "bg-[#CFDDE0]"
                      }`}
                    />
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        passwordStrength.level === "fair"
                          ? "bg-amber-500"
                          : passwordStrength.level === "strong"
                            ? "bg-[#4C9F80]"
                            : "bg-[#CFDDE0]"
                      }`}
                    />
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        passwordStrength.level === "strong"
                          ? "bg-[#4C9F80]"
                          : "bg-[#CFDDE0]"
                      }`}
                    />
                  </div>
                </div>
              )}

              <div className="mt-3 rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-2.5 transition-colors hover:bg-[#F4F8F8]">
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
                    className="mt-0.5 h-3.5 w-3.5 rounded border-[#CFDDE0] text-[#1F4E5A] focus:ring-[#1F4E5A] accent-[#1F4E5A]"
                  />
                  <span className="text-[11px] leading-4 text-[#5B7077] select-none">
                    I have read and agree to the{" "}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="font-bold text-[#1F4E5A] underline decoration-[#1F4E5A]/50 underline-offset-2 hover:text-[#286575] cursor-pointer"
                    >
                      PRDS Terms of Service
                    </button>{" "}
                    and{" "}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="font-bold text-[#1F4E5A] underline decoration-[#1F4E5A]/50 underline-offset-2 hover:text-[#286575] cursor-pointer"
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
                </div>
              )}

              {visibleOauthNotice && (
                <p className="mt-2.5 rounded-xl border border-[#4C9F80]/25 bg-[#E8F5F1] px-3 py-2 text-xs font-medium leading-5 text-[#2D7A5D]" role="status">
                  {visibleOauthNotice}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !isGoogleAccountCheckReady}
                className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-3 text-sm font-bold tracking-wide text-white shadow-xs transition-all duration-150 hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
              >
                <span>{isSubmitting ? "Creating Account..." : "Create Account"}</span>
              </button>

              {!isGoogleRegistration && (
                <>
                  <div className="my-3 sm:my-3.5 flex items-center">
                    <div className="grow border-t border-[#CFDDE0]"></div>
                    <span className="px-3.5 text-[11px] font-bold tracking-widest text-[#7A8F95] uppercase">
                      OR
                    </span>
                    <div className="grow border-t border-[#CFDDE0]"></div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleRegister}
                    disabled={isSubmitting || isGoogleSubmitting}
                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] py-2.5 sm:py-3 text-sm font-semibold text-[#1B2B30] shadow-xs transition-all duration-150 hover:border-[#1F4E5A]/40 hover:bg-[#EBF3F5] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
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
                    <span>{isGoogleSubmitting ? "Opening Google..." : "Register with Google"}</span>
                  </button>
                </>
              )}

              <div className="mt-4 sm:mt-5 text-center text-xs sm:text-sm font-medium text-[#5B7077]">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={handleGoToSignIn}
                  className="border-0 bg-transparent p-0 font-bold text-[#1F4E5A] transition hover:text-[#286575] hover:underline cursor-pointer"
                >
                  Log in
                </button>
              </div>
            </form>
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
              className="w-full max-w-md rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] p-6 shadow-2xl"
              role="dialog"
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2D7A5D]">
                PRDS Account
              </p>
              <h2 id="active-account-title" className="mt-2 text-xl font-bold text-[#1B2B30]">
                Account already active
              </h2>
              <p id="active-account-message" className="mt-3 text-sm leading-6 text-[#5B7077]">
                {supabaseUser?.email ? `${supabaseUser.email} is` : "This Gmail is"} already registered and active. Log in to continue.
              </p>
              <button
                type="button"
                onClick={() => navigate("/", { replace: true })}
                className="mt-6 flex w-full items-center justify-center rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-3 text-sm font-bold text-white shadow-xs transition hover:brightness-105 active:scale-[0.99] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1F4E5A] focus:ring-offset-2"
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
            <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-2xl">
              <div className="flex w-full items-center justify-between border-b border-[#CFDDE0] bg-[#F4F8F8] px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F5F1] text-[#2D7A5D] ring-1 ring-[#4C9F80]/20">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 id="terms-modal-title" className="text-base font-bold text-[#1B2B30]">
                      PRDS Terms of Service & System Usage Regulations
                    </h2>
                    <p className="text-xs font-medium text-[#5B7077]">
                      City Health Office &bull; City of Naga, Cebu
                    </p>
                  </div>
                </div>
              </div>

              <div className="prds-modal-scrollbar max-h-[60vh] w-full space-y-3 overflow-y-auto px-6 py-5 text-xs text-[#5B7077] leading-relaxed">
                <div className="rounded-xl border border-[#CFDDE0] bg-[#E3EEF5]/70 p-3.5 text-[#1F4A66] shadow-2xs">
                  <p className="flex items-center gap-2 text-xs font-bold text-[#1F4E5A]">
                    <ShieldAlert className="h-4 w-4 text-[#34769B] shrink-0" />
                    Official Notice for Healthcare & Logistics Personnel:
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#2D556E]">
                    The Pharmaceutical Resources Distribution System (PRDS) manages official pharmaceutical inventories and distribution channels for the City of Naga. Access is subject to government compliance and statutory accountability.
                  </p>
                </div>

                <div className="rounded-xl border border-[#CFDDE0]/70 bg-white p-3.5 shadow-2xs transition hover:border-[#B8D5DB]">
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E5EFF1] text-[10px] font-bold text-[#1F4E5A] ring-1 ring-[#1F4E5A]/15">
                      1
                    </span>
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#1B2B30]">
                        Authorized Scope & Account Eligibility
                      </h3>
                      <p className="text-xs leading-relaxed text-[#5B7077]">
                        Access is exclusively limited to authorized City Health Office (CHO) healthcare professionals and accredited Barangay Health Workers (BHWs). User accounts are non-transferable and must only be utilized within designated official duties.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#CFDDE0]/70 bg-white p-3.5 shadow-2xs transition hover:border-[#B8D5DB]">
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E5EFF1] text-[10px] font-bold text-[#1F4E5A] ring-1 ring-[#1F4E5A]/15">
                      2
                    </span>
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#1B2B30]">
                        Pharmaceutical Stewardship & Accountability
                      </h3>
                      <p className="text-xs leading-relaxed text-[#5B7077]">
                        All medicine requests, batch receipts, stock returns, and dispensing transactions constitute official city health records. Personnel are directly responsible for ensuring accuracy in recorded quantities, batch numbers, and expiration dates. Falsification, diversion, or unauthorized movement of public medicines is subject to civil, administrative, and criminal liability.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#CFDDE0]/70 bg-white p-3.5 shadow-2xs transition hover:border-[#B8D5DB]">
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E5EFF1] text-[10px] font-bold text-[#1F4E5A] ring-1 ring-[#1F4E5A]/15">
                      3
                    </span>
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#1B2B30]">
                        Data Privacy & Patient Confidentiality (R.A. 10173)
                      </h3>
                      <p className="text-xs leading-relaxed text-[#5B7077]">
                        In strict compliance with Republic Act No. 10173 (Data Privacy Act of 2012), all patient records, medical conditions, and dispensing logs accessed via PRDS are treated with the highest degree of confidentiality. Any unauthorized viewing, copying, or external dissemination is strictly prohibited.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#CFDDE0]/70 bg-white p-3.5 shadow-2xs transition hover:border-[#B8D5DB]">
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E5EFF1] text-[10px] font-bold text-[#1F4E5A] ring-1 ring-[#1F4E5A]/15">
                      4
                    </span>
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#1B2B30]">
                        Digital Audit Logs & Security Integrity
                      </h3>
                      <p className="text-xs leading-relaxed text-[#5B7077]">
                        PRDS maintains immutable system audit logs that track every session, stock alteration, approval, and dispensing record with user identifiers and timestamps. Users must keep login credentials secure and immediately report compromised accounts.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#CFDDE0]/70 bg-white p-3.5 shadow-2xs transition hover:border-[#B8D5DB]">
                  <div className="flex items-start gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E5EFF1] text-[10px] font-bold text-[#1F4E5A] ring-1 ring-[#1F4E5A]/15">
                      5
                    </span>
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#1B2B30]">
                        Administrative Review & Access Verification
                      </h3>
                      <p className="text-xs leading-relaxed text-[#5B7077]">
                        Submitting this registration places the account in a <strong className="font-bold text-[#1B2B30]">Pending Approval</strong> state. Full system access will only be granted following official verification by the CHO Chief Pharmacist or Designated Administrator.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex w-full flex-wrap items-center justify-end gap-2.5 border-t border-[#CFDDE0] bg-[#F4F8F8] px-6 py-3.5">
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  className="rounded-xl border border-[#CFDDE0] bg-white px-4 py-2 text-xs font-bold text-[#5B7077] hover:bg-[#E5EFF1]/50 hover:text-[#1B2B30] hover:border-[#B8D5DB] transition cursor-pointer shadow-2xs"
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
                  className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105 transition active:scale-[0.99] cursor-pointer"
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
