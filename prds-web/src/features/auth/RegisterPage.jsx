import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/useAuth";
import { supabase } from "../../services/supabase";
import {
  getAuthErrorMessage,
  isPhilippineMobileNumber,
  normalizePhoneNumber,
  signInWithGoogle,
  signUpWithPhonePassword,
  updateUserPassword,
} from "./AuthService";
import {
  PHONE_OTP_PURPOSES,
  setPendingPhoneOtp,
} from "./PendingPhoneOtpStore";
import {
  createGoogleProfile,
  getProfileById,
  isProfileRegistrationComplete,
} from "./ProfileService";

const roleOptions = [
  { value: "PHARMA_I", label: "Pharmacist I" },
  { value: "BHW", label: "Barangay Health Worker" },
];

export default function RegisterPage() {
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
  const [facilities, setFacilities] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const isGoogleRegistration =
    !!supabaseUser?.email && !isProfileRegistrationComplete(profile);
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
        .select("id, facility_name, facility_code")
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
    if (loading) {
      return;
    }

    if (profile?.status === "ACTIVE" && isProfileRegistrationComplete(profile)) {
      navigate("/dashboard", { replace: true });
      return;
    }

    if (profile && isProfileRegistrationComplete(profile)) {
      navigate("/pending-approval", { replace: true });
    }
  }, [loading, navigate, profile]);

  const firstNameValue =
    firstName || (isGoogleRegistration ? profile?.first_name || defaultNames.firstName : "");
  const lastNameValue =
    lastName || (isGoogleRegistration ? profile?.last_name || defaultNames.lastName : "");
  const facilityIdValue =
    facilityId || (isGoogleRegistration ? profile?.facility_id || "" : "");
  const roleValue =
    role ||
    (isGoogleRegistration && profile?.role !== "PHARMA_II"
      ? profile?.role || ""
      : "");

  const validateSharedFields = () => {
    if (!firstNameValue.trim() || !lastNameValue.trim()) {
      return "First name and last name are required.";
    }

    if (!facilityIdValue) {
      return "Facility is required.";
    }

    if (!roleValue) {
      return "Role is required.";
    }

    if (password.length < 6) {
      return "Password must be at least 6 characters.";
    }

    if (password !== confirmPassword) {
      return "Passwords do not match.";
    }

    return "";
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    const sharedError = validateSharedFields();

    if (sharedError) {
      setErrorMessage(sharedError);
      return;
    }

    if (!isGoogleRegistration && !isPhilippineMobileNumber(phoneNumber)) {
      setErrorMessage("Phone number must use the format 09XXXXXXXXX.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isGoogleRegistration) {
        const existingProfile = await getProfileById(supabaseUser.id);

        if (isProfileRegistrationComplete(existingProfile)) {
          navigate(
            existingProfile.status === "ACTIVE" ? "/dashboard" : "/pending-approval",
            { replace: true }
          );
          return;
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
    setIsGoogleSubmitting(true);

    try {
      await signInWithGoogle("/register");
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
      setIsGoogleSubmitting(false);
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
            Request access to the centralized medicine inventory and healthcare resource distribution platform.
          </p>
        </div>

        <div className="relative z-10 text-sm text-blue-200/60 font-medium tracking-wide">
          &copy; 2026 City Health Office - City of Naga, Cebu. All rights reserved.
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-white min-h-screen relative">
        <div className="flex-1 flex flex-col justify-center items-center px-6 md:px-12 py-12">
          <form className="w-full max-w-md" onSubmit={handleRegister}>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-slate-800 mb-2">
                Register Account
              </h2>
              {isGoogleRegistration && (
                <p className="text-sm font-medium text-slate-500">
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  First Name
                </label>
                <input
                  type="text"
                  value={firstNameValue}
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Last Name
                </label>
                <input
                  type="text"
                  value={lastNameValue}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
                />
              </div>
            </div>

            {!isGoogleRegistration ? (
              <div className="mt-5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Phone Number
                </label>
                <div className="relative flex rounded-xl border border-gray-300 shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-green-600/20 focus-within:border-green-600 transition-all bg-white">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
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
                    className="w-full bg-transparent pl-10 pr-4 py-3.5 text-sm font-medium tracking-wide text-gray-900 placeholder-gray-300 outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Gmail
                </label>
                <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm font-semibold text-gray-900">
                  {supabaseUser.email}
                </div>
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Facility
                </label>
                <select
                  value={facilityIdValue}
                  onChange={(event) => setFacilityId(event.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Role
                </label>
                <select
                  value={roleValue}
                  onChange={(event) => setRole(event.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
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

            <div className="mt-5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 pr-12 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d={showPassword ? "M3 3l18 18M10.584 10.587A2 2 0 0012 14a2 2 0 001.414-.586M9.88 4.243A9.77 9.77 0 0112 4c4.478 0 8.268 2.943 9.542 7a9.975 9.975 0 01-3.043 4.426M6.228 6.228A9.984 9.984 0 002.458 11c1.274 4.057 5.065 7 9.542 7a9.96 9.96 0 004.132-.894" : "M15 12a3 3 0 11-6 0 3 3 0 016 0z"} />
                    {!showPassword && (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 pr-12 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-slate-600"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d={showConfirmPassword ? "M3 3l18 18M10.584 10.587A2 2 0 0012 14a2 2 0 001.414-.586M9.88 4.243A9.77 9.77 0 0112 4c4.478 0 8.268 2.943 9.542 7a9.975 9.975 0 01-3.043 4.426M6.228 6.228A9.984 9.984 0 002.458 11c1.274 4.057 5.065 7 9.542 7a9.96 9.96 0 004.132-.894" : "M15 12a3 3 0 11-6 0 3 3 0 016 0z"} />
                    {!showConfirmPassword && (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {errorMessage && (
              <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#008000] px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-md shadow-green-800/10 transition-all duration-150 hover:bg-[#006600] hover:shadow-lg hover:shadow-green-800/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Creating Account" : "Create Account"}
            </button>

            {!isGoogleRegistration && (
              <>
                <div className="flex items-center my-6">
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
                  {isGoogleSubmitting ? "Opening Google" : "Register with Google"}
                </button>
              </>
            )}

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
