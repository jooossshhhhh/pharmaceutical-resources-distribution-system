const cardBase =
  "rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs";

export function AuditSummaryGrid({ children }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}

export function AuditSummaryCard({
  count,
  isActive = false,
  label,
  meta,
  onClick,
}) {
  const content = (
    <>
      <p className="text-2xl font-black tabular-nums text-[#1B2B30]">
        {count}
      </p>
      <h3 className="mt-1 text-sm font-black text-[#1B2B30]">{label}</h3>
      {meta && <p className="mt-1 text-xs font-medium text-[#5B7077]">{meta}</p>}
    </>
  );

  if (!onClick) {
    return <div className={`${cardBase} p-4`}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cardBase} p-4 text-left transition hover:-translate-y-0.5 hover:border-[#1F4E5A] hover:shadow-xs ${
        isActive ? "border-[#1F4E5A] ring-1 ring-[#1F4E5A]" : ""
      }`}
    >
      {content}
    </button>
  );
}

export function AuditFilterPanel({ children, onReset, title }) {
  return (
    <aside className={`${cardBase} h-fit min-w-0 overflow-hidden p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#1F4E5A]">
            Filters
          </p>
          <h2 className="mt-1 text-sm font-black text-[#1B2B30]">{title}</h2>
        </div>
        <FilterIcon className="h-4 w-4 text-[#5B7077]" />
      </div>
      <div className="mt-4 grid min-w-0 gap-4">{children}</div>
      <button
        type="button"
        onClick={onReset}
        className="mt-5 h-10 w-full rounded-lg bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] text-sm font-black text-white shadow-xs transition hover:brightness-105 active:scale-[0.99]"
      >
        Reset Filters
      </button>
    </aside>
  );
}

export function AuditSearchField({ label, onChange, placeholder, value }) {
  return (
    <label className="grid min-w-0 gap-2 text-xs font-black uppercase tracking-wide text-[#5B7077]">
      {label}
      <div className="relative min-w-0">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5B7077]">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-10 min-w-0 w-full rounded-lg border border-[#CFDDE0] bg-white pl-9 pr-3 text-sm font-medium normal-case tracking-normal text-[#1B2B30] outline-none transition placeholder:text-[#5B7077]/70 focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
        />
      </div>
    </label>
  );
}

