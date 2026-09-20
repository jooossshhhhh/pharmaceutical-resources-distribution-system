export default function Panel({ title, action, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-neutral-200/40 ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <h2 className="text-sm font-black text-[#0d1117]">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
