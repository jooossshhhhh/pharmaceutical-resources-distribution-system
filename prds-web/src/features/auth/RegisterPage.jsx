import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  getAuthErrorMessage,
  isPhilippineMobileNumber,
  normalizePhoneNumber,
  signUpWithPhonePassword,
} from "./AuthService";
import { setPendingRegistration } from "./PendingRegistrationStore";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!isPhilippineMobileNumber(phoneNumber)) {
      setErrorMessage("Phone number must use the format 09XXXXXXXXX.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
      await signUpWithPhonePassword({
        phoneNumber: normalizedPhoneNumber,
        password,
      });

      setPendingRegistration({
        mode: "register",
        firstName,
        lastName,
        phoneNumber: normalizedPhoneNumber,
      });

      navigate("/otp-verification");
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
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
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  First Name
                </label>
                <input
                  type="text"
                  value={firstName}
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
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
                />
              </div>
            </div>

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
