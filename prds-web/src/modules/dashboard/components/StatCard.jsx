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

export default function StatCard({
  description,
  icon,
  label,
  note,
  onClick,
  tone = "emerald",
  value,
}) {
  const classes = toneClasses[tone] || toneClasses.emerald;
  const Element = onClick ? "button" : "article";

  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`group rounded-xl border border-[#d8dadc] bg-white p-4 text-left shadow-sm shadow-neutral-200/40 transition ${
        onClick
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#6be9c2] hover:shadow-md hover:shadow-emerald-100"
          : ""
      }`}
    >
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
      <p className="mt-5 text-3xl font-black tracking-tight text-[#0d1117]">{value}</p>
      <p className="mt-1 text-sm font-black text-[#42474e]">{label}</p>
      {description && (
        <p className="mt-2 text-xs font-medium leading-4 text-neutral-500">
          {description}
        </p>
      )}
      {onClick && (
        <span className="mt-3 inline-flex items-center text-xs font-black text-emerald-700 opacity-0 transition group-hover:opacity-100">
          Open module -&gt;
        </span>
      )}
    </Element>
  );
}
