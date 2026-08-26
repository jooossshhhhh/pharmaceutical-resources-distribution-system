import { PlusIcon, SearchIcon, SortArrowIcon } from "./MedicineIcons";

export default function MedicineToolbar({
  medicineSort,
  onAdd,
  onSearchChange,
  onSortChange,
  searchTerm,
  shownCount,
  totalCount,
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
            Medicine Catalog
          </p>
          <h2 className="mt-1 text-xl font-black text-black">Registered Medicines</h2>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Showing {shownCount} of {totalCount} medicine records.
          </p>
        </div>

        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-black px-4 text-sm font-black text-white shadow-sm transition hover:-translate-y-px hover:bg-neutral-800"
        >
          <PlusIcon />
          Add Medicine
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
            <SearchIcon />
          </span>
          <input
            type="search"
            aria-label="Search medicines"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search medicine, brand, dosage, unit, or cost..."
            className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-semibold text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </label>

        <button
          type="button"
          onClick={onSortChange}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50"
          aria-label={`Sort medicines ${medicineSort === "ASC" ? "descending" : "ascending"}`}
        >
          <SortArrowIcon direction={medicineSort} />
          {medicineSort === "ASC" ? "A-Z" : "Z-A"}
        </button>
      </div>
    </section>
  );
}
