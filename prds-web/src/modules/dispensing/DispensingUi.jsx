import ModalShell from "../../components/ModalShell";

export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a36c] focus-visible:ring-offset-1";

export function PatientAvatar({ name, sizeClass = "h-9 w-9 text-xs" }) {
  const initials =
    (name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "?";

  return (
    <span
      aria-hidden="true"
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border border-[#6be9c2]/50 bg-[#ecfff8] font-bold text-[#008f68]`}
    >
      {initials}
    </span>
  );
}

export const SearchIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const PlusIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const XIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const CheckIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="m5 12 4 4L19 6" />
  </svg>
);

export const ChevronDownIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const ArrowRightIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const HistoryIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 7v5h5" />
    <path d="M5.5 12a7 7 0 1 0 2-5" />
    <path d="M12 8v5l3 2" />
  </svg>
);

export const QueueIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3 6h.01" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
  </svg>
);

export const PillIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <rect x="2.5" y="9" width="19" height="6.5" rx="3.25" transform="rotate(-45 12 12)" />
    <path d="m8.5 8.5 7 7" />
  </svg>
);

export const UserPlusIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M18 6v6M15 9h6" />
  </svg>
);

export const SortDirectionIcon = ({ direction = "newest" }) => (
  <svg
    aria-hidden="true"
    className={`h-4 w-4 transition-transform duration-300 ${direction === "oldest" ? "rotate-180" : ""}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M8 7h8M10 12h6M12 17h4" />
    <path d="m5 8 3-3 3 3" />
    <path d="M8 5v14" />
  </svg>
);

export function EligibilityBadge({ claimedThisMonth }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
        claimedThisMonth ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {claimedThisMonth ? "Claimed this month" : "Eligible"}
    </span>
  );
}

export function VoidedBadge() {
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-red-700">
      Cancelled
    </span>
  );
}

export function ActiveBadge() {
  return (
    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
      Active
    </span>
  );
}

export function FilterChip({ active, children, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 ${FOCUS_RING} ${
        active
          ? "bg-black text-white shadow-md shadow-black/10"
          : "bg-[#f7f6f3] text-[#0d1117] hover:bg-[#eff4ff]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export function SortToggleButton({ onClick, sort }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-[#0d1117] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6be9c2] hover:bg-[#eff4ff] ${FOCUS_RING}`}
      title={sort === "newest" ? "Newest first" : "Oldest first"}
      aria-label={sort === "newest" ? "Sort newest first" : "Sort oldest first"}
    >
      <SortDirectionIcon direction={sort} />
      <span>{sort === "newest" ? "Newest" : "Oldest"}</span>
    </button>
  );
}

export function Field({ children, label }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Input(props) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-lg border border-[#d8dadc] bg-white px-3 text-sm text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/40 ${props.className || ""}`}
    />
  );
}

export function Select(props) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-lg border border-[#d8dadc] bg-white px-3 text-sm font-medium text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/40 ${props.className || ""}`}
    />
  );
}

export function Textarea(props) {
  return (
    <textarea
      {...props}
      className={`min-h-24 w-full resize-none rounded-lg border border-[#d8dadc] bg-white px-3 py-2 text-sm text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/40 ${props.className || ""}`}
    />
  );
}

export function DispensingModal({ children, closeLabel, onClose, subtitle, title, widthClass = "max-w-4xl" }) {
  return (
    <ModalShell
      labelledBy="dispensing-modal-title"
      onClose={onClose}
      overlayClassName="bg-black/45"
      panelClassName={widthClass}
    >
      <div className="max-h-[86vh] w-full overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e5e7eb] px-5 py-4">
          <div>
            <h2 id="dispensing-modal-title" className="text-lg font-bold text-[#0d1117]">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-[#5f6673]">{subtitle}</p>}
          </div>
          {closeLabel ? (
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex h-9 shrink-0 items-center rounded-lg border border-[#d8dadc] bg-white px-4 text-sm font-bold text-[#0d1117] shadow-sm transition hover:border-[#6be9c2] hover:bg-[#eff4ff] ${FOCUS_RING}`}
            >
              {closeLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-[#6b7280] transition hover:bg-[#eff4ff] hover:text-[#0d1117] ${FOCUS_RING}`}
              aria-label="Close modal"
            >
              <XIcon />
            </button>
          )}
        </div>
        <div className="max-h-[calc(86vh-76px)] overflow-auto p-5">{children}</div>
      </div>
    </ModalShell>
  );
}
