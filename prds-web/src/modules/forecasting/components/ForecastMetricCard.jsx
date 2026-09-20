export default function ForecastMetricCard({
  description,
  icon,
  label,
  meta,
  onClick,
  tone = "emerald",
  value,
}) {
  const toneClass = toneClasses[tone] || toneClasses.emerald;
  const Component = onClick ? "button" : "article";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`group rounded-xl border border-[#d8dadc] bg-white p-4 text-left shadow-sm shadow-neutral-200/40 transition ${
        onClick ? "hover:-translate-y-0.5 hover:border-[#6be9c2] hover:shadow-md" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${toneClass.icon}`}>
          {icon}
        </span>
        {meta && (
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${toneClass.badge}`}>
            {meta}
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-black tracking-tight text-[#0d1117]">{value}</p>
      <p className="mt-1 text-sm font-black text-[#0d1117]">{label}</p>
      <p className="mt-1.5 min-h-8 text-xs font-medium leading-4 text-[#42474e]">{description}</p>
    </Component>
  );
}

const toneClasses = {
  amber: {
    badge: "bg-amber-100 text-amber-700",
    icon: "bg-amber-100 text-amber-700",
  },
  blue: {
    badge: "bg-blue-100 text-blue-700",
    icon: "bg-blue-100 text-blue-700",
  },
  emerald: {
    badge: "bg-emerald-100 text-emerald-700",
    icon: "bg-emerald-100 text-emerald-700",
  },
  orange: {
    badge: "bg-orange-100 text-orange-700",
    icon: "bg-orange-100 text-orange-700",
  },
  red: {
    badge: "bg-red-100 text-red-700",
    icon: "bg-red-100 text-red-700",
  },
};
