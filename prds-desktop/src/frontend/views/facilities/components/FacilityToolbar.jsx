const stockChipOptions = [
  { value: "ALL", label: "All stock conditions" },
  { value: "HEALTHY", label: "Healthy" },
  { value: "WATCH", label: "Warning" },
  { value: "LOW", label: "Low Stock" },
  { value: "CRITICAL", label: "Critical" },
  { value: "NO_DATA", label: "No stock data" },
];

export function FacilityToolbar({
  viewMode,
  searchTerm,
  stockFilter,
  sortDirection,
  onSearchChange,
  onStockFilterChange,
  onSortToggle,
  onViewModeChange,
  onAddFacility,
  canManage = true,
}) {
  return (
    <section className="mt-4 rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-4 shadow-xs">
      <div className="facilities-toolbar">
        <div className="facilities-toolbar-controls">
          {viewMode === "list" && (
            <label className="relative block min-w-0 flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5B7077]">
                <SearchIcon />
              </span>
              <input
                type="search"
                aria-label="Search facility"
                value={searchTerm}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search by facility name, code, address, or stock condition..."
                className="h-10 w-full rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] pl-9 pr-3 text-sm font-medium text-[#1B2B30] outline-none transition placeholder:text-[#5B7077] focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
              />
            </label>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {viewMode === "list" && (
              <label className="relative w-[12rem] shrink-0">
                <span className="sr-only">Filter stock condition</span>
                <select
                  value={stockFilter}
                  onChange={(event) => onStockFilterChange(event.target.value)}
                  className="h-10 w-full appearance-none rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3 pr-9 text-sm font-bold text-[#1B2B30] outline-none transition focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
                >
                  {stockChipOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#5B7077]">
                  <ChevronDownIcon />
                </span>
              </label>
            )}
            {viewMode === "list" && (
              <button
                type="button"
                onClick={onSortToggle}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] text-[#5B7077] transition hover:border-[#1F4E5A] hover:bg-[#EBF3F5] hover:text-[#1F4E5A]"
                aria-label={
                  sortDirection === "ASC"
                    ? "Sort facilities descending"
                    : "Sort facilities ascending"
                }
                title={sortDirection === "ASC" ? "Sort descending" : "Sort ascending"}
              >
                {sortDirection === "ASC" ? <SortAscendingIcon /> : <SortDescendingIcon />}
              </button>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center rounded-lg border border-[#CFDDE0] bg-[#F4F8F8] p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition ${
                viewMode === "list"
                  ? "bg-[#1F4E5A] text-white shadow-xs"
                  : "text-[#5B7077] hover:bg-[#EBF3F5]"
              }`}
            >
              <ListIcon />
              Grid
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("map")}
              className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition ${
                viewMode === "map"
                  ? "bg-[#1F4E5A] text-white shadow-xs"
                  : "text-[#5B7077] hover:bg-[#EBF3F5]"
              }`}
            >
              <MapViewIcon />
              Map
            </button>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={onAddFacility}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-linear-to-r from-[#1F4E5A] to-[#286575] hover:brightness-105 active:scale-[0.99] border border-[#1F4E5A] px-4 text-sm font-bold text-white shadow-xs transition-all"
            >
              <PlusIcon />
              Add Facility
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function MapViewIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
      <path d="M9 3v15M15 6v15" />
    </svg>
  );
}

function SortAscendingIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M4 7h13" />
      <path d="M4 12h9" />
      <path d="M4 17h5" />
      <path d="m17 14 3 3 3-3" />
      <path d="M20 6v11" />
    </svg>
  );
}

function SortDescendingIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M4 7h5" />
      <path d="M4 12h9" />
      <path d="M4 17h13" />
      <path d="m17 10 3-3 3 3" />
      <path d="M20 18V7" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
