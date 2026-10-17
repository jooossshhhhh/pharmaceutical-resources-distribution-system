export default function EmptyState({ hint, title = "No data yet" }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/80 px-4 py-6 text-center">
      <p className="text-xs font-black text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-[11px] font-medium leading-4 text-slate-500">{hint}</p>}
    </div>
  );
}
