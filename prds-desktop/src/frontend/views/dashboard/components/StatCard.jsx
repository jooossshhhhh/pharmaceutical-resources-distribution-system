const toneClasses = {
  emerald: "bg-[#E2F3EC] text-[#226048] border border-[#4C9F80]/20",
  green: "bg-[#E2F3EC] text-[#226048] border border-[#4C9F80]/20",
  mint: "bg-[#E2F3EC] text-[#226048] border border-[#4C9F80]/20",
  orange: "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/25",
  amber: "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/25",
  yellow: "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/25",
  red: "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/30",
  crimson: "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/30",
  wine: "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/30",
  coral: "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/30",
  blue: "bg-[#E3EEF5] text-[#1F4A66] border border-[#34769B]/25",
  sky: "bg-[#E3EEF5] text-[#1F4A66] border border-[#34769B]/25",
  navy: "bg-[#E3EEF5] text-[#1F4A66] border border-[#34769B]/25",
  teal: "bg-[#E2F3EC] text-[#226048] border border-[#4C9F80]/20",
};

export default function StatCard({
  description,
  isLoading = false,
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
      className={`group relative overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-2.5 pt-3.5 text-left shadow-xs transition before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-gradient-to-r before:from-[#34769B] before:to-[#4C9F80] ${
        onClick
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#34769B]/50 hover:shadow-sm"
          : ""
      }`}
    >
      <div className="flex min-h-5 items-start justify-end gap-2">
        {note && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-black ${classes}`}
          >
            {note}
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-black leading-7 tracking-tight text-[#1B2B30]">
        {isLoading ? (
          <span className="inline-block h-7 w-16 animate-pulse rounded-md bg-[#E5EFF1]" />
        ) : (
          value
        )}
      </p>
      <p className="mt-0.5 text-[12px] font-black text-[#5B7077]">{label}</p>
      {description && (
        <p className="mt-1 line-clamp-2 text-[10px] font-medium leading-3.5 text-[#5B7077]/80">
          {description}
        </p>
      )}
      {onClick && (
        <span className="mt-2 inline-flex items-center text-xs font-black text-[#34769B] opacity-0 transition group-hover:opacity-100">
          Open module -&gt;
        </span>
      )}
    </Element>
  );
}
