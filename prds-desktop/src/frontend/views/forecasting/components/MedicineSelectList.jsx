import { Layers, Minus, TrendingDown, TrendingUp } from "lucide-react";

export default function MedicineSelectList({
  medicines = [],
  mode = "medicine",
  categoryOptions = [],
  selectedCategory = "",
  onModeChange,
  onSelectCategory,
  selectedMedicineId = "",
  onSelectMedicine,
}) {
  return (
    <section className="flex flex-col rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-slate-200/40">
      <div className="border-b border-slate-100 px-4 py-3.5">
        <div className="mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-slate-400" />
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500">
            {mode === "category" ? "Select Category" : "Select Medicine"}
          </h2>
        </div>
        <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-0.5 text-xs font-bold">
          {[{ key: "medicine", label: "Medicine" }, { key: "category", label: "Category" }].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onModeChange?.(option.key)}
              className={`rounded-md px-2 py-1.5 transition ${mode === option.key
                  ? "bg-white text-[#00a36c] shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
                }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {mode === "category" && (
          <select
            aria-label="Select medicine category"
            value={selectedCategory}
            onChange={(event) => onSelectCategory?.(event.target.value)}
            className="mt-3 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/30"
          >
            <option value="">Select category</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 pr-1 custom-scrollbar">
        {medicines.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-xs font-semibold text-slate-500">No medicines match filters</p>
          </div>
        ) : (
          medicines.map((med) => {
            const isSelected = med.medicineId === selectedMedicineId;
            const fullName = `${med.genericName} ${med.dosage || ""}`.trim();
            const slope = Number(med.slope || 0);

            return (
              <button
                key={med.medicineId}
                type="button"
                onClick={() => onSelectMedicine(med.medicineId)}
                className={`group flex w-full items-center justify-between px-4 py-3 text-left transition ${
                  isSelected
                    ? "border-l-4 border-[#00a36c] bg-[#e6fbf4]"
                    : "border-l-4 border-transparent hover:bg-slate-50"
                }`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <p
                    className={`truncate text-sm font-bold ${
                      isSelected ? "text-[#00a36c]" : "text-slate-900 group-hover:text-[#00a36c]"
                    }`}
                  >
                    {fullName}
                  </p>
                  <p className="truncate text-xs font-medium text-slate-400">
                    {med.category || "General"}
                  </p>
                </div>

                <div className="shrink-0 pl-2">
                  {slope > 0.05 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500 transition-transform group-hover:scale-110" />
                  ) : slope < -0.05 ? (
                    <TrendingDown className="h-4 w-4 text-rose-500 transition-transform group-hover:scale-110" />
                  ) : (
                    <Minus className="h-3.5 w-3.5 text-slate-300" />
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
