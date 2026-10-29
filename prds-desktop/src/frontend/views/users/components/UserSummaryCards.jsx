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
            className={`group rounded-xl border bg-[#F9FBFB] p-4 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm cursor-pointer ${
              card.active ? "border-[#34769B] ring-2 ring-[#34769B]/20" : "border-[#CFDDE0] hover:border-[#34769B]/40"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-2xl font-black tracking-tight text-[#1B2B30] leading-none">
                {card.value}
              </p>
              {card.active ? (
                <span className="rounded-full bg-[#E3EEF5] border border-[#34769B]/25 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#1F4A66]">
                  Selected
                </span>
              ) : card.id === "pending" && card.value > 0 ? (
                <span className="rounded-full bg-[#FBE9E3] border border-[#D9826B]/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#8F3F2B]">
                  Review
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-[#5B7077]">
              {card.label}
            </p>
            <p className="mt-1 line-clamp-2 text-xs font-semibold text-[#5B7077]/80">
              {card.description}
            </p>
          </button>
        );
      })}
    </section>
  );
}
