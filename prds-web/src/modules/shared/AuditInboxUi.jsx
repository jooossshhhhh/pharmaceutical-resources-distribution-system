const cardBase =
  "rounded-xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/50";

export function AuditSummaryGrid({ children }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}

export function AuditSummaryCard({
  count,
  icon,
  isActive = false,
  label,
  meta,
  onClick,
  tone = "emerald",
}) {
  const toneClass = {
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-50 text-slate-700",
  }[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}`}>
          {icon}
        </span>
        {isActive && (
          <span className="rounded-full bg-[#6be9c2] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0d1117]">
            Active
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-black tabular-nums text-[#0d1117]">
        {count}
      </p>
      <h3 className="mt-1 text-sm font-black text-[#0d1117]">{label}</h3>
      {meta && <p className="mt-1 text-xs font-medium text-[#42474e]">{meta}</p>}
    </>
  );

  if (!onClick) {
    return <div className={`${cardBase} p-4`}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cardBase} p-4 text-left transition hover:-translate-y-0.5 hover:border-[#6be9c2] hover:shadow-md ${
        isActive ? "border-[#6be9c2] ring-1 ring-[#6be9c2]" : ""
      }`}
    >
      {content}
    </button>
  );
}

export function AuditFilterPanel({ children, onReset, title }) {
  return (
    <aside className={`${cardBase} h-fit p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#00a36c]">
            Filters
          </p>
          <h2 className="mt-1 text-sm font-black text-[#0d1117]">{title}</h2>
        </div>
        <FilterIcon className="h-4 w-4 text-[#42474e]" />
      </div>
      <div className="mt-4 grid gap-4">{children}</div>
      <button
        type="button"
        onClick={onReset}
        className="mt-5 h-10 w-full rounded-lg bg-[#0d1117] text-sm font-black text-white transition hover:bg-[#42474e]"
      >
        Reset Filters
      </button>
    </aside>
  );
}

export function AuditSearchField({ label, onChange, placeholder, value }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-[#42474e]">
      {label}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium normal-case tracking-normal text-[#0d1117] outline-none transition placeholder:text-neutral-400 focus:border-[#00a36c] focus:ring-2 focus:ring-emerald-100"
        />
      </div>
    </label>
  );
}

export function AuditRadioGroup({ label, name, onChange, options, value }) {
  return (
    <fieldset>
      <legend className="text-xs font-black uppercase tracking-wide text-[#42474e]">
        {label}
      </legend>
      <div className="mt-2 grid gap-1.5">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-bold transition ${
              value === option.value
                ? "bg-emerald-50 text-[#0d1117]"
                : "text-[#42474e] hover:bg-[#eff4ff]"
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 accent-[#00a36c]"
            />
            {option.label}
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
              ? "bg-[#0d1117] text-white"
              : "bg-white text-[#42474e] ring-1 ring-neutral-200 hover:bg-[#eff4ff] hover:text-[#0d1117]"
          }`}
        >
          {option.label}
          {option.count !== undefined && (
            <span
              className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${
                value === option.value ? "bg-white/20" : "bg-neutral-100"
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
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-[#42474e]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-emerald-100"
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
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-[#42474e]">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

export function AuditListPanel({
  action,
  children,
  count,
  emptyDescription,
  emptyTitle,
  isLoading,
  label,
}) {
  return (
    <section className={`${cardBase} min-w-0 self-start overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-[#f8f9ff] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-[#00a36c]">
            {label}
          </p>
          <p className="mt-0.5 text-xs font-bold text-[#42474e]">
            {count} shown
          </p>
        </div>
        {action}
      </div>
      <div className="prds-modal-scrollbar max-h-[68vh] overflow-y-auto p-4">
        {isLoading ? (
          <AuditSkeletonList />
        ) : count === 0 ? (
          <AuditEmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function AuditTimeline({ children }) {
  return (
    <div className="relative space-y-5 before:absolute before:bottom-0 before:left-3 before:top-3 before:w-px before:bg-neutral-200">
      {children}
    </div>
  );
}

export function AuditDateGroup({ children, label }) {
  return (
    <section className="relative pl-8">
      <div className="sticky top-0 z-10 mb-2 inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#42474e] shadow-sm">
        {label}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function AuditEventShell({ children, isUnread = false, tone = "emerald" }) {
  const dotClass = isUnread ? "bg-[#00a36c]" : "bg-neutral-300";
  const borderClass = isUnread ? "border-[#6be9c2] bg-emerald-50/50" : "border-neutral-200 bg-white";
  const toneClass = {
    amber: "ring-amber-200",
    blue: "ring-blue-200",
    emerald: "ring-emerald-200",
    red: "ring-red-200",
    slate: "ring-neutral-200",
  }[tone];

  return (
    <article className="relative">
      <span className={`absolute -left-7 top-4 h-3.5 w-3.5 rounded-full border-4 border-white shadow-sm ring-1 ${toneClass} ${dotClass}`} />
      <div className={`rounded-xl border p-4 shadow-sm transition hover:shadow-md ${borderClass}`}>
        {children}
      </div>
    </article>
  );
}

export function AuditBadge({ children, tone = "slate" }) {
  const toneClass = {
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    slate: "bg-neutral-100 text-neutral-700",
  }[tone];

  return (
    <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wide ${toneClass}`}>
      {children}
    </span>
  );
}

export function AuditMetaRow({ items }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[#42474e]">
      {items.filter(Boolean).map((item, index) => (
        <span key={`${item}-${index}`}>{item}</span>
      ))}
    </div>
  );
}

export function AuditIcon({ children, tone = "emerald" }) {
  const toneClass = {
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-50 text-red-600",
    slate: "bg-neutral-100 text-neutral-700",
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
        <div key={item} className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 animate-pulse rounded-lg bg-neutral-100" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-4 w-2/5 animate-pulse rounded bg-neutral-100" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-neutral-100" />
              <div className="flex gap-2">
                <div className="h-3 w-24 animate-pulse rounded bg-neutral-100" />
                <div className="h-3 w-20 animate-pulse rounded bg-neutral-100" />
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
    <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/70 px-6 py-12 text-center">
      <div>
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#42474e] shadow-sm">
          <InboxIcon />
        </span>
        <h3 className="mt-4 text-sm font-black text-[#0d1117]">{title}</h3>
        <p className="mt-1 max-w-md text-sm font-medium text-[#42474e]">
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



