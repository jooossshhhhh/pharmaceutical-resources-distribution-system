export default function EmptyState({ hint, title = "No data yet" }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-5 text-center">
      <p className="text-xs font-black text-neutral-600">{title}</p>
      {hint && <p className="mt-1 text-[11px] font-medium leading-4 text-neutral-500">{hint}</p>}
    </div>
  );
}
