const toneConfig = {
  blue: {
    hoverBorder: "hover:border-[#1F4E5A]/40",
    iconBg: "bg-[#E5EFF1] text-[#1F4E5A] group-hover:bg-[#1F4E5A] group-hover:text-white",
  },
  pine: {
    hoverBorder: "hover:border-[#1F4E5A]/40",
    iconBg: "bg-[#E5EFF1] text-[#1F4E5A] group-hover:bg-[#1F4E5A] group-hover:text-white",
  },
  teal: {
    hoverBorder: "hover:border-[#4C9F80]/40",
    iconBg: "bg-[#E2F3EC] text-[#226048] group-hover:bg-[#4C9F80] group-hover:text-white",
  },
  emerald: {
    hoverBorder: "hover:border-[#4C9F80]/40",
    iconBg: "bg-[#E2F3EC] text-[#226048] group-hover:bg-[#4C9F80] group-hover:text-white",
  },
  green: {
    hoverBorder: "hover:border-[#4C9F80]/40",
    iconBg: "bg-[#E2F3EC] text-[#226048] group-hover:bg-[#4C9F80] group-hover:text-white",
  },
  orange: {
    hoverBorder: "hover:border-[#D9826B]/50",
    iconBg: "bg-[#FBE9E3] text-[#8F3F2B] group-hover:bg-[#D9826B] group-hover:text-white",
  },
  amber: {
    hoverBorder: "hover:border-[#D9826B]/50",
    iconBg: "bg-[#FBE9E3] text-[#8F3F2B] group-hover:bg-[#D9826B] group-hover:text-white",
  },
  red: {
    hoverBorder: "hover:border-[#D9826B]/60",
    iconBg: "bg-[#FBE9E3] text-[#8F3F2B] group-hover:bg-[#8F3F2B] group-hover:text-white",
  },
};

export default function StatCard({
  description,
  icon,
  isLoading = false,
  label,
  note,
  onClick,
  tone = "emerald",
  value,
}) {
  const toneSetting = toneConfig[tone] || toneConfig.emerald;
  const Element = onClick ? "button" : "article";

  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={description || label}
      className={`group flex flex-col justify-between rounded-xl border border-[#CFDDE0] bg-white p-3.5 text-left shadow-xs transition-all duration-150 ${
        onClick
          ? `cursor-pointer hover:-translate-y-0.5 hover:shadow-sm ${toneSetting.hoverBorder}`
          : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-[#5B7077]">
          {label}
        </span>
        {icon && (
          <span
            className={`rounded-lg p-1.5 transition-colors duration-150 shrink-0 ${toneSetting.iconBg}`}
          >
            {icon}
          </span>
        )}
      </div>

      <div className="mt-3">
        <p className="text-2xl font-black leading-none tracking-tight text-[#1B2B30]">
          {isLoading ? (
            <span className="inline-block h-7 w-16 animate-pulse rounded-md bg-[#E5EFF1]" />
          ) : (
            value
          )}
        </p>
      </div>
    </Element>
  );
}
