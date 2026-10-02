export default function UserSummaryCards({ onSelectStatus, statusFilter, summary }) {
  const cards = [
    {
      active: statusFilter === "ALL",
      description: "All registered accounts",
      id: "total",
      label: "Total Users",
      onClick: () => onSelectStatus("ALL"),
      value: summary.total,
    },
    {
      active: statusFilter === "PENDING",
      description: "Waiting for approval",
      id: "pending",
      label: "Pending Approval",
      onClick: () => onSelectStatus("PENDING"),
      value: summary.pending,
    },
    {
      active: statusFilter === "ACTIVE",
      description: "Can access PRDS",
      id: "active",
      label: "Active",
      onClick: () => onSelectStatus("ACTIVE"),
      value: summary.active,
    },
    {
      active: statusFilter === "DEACTIVATED",
      description: "Access disabled",
      id: "deactivated",
      label: "Deactivated",
      onClick: () => onSelectStatus("DEACTIVATED"),
      value: summary.deactivated,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        return (
          <button
            key={card.id}
            type="button"
            onClick={card.onClick}
            className={`group rounded-xl border bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
              card.active ? "border-[#00a36c] ring-2 ring-emerald-100" : "border-[#d8dadc] hover:border-slate-300"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-2xl font-black tracking-tight text-[#0d1117] leading-none">
                {card.value}
              </p>
              {card.active && (
                <span className="rounded-full bg-[#6be9c2]/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#0d1117]">
                  Selected
                </span>
              )}
            </div>
            <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-neutral-500">
              {card.label}
            </p>
            <p className="mt-1 line-clamp-2 text-xs font-semibold text-neutral-400">
              {card.description}
            </p>
          </button>
        );
      })}
    </section>
  );
}
