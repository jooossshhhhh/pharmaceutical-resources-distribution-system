import { useEffect, useMemo, useState } from "react";

import ModalShell from "../../components/ModalShell";

const OTP_EXPIRY_SECONDS = 120;

export default function OtpModal({
  code,
  error,
  isBusy,
  isResending,
  onBack,
  onChange,
  onResend,
  onSubmit,
  submitLabel,
  subtitle,
  title,
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(OTP_EXPIRY_SECONDS);
  const formattedTimeRemaining = useMemo(() => {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = String(secondsRemaining % 60).padStart(2, "0");

    return `${minutes}:${seconds}`;
  }, [secondsRemaining]);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [secondsRemaining]);

  const handleResend = async () => {
    await onResend?.();
    setSecondsRemaining(OTP_EXPIRY_SECONDS);
  };

  return (
    <ModalShell
      labelledBy="otp-modal-title"
      onClose={onBack}
      overlayClassName="bg-white/95 backdrop-blur-sm"
    >
      <form onSubmit={onSubmit} className="w-full max-w-[520px] rounded-xl bg-white px-6 py-8 shadow-2xl">
        <div className="text-center">
          <h3 id="otp-modal-title" className="text-3xl font-black tracking-tight text-[#0d1117]">{title}</h3>
          <p className="mt-2 text-sm font-medium text-slate-600">{subtitle}</p>
          <p
            className={`mt-3 text-sm font-black ${
              secondsRemaining === 0 ? "text-red-600" : "text-emerald-700"
            }`}
          >
            {secondsRemaining === 0
              ? "OTP expired"
              : `OTP expires in ${formattedTimeRemaining}`}
          </p>
        </div>

        <label className="mt-8 grid gap-3 text-xs font-black uppercase tracking-wide text-slate-600">
          Verification Code
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
            className="h-14 rounded-xl border border-slate-300 bg-white px-4 text-center text-xl font-black tracking-[0.45em] text-[#0d1117] shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            required
          />
        </label>

        {error && (
          <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isBusy || secondsRemaining === 0}
          className="mt-6 w-full rounded-xl bg-[#008a00] px-4 py-3.5 text-sm font-black text-white shadow-sm shadow-emerald-100 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          {isBusy ? "Verifying..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={isResending}
          className="mt-4 w-full rounded-lg px-4 py-2 text-sm font-black text-[#003b82] hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isResending ? "Resending..." : "Resend OTP"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="mt-1 w-full rounded-lg px-4 py-2 text-sm font-black text-[#003b82] hover:bg-[#eff4ff]"
        >
          Change phone number
        </button>
      </form>
    </ModalShell>
  );
}
