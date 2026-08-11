import ModalShell from "../../components/ModalShell";
import { transferStatusLabels, transferStatusTones } from "./transferUtils";

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

export const TruckIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 7h11v10H3z" />
    <path d="M14 10h4l3 3v4h-7z" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);

export const ClockIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v5l3 2" />
  </svg>
);

export const CheckIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="m5 12 4 4L19 6" />
  </svg>
);

export const XIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const LayersIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="m12 3 8 4-8 4-8-4 8-4Z" />
    <path d="m4 11 8 4 8-4" />
    <path d="m4 15 8 4 8-4" />
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

export const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
      transferStatusTones[status] || "bg-neutral-100 text-neutral-600"
    }`}
  >
    {transferStatusLabels[status] || status || "Unknown"}
  </span>
);

export function FilterChip({ active, children, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 ${
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
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-[#0d1117] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6be9c2] hover:bg-[#eff4ff]"
      title={sort === "newest" ? "Newest first" : "Oldest first"}
      aria-label={sort === "newest" ? "Sort newest first" : "Sort oldest first"}
    >
      <SortDirectionIcon direction={sort} />
      <span>{sort === "newest" ? "Newest" : "Oldest"}</span>
    </button>
  );
}

export function MetricCard({ active, icon, label, onClick, value, detail }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#6be9c2] hover:shadow-md ${
        active ? "border-[#6be9c2] ring-1 ring-[#6be9c2]" : "border-[#d8dadc]"
      }`}
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#dffbf2] text-[#008f68]">
        {icon}
      </div>
      <p className="text-2xl font-bold leading-none text-[#0d1117]">{value}</p>
      <p className="mt-2 text-xs font-bold text-[#0d1117]">{label}</p>
      <p className="mt-1 text-xs text-[#5f6673]">{detail}</p>
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

export function TransferModal({ children, onClose, title, subtitle, widthClass = "max-w-4xl" }) {
  return (
    <ModalShell
      labelledBy="transfer-modal-title"
      onClose={onClose}
      overlayClassName="bg-black/45"
      panelClassName={widthClass}
    >
      <div className="max-h-[86vh] w-full overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e5e7eb] px-5 py-4">
          <div>
            <h2 id="transfer-modal-title" className="text-lg font-bold text-[#0d1117]">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-[#5f6673]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#6b7280] transition hover:bg-[#eff4ff] hover:text-[#0d1117]"
            aria-label="Close modal"
          >
            <XIcon />
          </button>
        </div>
        <div className="max-h-[calc(86vh-76px)] overflow-auto p-5">{children}</div>
      </div>
    </ModalShell>
  );
}
