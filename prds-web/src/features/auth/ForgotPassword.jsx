import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  getAuthErrorMessage,
  logOwnPasswordChange,
  logoutUser,
  updateUserPassword,
} from "./AuthService";
import { supabaseAuth } from "../../services/supabase";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    supabaseAuth.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setHasRecoverySession(!!data.session);
      setIsCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabaseAuth.auth.onAuthStateChange((event, session) => {
      if (!isMounted) {
        return;
      }

      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(true);
      }

      setIsCheckingSession(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!hasRecoverySession) {
      setErrorMessage("Open the latest reset password email before setting a new password.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await updateUserPassword(newPassword);
      await logOwnPasswordChange();
      await logoutUser();
      setSuccessMessage("Password updated successfully. Please sign in again.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToSignIn = async () => {
    await logoutUser();
    navigate("/", { replace: true });
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
            Set a new password for secure phone number and Gmail access.
          </p>
        </div>

        <div className="relative z-10 text-sm text-blue-200/60 font-medium tracking-wide">
          &copy; 2026 City Health Office - City of Naga, Cebu. All rights reserved.
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-white min-h-screen relative">
        <div className="flex-1 flex flex-col justify-center items-center px-6 md:px-12 py-12">
          <form className="w-full max-w-md" onSubmit={handleSubmit}>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold tracking-tight text-slate-800 mb-2">
                Reset Password
              </h2>
              <p className="text-sm font-medium text-slate-500">
                Enter your new account password.
              </p>
            </div>

            {isCheckingSession ? (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-semibold text-blue-800">
                Checking reset session...
              </div>
            ) : !hasRecoverySession && !successMessage ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
                <p className="text-sm font-bold text-amber-900">
                  Reset link required
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  Open the latest Supabase reset password email, then set your
                  new password from this page.
                </p>
              </div>
            ) : null}

            <div className="mt-6 grid gap-5">
              <PasswordInput
                label="New Password"
                value={newPassword}
                isVisible={showNewPassword}
                disabled={!hasRecoverySession || !!successMessage}
                onChange={(event) => setNewPassword(event.target.value)}
                onToggle={() => setShowNewPassword((current) => !current)}
              />
              <PasswordInput
                label="Confirm Password"
                value={confirmPassword}
                isVisible={showConfirmPassword}
                disabled={!hasRecoverySession || !!successMessage}
                onChange={(event) => setConfirmPassword(event.target.value)}
                onToggle={() => setShowConfirmPassword((current) => !current)}
              />
            </div>

            {errorMessage && (
              <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
                {errorMessage}
              </p>
            )}

            {successMessage && (
              <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-800">
                {successMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={!hasRecoverySession || isSubmitting || !!successMessage}
              className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#008000] px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-md shadow-green-800/10 transition-all duration-150 hover:bg-[#006600] hover:shadow-lg hover:shadow-green-800/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Updating Password" : "Update Password"}
            </button>

            <button
              type="button"
              onClick={handleBackToSignIn}
              className="mt-4 flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Back to Sign In
            </button>

            <p className="mt-8 text-center text-sm text-slate-500">
              Need a new reset email?{" "}
              <Link to="/profile-settings" className="font-bold text-[#003b7a]">
                Return to profile settings
              </Link>
            </p>
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

function PasswordInput({ disabled, isVisible, label, onChange, onToggle, value }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
        {label}
      </span>
      <span className="relative block">
        <input
          type={isVisible ? "text" : "password"}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="w-full h-13 rounded-xl border border-slate-300 bg-white px-4 pr-12 text-sm font-semibold text-slate-900 shadow-sm outline-none transition-all duration-200 focus:border-[#008000] focus:ring-4 focus:ring-green-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={isVisible ? "Hide password" : "Show password"}
        >
          <EyeIcon hidden={isVisible} />
        </button>
      </span>
    </label>
  );
}

function EyeIcon({ hidden }) {
  if (hidden) {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.88 4.24A9.77 9.77 0 0 1 12 4c4.48 0 8.27 2.94 9.54 7a9.98 9.98 0 0 1-3.04 4.43M6.23 6.23A9.98 9.98 0 0 0 2.46 11c1.27 4.06 5.06 7 9.54 7a9.96 9.96 0 0 0 4.13-.89" />
      </svg>
    );
  }

  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.46 12C3.73 7.94 7.52 5 12 5s8.27 2.94 9.54 7c-1.27 4.06-5.06 7-9.54 7s-8.27-2.94-9.54-7Z" />
    </svg>
  );
}