export function AuditRadioGroup({ label, name, onChange, options, value }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-xs font-black uppercase tracking-wide text-[#5B7077]">
        {label}
      </legend>
      <div className="mt-2 grid gap-1.5">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-bold transition ${
              value === option.value
                ? "bg-[#E8F5F1] text-[#2D7A5D]"
                : "text-[#5B7077] hover:bg-[#F4F8F8]"
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 accent-[#1F4E5A]"
            />
            <span className="min-w-0 break-words">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AuditChipBar({ options, value, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black transition ${
            value === option.value
              ? "bg-[#1F4E5A] text-white"
              : "bg-white text-[#5B7077] ring-1 ring-[#CFDDE0] hover:bg-[#F4F8F8] hover:text-[#1B2B30]"
          }`}
        >
          {option.label}
          {option.count !== undefined && (
            <span
              className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${
                value === option.value ? "bg-white/20 text-white" : "bg-[#E5EFF1] text-[#5B7077]"
              }`}
            >
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function AuditSelectField({ label, onChange, options, value }) {
  return (
    <label className="grid min-w-0 gap-2 text-xs font-black uppercase tracking-wide text-[#5B7077]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-0 w-full rounded-lg border border-[#CFDDE0] bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[#1B2B30] outline-none transition focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AuditDateField({ label, onChange, value }) {
  return (
    <label className="grid min-w-0 gap-2 text-xs font-black uppercase tracking-wide text-[#5B7077]">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-0 w-full rounded-lg border border-[#CFDDE0] bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[#1B2B30] outline-none transition focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
      />
    </label>
  );
}

export function AuditListPanel({
  action,
  bodyClassName = "max-h-[68vh]",
  children,
  count,
  emptyDescription,
  emptyTitle,
  footer,
  isLoading,
  label,
}) {
  return (
    <section className={`${cardBase} min-w-0 self-start overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#CFDDE0] bg-[#EBF3F5] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-[#1F4E5A]">
            {label}
          </p>
          <p className="mt-0.5 text-xs font-bold text-[#5B7077]">
            {count} shown
          </p>
        </div>
        {action}
      </div>
      <div className={`prds-modal-scrollbar min-w-0 overflow-y-auto p-4 ${bodyClassName}`}>
        {isLoading ? (
          <AuditSkeletonList />
        ) : count === 0 ? (
          <AuditEmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          children
        )}
      </div>
      {footer}
    </section>
  );
}

export function AuditTimeline({ children }) {
  return (
    <div className="relative min-w-0 space-y-5 before:absolute before:bottom-0 before:left-3 before:top-3 before:w-px before:bg-[#CFDDE0]">
      {children}
    </div>
  );
}

export function AuditDateGroup({ children, label }) {
  return (
    <section className="relative min-w-0 pl-8">
      <div className="sticky top-0 z-10 mb-2 inline-flex rounded-full border border-[#CFDDE0] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#5B7077] shadow-xs">
        {label}
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}

export function AuditEventShell({ children, isUnread = false, tone = "emerald" }) {
  const dotClass = "bg-[#CFDDE0]";
  const borderClass = isUnread
    ? "border-[#CFDDE0] border-l-[#1F4E5A] border-l-4 bg-white"
    : "border-[#CFDDE0] bg-white";
  const toneClass = {
    amber: "ring-[#E09453]/40",
    blue: "ring-[#34769B]/40",
    emerald: "ring-[#4C9F80]/40",
    red: "ring-[#D9826B]/40",
    slate: "ring-[#CFDDE0]",
  }[tone];

  return (
    <article className="relative min-w-0">
      <span className={`absolute -left-7 top-4 h-3.5 w-3.5 rounded-full border-4 border-white shadow-xs ring-1 ${toneClass} ${dotClass}`} />
      <div className={`min-w-0 rounded-xl border p-4 shadow-xs transition hover:shadow-sm ${borderClass}`}>
        {children}
      </div>
    </article>
  );
}

export function AuditBadge({ children, tone = "slate" }) {
  const toneClass = {
    amber: "bg-[#faeed6] text-[#b8741a]",
    blue: "bg-[#e6f0f7] text-[#34769B]",
    emerald: "bg-[#E8F5F1] text-[#2D7A5D]",
    red: "bg-[#faedf0] text-[#D9826B]",
    slate: "bg-[#E5EFF1] text-[#5B7077]",
  }[tone];

  return (
    <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wide ${toneClass}`}>
      {children}
    </span>
  );
}

export function AuditMetaRow({ items }) {
  return (
    <div className="mt-3 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[#5B7077]">
      {items.filter(Boolean).map((item, index) => (
        <span key={`${item}-${index}`} className="min-w-0 break-words [overflow-wrap:anywhere]">
          {item}
        </span>
      ))}
    </div>
  );
}

export function AuditIcon({ children, tone = "emerald" }) {
  const toneClass = {
    amber: "bg-[#faeed6] text-[#b8741a]",
    blue: "bg-[#e6f0f7] text-[#34769B]",
    emerald: "bg-[#E8F5F1] text-[#2D7A5D]",
    red: "bg-[#faedf0] text-[#D9826B]",
    slate: "bg-[#E5EFF1] text-[#5B7077]",
  }[tone];

  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
      {children}
    </span>
  );
}

function AuditSkeletonList() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="rounded-xl border border-[#CFDDE0] bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 animate-pulse rounded-lg bg-[#E5EFF1]" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-4 w-2/5 animate-pulse rounded bg-[#E5EFF1]" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-[#E5EFF1]" />
              <div className="flex gap-2">
                <div className="h-3 w-24 animate-pulse rounded bg-[#E5EFF1]" />
                <div className="h-3 w-20 animate-pulse rounded bg-[#E5EFF1]" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditEmptyState({ description, title }) {
  return (
    <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-[#CFDDE0] bg-[#F4F8F8] px-6 py-12 text-center">
      <div>
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#5B7077] shadow-xs">
          <InboxIcon />
        </span>
        <h3 className="mt-4 text-sm font-black text-[#1B2B30]">{title}</h3>
        <p className="mt-1 max-w-md text-sm font-medium text-[#5B7077]">
          {description}
        </p>
      </div>
    </div>
  );
}

export function SearchIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function FilterIcon({ className = "h-4 w-4" }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

export function InboxIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M4 4h16v16H4z" />
      <path d="M4 14h4l2 3h4l2-3h4" />
    </svg>
  );
}



