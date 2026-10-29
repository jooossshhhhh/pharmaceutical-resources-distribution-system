export default function EmptyState({ hint, title = "No data yet" }) {
  return (
    <div className="rounded-xl border border-dashed border-[#CFDDE0] bg-[#E5EFF1]/60 px-4 py-6 text-center">
      <p className="text-xs font-black text-[#1B2B30]">{title}</p>
      {hint && <p className="mt-1 text-[11px] font-medium leading-4 text-[#5B7077]">{hint}</p>}
    </div>
  );
}
