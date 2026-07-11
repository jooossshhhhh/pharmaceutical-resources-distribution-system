const toneClasses = {
  emerald: {
    icon: "bg-emerald-100 text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700",
  },
  orange: {
    icon: "bg-orange-100 text-orange-600",
    badge: "bg-orange-50 text-orange-600",
  },
  red: {
    icon: "bg-red-50 text-red-500",
    badge: "bg-red-50 text-red-600",
  },
  blue: {
    icon: "bg-blue-100 text-blue-600",
    badge: "bg-blue-50 text-blue-600",
  },
  teal: {
    icon: "bg-teal-100 text-teal-600",
    badge: "bg-teal-50 text-teal-700",
  },
};

export default function StatCard({ label, value, icon, note, tone = "emerald" }) {
  const classes = toneClasses[tone] || toneClasses.emerald;

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-200/40">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${classes.icon}`}
        >
          {icon}
        </span>
        {note && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-black ${classes.badge}`}
          >
            {note}
          </span>
        )}
      </div>
      <p className="mt-5 text-3xl font-black tracking-tight text-black">{value}</p>
      <p className="mt-1 text-sm font-medium text-neutral-500">{label}</p>
    </article>
  );
}
