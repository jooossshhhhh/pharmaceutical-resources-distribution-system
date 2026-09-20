const statusOptions = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
];

export default function ChangeRequestFilters({ onStatusFilterChange, statusFilter }) {
  return (
    <div className="inline-flex w-full rounded-lg bg-neutral-100 p-1 xl:w-auto">
        {statusOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={statusFilter === option.value}
            onClick={() => onStatusFilterChange(option.value)}
          className={`h-9 flex-1 rounded-md px-3 text-xs font-black transition xl:flex-none ${
              statusFilter === option.value
                ? "bg-black text-white"
                : "text-neutral-600 hover:bg-white"
            }`}
          >
            {option.label}
          </button>
        ))}
    </div>
  );
}
