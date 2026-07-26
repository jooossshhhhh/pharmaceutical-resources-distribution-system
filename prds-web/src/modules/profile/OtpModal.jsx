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
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 py-5">
      <form onSubmit={onSubmit} className="w-full max-w-[430px] rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-black text-black">{title}</h3>
        <p className="mt-1 text-sm font-medium text-neutral-500">{subtitle}</p>

        <label className="mt-6 grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
          Verification Code
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
            className="h-12 rounded-lg border border-neutral-200 bg-white px-3 text-center text-lg font-black tracking-[0.35em] text-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
          disabled={isBusy}
          className="mt-5 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          {isBusy ? "Verifying..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={isResending}
          className="mt-3 w-full rounded-lg bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isResending ? "Resending..." : "Resend OTP"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="mt-3 w-full rounded-lg px-4 py-3 text-sm font-bold text-neutral-500 hover:bg-neutral-50"
        >
          Back
        </button>
      </form>
    </div>
  );
}
