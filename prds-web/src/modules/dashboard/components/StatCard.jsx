const IconBox = ({ children, tone = "green" }) => {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
    red: "border-red-200 bg-red-50 text-red-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

export default function StatCard({ label, value, tone, icon, note }) {
  const toneClass =
    tone === "red" ? "border-red-200 bg-red-50" : "border-slate-200 bg-white";
  const valueClass = tone === "red" ? "text-red-600" : "text-slate-950";

  return (
    <div className={`rounded-md border p-3 shadow-sm ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <IconBox tone={tone}>{icon}</IconBox>
        {note && (
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
            {note}
          </span>
        )}
      </div>
      <p className="mt-3 text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-3xl font-black tracking-tight ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}
