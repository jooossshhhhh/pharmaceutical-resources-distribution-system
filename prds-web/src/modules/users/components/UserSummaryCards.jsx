import { AlertIcon, BanIcon, CheckIcon, RequestIcon, SwapIcon, UserIcon } from "./UserManagementIcons";

const toneClasses = {
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  neutral: "bg-neutral-50 text-neutral-700 ring-neutral-100",
  teal: "bg-[#e8fff7] text-[#007f5f] ring-[#6be9c2]/40",
};

const iconMap = {
  active: CheckIcon,
  deactivated: BanIcon,
  facilityRequests: SwapIcon,
  pending: AlertIcon,
  total: UserIcon,
};

export default function UserSummaryCards({ activeView, onSelectRequests, onSelectStatus, statusFilter, summary }) {
  const cards = [
    {
      active: activeView === "accounts" && statusFilter === "ALL",
      description: "All reviewable accounts",
      id: "total",
      label: "Total Users",
      onClick: () => onSelectStatus("ALL"),
      tone: "teal",
      value: summary.total,
    },
    {
      active: activeView === "accounts" && statusFilter === "PENDING",
      description: "Waiting for approval",
      id: "pending",
      label: "Pending Approval",
      onClick: () => onSelectStatus("PENDING"),
      tone: "amber",
      value: summary.pending,
    },
    {
      active: activeView === "accounts" && statusFilter === "ACTIVE",
      description: "Can access PRDS",
      id: "active",
      label: "Active",
      onClick: () => onSelectStatus("ACTIVE"),
      tone: "blue",
      value: summary.active,
    },
    {
      active: activeView === "accounts" && statusFilter === "DEACTIVATED",
      description: "Access disabled",
      id: "deactivated",
      label: "Deactivated",
      onClick: () => onSelectStatus("DEACTIVATED"),
      tone: "neutral",
      value: summary.deactivated,
    },
    {
      active: activeView === "requests",
      description: "Facility changes to review",
      id: "facilityRequests",
      label: "Facility Requests",
      onClick: onSelectRequests,
      tone: "emerald",
      value: summary.facilityRequests,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = iconMap[card.id] || RequestIcon;

        return (
          <button
            key={card.id}
            type="button"
            onClick={card.onClick}
            className={`group rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
              card.active ? "border-[#6be9c2] ring-2 ring-[#6be9c2]/30" : "border-neutral-200"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${toneClasses[card.tone]}`}>
                <Icon />
              </span>
              {card.active ? (
                <span className="rounded-full bg-[#6be9c2]/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#0d1117]">
                  Selected
                </span>
              ) : null}
            </div>
            <p className="mt-4 text-2xl font-black text-black">{card.value}</p>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">{card.label}</p>
            <p className="mt-1 line-clamp-2 text-xs font-semibold text-neutral-500">{card.description}</p>
          </button>
        );
      })}
    </section>
  );
}
