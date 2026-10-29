export default function Panel({ title, action, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-[#CFDDE0]/60 px-4 py-3">
        <h2 className="text-sm font-black text-[#1B2B30]">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
