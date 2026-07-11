export default function Panel({ title, action, children, className = "" }) {
  return (
    <section className={`rounded-md border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
