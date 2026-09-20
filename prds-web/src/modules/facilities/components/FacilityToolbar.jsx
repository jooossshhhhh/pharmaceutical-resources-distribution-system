const stockChipOptions = [
  { value: "ALL", label: "All stock conditions" },
  { value: "HEALTHY", label: "Healthy" },
  { value: "WATCH", label: "Warning" },
  { value: "LOW", label: "Low Stock" },
  { value: "CRITICAL", label: "Critical" },
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
}) {
  return (
    <section className="mt-4 rounded-xl border border-[#d8dadc] bg-white p-4 shadow-sm">
      <div className="facilities-toolbar">
        <div className="facilities-toolbar-controls">
          {viewMode === "list" && (
            <label className="relative block w-full min-w-0 lg:max-w-xl xl:max-w-2xl">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                <SearchIcon />
              </span>
              <input
                type="search"
                aria-label="Search facility"
                value={searchTerm}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search by facility name, code, address, or stock condition..."
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {viewMode === "list" && (
              <label className="relative min-w-[12rem]">
                <span className="sr-only">Filter stock condition</span>
                <select
                  value={stockFilter}
                  onChange={(event) => onStockFilterChange(event.target.value)}
                  className="h-10 w-full appearance-none rounded-lg border border-neutral-200 bg-white px-3 pr-9 text-sm font-black text-neutral-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  {stockChipOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <ChevronDownIcon />
                </span>
              </label>
            )}
            {viewMode === "list" && (
              <button
                type="button"
                onClick={onSortToggle}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
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
          <div className="flex items-center rounded-lg border border-neutral-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-black transition ${
                viewMode === "list"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <ListIcon />
              List
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("map")}
              className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-black transition ${
                viewMode === "map"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <MapViewIcon />
              Map
            </button>
          </div>
          <button
            type="button"
            onClick={onAddFacility}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-black px-4 text-sm font-black text-white shadow-sm transition hover:bg-neutral-800"
          >
            <PlusIcon />
            Add Facility
          </button>
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
