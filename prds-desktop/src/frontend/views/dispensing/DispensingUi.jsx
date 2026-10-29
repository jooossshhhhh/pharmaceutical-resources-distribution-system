import ModalShell from "../../components/ModalShell";

export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34769B] focus-visible:ring-offset-1";

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
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border border-[#4C9F80]/30 bg-[#E2F3EC] font-bold text-[#226048]`}
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

export const EyeIcon = () => (
  <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
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

export const FilterIcon = () => (
  <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.586a1 1 0 0 1-.293.707l-6.414 6.414a1 1 0 0 0-.293.707V17l-4 4v-6.586a1 1 0 0 0-.293-.707L3.293 7.293A1 1 0 0 1 3 6.586V4Z" />
  </svg>
);

export const ArrowUpDownIcon = () => (
  <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
  </svg>
);

export const CalendarIcon = ({ className = "h-4 w-4" }) => (
  <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

export const BuildingIcon = ({ className = "h-4 w-4" }) => (
  <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <path d="M9 22v-4h6v4" />
    <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
  </svg>
);

export const AlertTriangleIcon = ({ className = "h-4 w-4" }) => (
  <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export function VoidedBadge() {
  return (
    <span className="inline-flex rounded-full bg-[#FBE9E3] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#8F3F2B]">
      ✕ Cancelled
    </span>
  );
}

export function ActiveBadge() {
  return (
    <span className="inline-flex rounded-full bg-[#E2F3EC] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#226048]">
      ● Active
    </span>
  );
}

export function FilterChip({ active, children, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 cursor-pointer ${FOCUS_RING} ${
        active
          ? "bg-[#34769B] text-white shadow-sm"
          : "bg-[#E5EFF1] text-[#1B2B30] hover:bg-[#E3EEF5]"
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
      className={`btn-secondary inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold shadow-xs transition-all duration-200 hover:-translate-y-0.5 cursor-pointer ${FOCUS_RING}`}
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
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#5B7077]">
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
      className={`h-10 w-full rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3 text-sm text-[#1B2B30] outline-none transition placeholder:text-[#5B7077] focus:border-[#34769B] focus:ring-2 focus:ring-[#34769B]/20 ${props.className || ""}`}
    />
  );
}

export function Select(props) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3 text-sm font-medium text-[#1B2B30] outline-none transition focus:border-[#34769B] focus:ring-2 focus:ring-[#34769B]/20 ${props.className || ""}`}
    />
  );
}

export function Textarea(props) {
  return (
    <textarea
      {...props}
      className={`min-h-24 w-full resize-none rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3 py-2 text-sm text-[#1B2B30] outline-none transition placeholder:text-[#5B7077] focus:border-[#34769B] focus:ring-2 focus:ring-[#34769B]/20 ${props.className || ""}`}
    />
  );
}

export function DispensingModal({
  children,
  closeLabel,
  onClose,
  subtitle,
  title,
  widthClass = "max-w-4xl",
  showCloseButton = true,
}) {
  return (
    <ModalShell
      labelledBy="dispensing-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/40 backdrop-blur-sm"
      panelClassName={widthClass}
    >
      <div className="max-h-[86vh] w-full overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#CFDDE0] px-5 py-4">
          <div>
            <h2 id="dispensing-modal-title" className="text-lg font-bold text-[#1B2B30]">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-[#5B7077]">{subtitle}</p>}
          </div>
          {showCloseButton && (
            closeLabel ? (
              <button
                type="button"
                onClick={onClose}
                className={`btn-secondary inline-flex h-9 shrink-0 items-center rounded-lg px-4 text-sm font-bold shadow-xs transition cursor-pointer ${FOCUS_RING}`}
              >
                {closeLabel}
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-[#5B7077] transition hover:bg-[#E5EFF1] hover:text-[#1B2B30] cursor-pointer ${FOCUS_RING}`}
                aria-label="Close modal"
              >
                <XIcon />
              </button>
            )
          )}
        </div>
        <div className="max-h-[calc(86vh-76px)] overflow-auto p-5">{children}</div>
      </div>
    </ModalShell>
  );
}
