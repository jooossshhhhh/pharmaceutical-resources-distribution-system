import { useEffect, useRef, useState } from "react";
import { requestStatusLabels, requestStatusTones } from "@shared/utils/requestUtils";

const statusDotTones = {
  APPROVED: "bg-[#4C9F80]",
  COMPLETED: "bg-[#4C9F80]",
  PENDING: "bg-[#D9826B]",
  REJECTED: "bg-[#D9826B]",
};

export function RequestStatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
        requestStatusTones[status] || "bg-[#E5EFF1] text-[#5B7077]"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${statusDotTones[status] || "bg-[#CFDDE0]"}`} />
      {requestStatusLabels[status] || status || "Unknown"}
    </span>
  );
}

export function RequestPriorityBadge({ priority }) {
  const tone =
    priority === "HIGH"
      ? "bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/25"
      : priority === "MEDIUM"
        ? "bg-[#E3EEF5] text-[#1F4A66] border border-[#34769B]/25"
        : "bg-[#E5EFF1] text-[#5B7077] border border-[#CFDDE0]";

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
      className={`group rounded-xl border px-4 py-3 text-left shadow-xs transition-all duration-200 ${
        active
          ? "border-[#34769B] bg-[#34769B] text-white shadow-sm"
          : "border-[#CFDDE0] bg-[#F9FBFB] text-[#1B2B30] hover:-translate-y-0.5 hover:border-[#34769B]/40 hover:shadow-xs"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${active ? "text-white/80" : "text-[#5B7077]"}`}>
            {label}
          </p>
          <p className="mt-3 text-2xl font-black leading-none">{value}</p>
          <p className={`mt-1 truncate text-[11px] font-semibold ${active ? "text-white/80" : "text-[#5B7077]"}`}>
            {note}
          </p>
        </div>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            active ? "bg-white/20 text-white" : "bg-[#E5EFF1] text-[#5B7077] group-hover:bg-[#E3EEF5] group-hover:text-[#34769B]"
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
    <section className={`overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs ${className}`}>
      {children}
    </section>
  );
}

export function RequestPanelHeader({ actions, eyebrow, subtitle, title }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#CFDDE0]/60 px-4 py-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#34769B]">
            {eyebrow}
          </p>
        )}
        <h2 className="text-base font-black text-[#1B2B30]">{title}</h2>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-[#5B7077]">
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
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5B7077]">
        <SearchIcon />
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] pl-9 pr-3 text-sm font-medium text-[#1B2B30] outline-none transition placeholder:text-[#5B7077]/70 focus:border-[#34769B] focus:ring-2 focus:ring-[#E3EEF5]"
      />
    </label>
  );
}

export function RequestToolbar({ children }) {
  return (
    <div className="flex flex-col gap-3 border-b border-[#CFDDE0]/60 px-4 py-3 lg:flex-row lg:items-center">
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
    dark: "btn-primary border-[#2F7094] text-white disabled:border-neutral-300 disabled:bg-neutral-300 shadow-xs",
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

export function FilterDropdown({
  className = "",
  icon = null,
  menuClassName = "",
  onChange,
  options = [],
  placeholder = "Select...",
  value,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-sm font-semibold outline-none transition-all duration-200 ${
          isOpen
            ? "border-emerald-500 ring-2 ring-emerald-100 text-neutral-900 shadow-sm"
            : "border-neutral-200 text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50/80"
        }`}
      >
        <span className="inline-flex items-center gap-2 truncate">
          {icon}
          <span>{selectedOption?.label || placeholder}</span>
        </span>
        <span
          className={`shrink-0 text-neutral-400 transition-transform duration-200 ease-out ${
            isOpen ? "rotate-180 text-emerald-600" : ""
          }`}
        >
          <ChevronIcon />
        </span>
      </button>

      <div
        className={`absolute right-0 z-30 mt-1.5 min-w-[10.5rem] overflow-hidden rounded-xl border border-neutral-200/90 bg-white p-1 shadow-xl shadow-neutral-900/10 transition-all duration-200 ease-out origin-top ${menuClassName} ${
          isOpen
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 -translate-y-2 pointer-events-none invisible"
        }`}
      >
        <div className="space-y-0.5">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(option.value);
                  setIsOpen(false);
                }}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors duration-150 ${
                  isSelected
                    ? "bg-emerald-50 text-emerald-700 font-bold"
                    : "text-neutral-700 hover:bg-neutral-100/80 hover:text-neutral-900"
                }`}
              >
                <span>{option.label}</span>
                {isSelected && (
                  <span className="text-emerald-600">
                    <SmallCheckIcon />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SortDropdown({ onChange, options, value, className = "" }) {
  return (
    <FilterDropdown
      className={className || "min-w-[9.5rem]"}
      icon={<SortIcon />}
      onChange={onChange}
      options={options}
      value={value}
    />
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
          className="btn-primary mt-4 inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-bold text-white shadow-xs transition cursor-pointer"
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

