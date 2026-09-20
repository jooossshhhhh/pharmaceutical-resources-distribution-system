import { PillIcon } from "./MedicineIcons";

export default function MedicineCatalogTable({
  hasMedicines,
  isLoading,
  medicines,
  onAdd,
  onClearSearch,
  onSelectMedicine,
  selectedMedicineId,
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
        <div>
          <h2 className="text-base font-black text-black">Medicine List</h2>
          <p className="text-xs font-semibold text-neutral-500">
            Click a row to review the medicine details.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-left text-[11px] font-black uppercase tracking-[0.14em] text-neutral-500">
              <th className="px-5 py-3">Medicine</th>
              <th className="px-5 py-3">Dosage</th>
              <th className="px-5 py-3">Unit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isLoading ? (
              Array.from({ length: 6 }, (_, index) => <MedicineRowSkeleton key={index} />)
            ) : medicines.length === 0 ? (
              <tr>
                <td colSpan="3" className="px-5 py-14">
                  <MedicineEmptyState
                    hasMedicines={hasMedicines}
                    onAdd={onAdd}
                    onClearSearch={onClearSearch}
                  />
                </td>
              </tr>
            ) : (
              medicines.map((medicine) => {
                const isSelected = selectedMedicineId === medicine.id;

                return (
                  <tr
                    key={medicine.id}
                    onClick={() => onSelectMedicine(medicine.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectMedicine(medicine.id);
                      }
                    }}
                    tabIndex={0}
                    aria-selected={isSelected}
                    className={`cursor-pointer border-l-2 transition ${
                      isSelected
                        ? "border-l-emerald-500 bg-[#e8fff7]"
                        : "border-l-transparent hover:bg-[#f8f9ff]"
                    }`}
                  >
                    <td className="px-5 py-4">
                      <p className="max-w-[24rem] text-sm font-black text-black">
                        {medicine.generic_name || "Unnamed medicine"}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-neutral-400">
                        {medicine.brand_name || "Generic medicine"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-black text-neutral-700">
                        {medicine.dosage || "Not set"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
                        {medicine.unit_of_measure || "Not set"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MedicineEmptyState({ hasMedicines, onAdd, onClearSearch }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <PillIcon />
      </span>
      {hasMedicines ? (
        <>
          <p className="text-sm font-black text-neutral-700">No medicines match this search.</p>
          <button
            type="button"
            onClick={onClearSearch}
            className="mt-1 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 hover:bg-emerald-100"
          >
            Clear search
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-black text-neutral-700">No medicines in the catalog yet.</p>
          <p className="max-w-sm text-sm font-medium text-neutral-500">
            Add medicines here before recording stock, requests, and dispensing.
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-1 rounded-lg bg-black px-4 py-2 text-sm font-black text-white hover:bg-neutral-800"
          >
            Add Medicine
          </button>
        </>
      )}
    </div>
  );
}

function MedicineRowSkeleton() {
  return (
    <tr>
      <td className="px-5 py-4">
        <div className="h-4 w-40 animate-pulse rounded bg-neutral-100" />
        <div className="mt-2 h-3 w-20 animate-pulse rounded bg-neutral-100" />
      </td>
      <td className="px-5 py-4">
        <div className="h-4 w-28 animate-pulse rounded bg-neutral-100" />
      </td>
      <td className="px-5 py-4">
        <div className="h-5 w-16 animate-pulse rounded-full bg-neutral-100" />
      </td>
      <td className="px-5 py-4">
        <div className="h-5 w-20 animate-pulse rounded-full bg-neutral-100" />
      </td>
    </tr>
  );
}
