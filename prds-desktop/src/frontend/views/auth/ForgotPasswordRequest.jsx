import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";

import {
  getAuthErrorMessage,
  sendPasswordResetEmail,
} from "@backend/services/auth/authService";
import prdsEmblem from "@frontend/assets/prds-emblem.svg";

const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPasswordRequest() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // If URL has recovery tokens (from email link redirect), forward directly to /reset-password
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (window.location.hash.includes("access_token") ||
        window.location.search.includes("code") ||
        window.location.search.includes("token_hash"))
    ) {
      navigate(
        `/reset-password${window.location.search}${window.location.hash}`,
        { replace: true }
      );
    }
  }, [navigate]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    const clean = identifier.trim().toLowerCase();
    if (!clean) {
      setErrorMessage("Please enter your registered Gmail address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clean)) {
      setErrorMessage("Please enter a valid Gmail / email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(clean);
      setSentEmail(clean);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setErrorMessage(getAuthErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendEmail = async () => {
    if (resendCooldown > 0 || !sentEmail || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      await sendPasswordResetEmail(sentEmail);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setErrorMessage(getAuthErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Case 1: Email Reset Link Sent
  if (sentEmail) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#E5EFF1]/60 px-4 py-8 sm:px-6">
        <div className="w-full max-w-md rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] p-6 shadow-xl shadow-slate-200/50 sm:p-8 md:p-9 text-center">
          <img
            src={prdsEmblem}
            alt="PRDS Logo"
            className="mx-auto mb-3.5 h-8 sm:h-9 w-auto object-contain"
          />
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>

          <h2 className="text-2xl font-black tracking-tight text-[#1B2B30]">
            Check your Gmail
          </h2>

          <p className="mt-2 text-xs sm:text-sm text-[#5B7077] leading-relaxed">
            We sent a password reset link to:
            <br />
            <strong className="font-bold text-[#1B2B30]">{sentEmail}</strong>
          </p>

          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-left text-xs sm:text-sm text-emerald-900 leading-relaxed font-medium">
            <p className="font-bold mb-1">Next steps:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Open your Gmail inbox in your browser.</li>
              <li>Click the password reset link inside the email.</li>
              <li>Create and confirm your new password in the browser window.</li>
            </ol>
          </div>

          {errorMessage && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm font-semibold text-red-700">
              {errorMessage}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleResendEmail}
              disabled={resendCooldown > 0 || isSubmitting}
              className="w-full rounded-xl border border-[#1F4E5A] bg-transparent py-3 text-sm font-bold text-[#1F4E5A] transition hover:bg-[#1F4E5A]/5 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {resendCooldown > 0
                ? `Resend link in ${resendCooldown}s`
                : isSubmitting
                ? "Resending..."
                : "Resend reset link"}
            </button>

            <button
              type="button"
              onClick={() => {
                setSentEmail("");
                setErrorMessage("");
              }}
              className="text-xs font-bold text-[#5B7077] transition hover:text-[#1B2B30] hover:underline cursor-pointer"
            >
              Use a different Gmail address
            </button>
          </div>

          <div className="mt-6 border-t border-gray-200 pt-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1F4E5A] transition hover:text-[#286575] hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Log In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Default: Input form for Gmail
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#E5EFF1]/60 px-4 py-8 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] p-6 shadow-xl shadow-slate-200/50 sm:p-8 md:p-9">
        <div className="mb-6 text-center">
          <img
            src={prdsEmblem}
            alt="PRDS Logo"
            className="mx-auto mb-3.5 h-8 sm:h-9 w-auto object-contain"
          />
          <h2 className="text-2xl font-black tracking-tight text-[#1B2B30] sm:text-3xl">
            Forgot Password
          </h2>
          <p className="mt-1.5 text-xs text-[#5B7077] sm:text-sm">
            Enter your registered Gmail address to receive a secure password reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="identifier"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#5B7077]"
            >
              Gmail Address
            </label>
            <div className="relative flex items-center rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-2xs transition-all focus-within:border-[#1F4E5A] focus-within:ring-2 focus-within:ring-[#1F4E5A]/20">
              <div className="pointer-events-none absolute left-3.5 flex items-center text-[#5B7077]">
                <Mail className="h-4 w-4" />
              </div>
              <input
                id="identifier"
                type="email"
                placeholder="name@gmail.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={isSubmitting}
                autoComplete="email"
                required
                className="w-full bg-transparent py-3 pl-10 pr-4 text-sm font-medium tracking-wide text-[#1B2B30] placeholder-[#5B7077]/60 focus:outline-none disabled:cursor-not-allowed disabled:bg-[#E5EFF1] disabled:text-[#5B7077]"
              />
            </div>
            <p className="mt-2 text-[11px] text-[#5B7077] leading-relaxed">
              A secure password reset link will be sent to your Gmail inbox.
            </p>
          </div>

          {errorMessage && (
            <p
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700"
              role="alert"
            >
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-3.5 text-sm font-bold tracking-wide text-white shadow-xs transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          >
            <span>{isSubmitting ? "Processing..." : "Continue"}</span>
          </button>

          <div className="pt-2 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1F4E5A] transition hover:text-[#286575] hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Log In
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
