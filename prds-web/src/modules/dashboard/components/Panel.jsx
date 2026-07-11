export default function Panel({ title, action, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/40 ${className}`}>
      <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
        <h2 className="text-base font-black text-black">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
