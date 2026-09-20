import { requestStatusLabels, requestStatusTones } from "./requestUtils";

const statusDotTones = {
  APPROVED: "bg-blue-500",
  COMPLETED: "bg-emerald-500",
  PENDING: "bg-orange-500",
  REJECTED: "bg-red-500",
};

export function RequestStatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
        requestStatusTones[status] || "bg-neutral-100 text-neutral-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${statusDotTones[status] || "bg-neutral-300"}`} />
      {requestStatusLabels[status] || status || "Unknown"}
    </span>
  );
}

export function RequestPriorityBadge({ priority }) {
  const tone =
    priority === "HIGH"
      ? "bg-red-100 text-red-700"
      : priority === "MEDIUM"
        ? "bg-amber-100 text-amber-700"
        : "bg-neutral-100 text-neutral-600";

  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${tone}`}>
      {priority || "LOW"} priority
    </span>
  );
}

export function RequestMetricCard({
  active = false,
  icon,
  label,
  note,
  onClick,
  value,
}) {
  const Component = onClick ? "button" : "article";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`group rounded-xl border px-4 py-3 text-left shadow-sm transition-all duration-200 ${
        active
          ? "border-[#6be9c2] bg-[#6be9c2] text-[#0d1117] shadow-md shadow-emerald-100"
          : "border-neutral-200 bg-white text-[#0d1117] hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${active ? "text-[#0d1117]/70" : "text-neutral-500"}`}>
            {label}
          </p>
          <p className="mt-3 text-2xl font-black leading-none">{value}</p>
          <p className={`mt-1 truncate text-[11px] font-semibold ${active ? "text-[#0d1117]/70" : "text-neutral-500"}`}>
            {note}
          </p>
        </div>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            active ? "bg-white/55 text-[#0d1117]" : "bg-neutral-50 text-neutral-500 group-hover:bg-emerald-50 group-hover:text-emerald-700"
          }`}
        >
          {icon}
        </span>
      </div>
    </Component>
  );
}

export function RequestPanel({ children, className = "" }) {
  return (
    <section className={`overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function RequestPanelHeader({ actions, eyebrow, subtitle, title }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
            {eyebrow}
          </p>
        )}
        <h2 className="text-base font-black text-black">{title}</h2>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-neutral-500">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  );
}

export function RequestSearchInput({ onChange, placeholder, value }) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
        <SearchIcon />
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

export function RequestToolbar({ children }) {
  return (
    <div className="flex flex-col gap-3 border-b border-neutral-100 px-4 py-3 lg:flex-row lg:items-center">
      {children}
    </div>
  );
}

export function IconButton({ children, disabled, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function ActionButton({
  children,
  disabled,
  onClick,
  tone = "neutral",
  type = "button",
}) {
  const tones = {
    danger: "border-red-300 bg-white text-red-600 hover:bg-red-50 disabled:text-neutral-300",
    dark: "border-black bg-black text-white hover:bg-[#0d1117] disabled:border-neutral-300 disabled:bg-neutral-300",
    primary: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 disabled:border-neutral-300 disabled:bg-neutral-300",
    soft: "border-neutral-200 bg-white text-neutral-700 hover:border-emerald-300 hover:text-emerald-700",
    neutral: "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-black transition disabled:cursor-not-allowed ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export function SelectFilter({ className = "", onChange, options, value }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function SortDropdown({ isOpen, onChange, onToggle, options, value }) {
  const selectedOption = options.find((option) => option.value === value) || options[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex h-10 min-w-[9.5rem] items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 outline-none transition hover:bg-neutral-50 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      >
        <span className="inline-flex items-center gap-2">
          <SortIcon />
          {selectedOption.label}
        </span>
        <ChevronIcon />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl shadow-neutral-200/70">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold ${
                option.value === value
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {option.label}
              {option.value === value && <SmallCheckIcon />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RequestEmptyState({
  actionLabel,
  description,
  icon = <InboxIcon />,
  onAction,
  title,
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        {icon}
      </span>
      <p className="mt-4 text-sm font-black text-neutral-700">{title}</p>
      <p className="mt-1 max-w-sm text-xs font-semibold leading-5 text-neutral-500">
        {description}
      </p>
      {onAction && actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-black px-4 text-xs font-bold text-white transition hover:bg-[#0d1117]"
        >
          <PlusIcon />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function DetailPanel({ children, title }) {
  return (
    <section className="rounded-lg border border-neutral-100 bg-neutral-50 p-4">
      <h3 className="text-xs font-black uppercase tracking-[0.12em] text-neutral-500">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SectionTitle({ icon, title }) {
  return (
    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-neutral-600">
      <span className="text-neutral-500">{icon}</span>
      {title}
    </div>
  );
}

export const AlertIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </svg>
);

export const BoxIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
    <path d="m21 8-9-5-9 5 9 5 9-5Z" />
    <path d="M3 8v8l9 5 9-5V8" />
    <path d="M12 13v8" />
  </svg>
);

export const CheckIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
    <path d="m5 13 4 4L19 7" />
  </svg>
);

export const ChevronIcon = () => (
  <svg className="h-4 w-4 text-neutral-400" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const ClipboardIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M9 5h6" />
    <path d="M9 12h6" />
    <path d="M9 16h4" />
    <path d="M8 3h8l1 2h3v16H4V5h3z" />
  </svg>
);

export const ClockIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v5l3 2" />
  </svg>
);

export const CloseIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const DownloadIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

export const InboxIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
    <path d="M4 4h16v11H4z" />
    <path d="M4 15h5l1 2h4l1-2h5" />
  </svg>
);

export const PlusIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

export const RefreshIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M20 11a8 8 0 0 0-14.9-4" />
    <path d="M5 3v4h4" />
    <path d="M4 13a8 8 0 0 0 14.9 4" />
    <path d="M19 21v-4h-4" />
  </svg>
);

export const RequestIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
    <path d="M7 3h8l4 4v14H7V3Z" />
    <path d="M14 3v5h5M10 13h6M10 17h4" />
  </svg>
);

export const SearchIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const SmallCheckIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const SortIcon = () => (
  <svg className="h-4 w-4 text-neutral-500" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M4 7h12" />
    <path d="M4 12h8" />
    <path d="M4 17h4" />
  </svg>
);

export const TransitIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
    <path d="M3 12h12" />
    <path d="m12 7 5 5-5 5" />
    <path d="M19 5v14" />
  </svg>
);

export const TruckIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M10 17h4V5H2v12h3" />
    <path d="M14 8h4l4 4v5h-3" />
    <circle cx="7.5" cy="17.5" r="2.5" />
    <circle cx="16.5" cy="17.5" r="2.5" />
  </svg>
);

