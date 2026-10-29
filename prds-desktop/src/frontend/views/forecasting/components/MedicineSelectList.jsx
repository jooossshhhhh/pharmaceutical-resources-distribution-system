import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Folder, Layers, Minus, Search, TrendingDown, TrendingUp, X } from "lucide-react";

export default function MedicineSelectList({
  mode = "medicine",
  onModeChange,
  medicines = [],
  selectedMedicineId = "",
  onSelectMedicine,
  categories = [],
  selectedCategory = "",
  onSelectCategory,
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const comboboxRef = useRef(null);

  // Close combobox when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset query and close dropdown when switching tabs
  const handleTabChange = (newMode) => {
    if (newMode !== mode) {
      setQuery("");
      setIsOpen(false);
      onModeChange?.(newMode);
    }
  };

  // Medicine items filtered by query
  const filteredMedicines = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return medicines;
    return medicines.filter((m) => {
      const full = `${m.genericName || ""} ${m.brandName || ""} ${m.dosage || ""} ${m.category || ""}`.toLowerCase();
      return full.includes(q);
    });
  }, [medicines, query]);

  // Category items filtered by query
  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => {
      const catName = typeof c === "string" ? c : c.category;
      return String(catName).toLowerCase().includes(q);
    });
  }, [categories, query]);

  const currentMedicine = medicines.find((m) => m.medicineId === selectedMedicineId);

  return (
    <section className="flex flex-col rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs">
      <div className="border-b border-[#CFDDE0] p-3 space-y-2.5">
        {/* Title row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-[#1F4E5A]" />
            <h2 className="text-[11px] font-black uppercase tracking-wider text-[#1B2B30]">
              {mode === "category" ? "Category Selection" : "Medicine Selection"}
            </h2>
          </div>
          <span className="inline-flex items-center rounded-md bg-[#E5EFF1] px-1.5 py-0.5 text-[10px] font-black text-[#1F4E5A]">
            {mode === "category" ? `${categories.length} categories` : `${medicines.length} items`}
          </span>
        </div>

        {/* 2-Tab Mode Switch: [ Medicine ] [ Category ] */}
        <div className="grid grid-cols-2 rounded-lg bg-[#E5EFF1] p-0.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => handleTabChange("medicine")}
            className={`rounded-md px-2 py-1.5 transition cursor-pointer ${
              mode === "medicine"
                ? "bg-[#F9FBFB] text-[#1F4E5A] shadow-xs"
                : "text-[#5B7077] hover:text-[#1B2B30]"
            }`}
          >
            Medicine
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("category")}
            className={`rounded-md px-2 py-1.5 transition cursor-pointer ${
              mode === "category"
                ? "bg-[#F9FBFB] text-[#1F4E5A] shadow-xs"
                : "text-[#5B7077] hover:text-[#1B2B30]"
            }`}
          >
            Category
          </button>
        </div>

        {/* Dynamic Search & Dropdown Combobox (ONE single field for searching + dropdown) */}
        <div ref={comboboxRef} className="relative">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5B7077]" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder={
                mode === "category"
                  ? (selectedCategory ? `Category: ${selectedCategory}` : "Search or select category...")
                  : (currentMedicine
                    ? `${currentMedicine.genericName} ${currentMedicine.dosage || ""}`.trim()
                    : "Search or select medicine...")
              }
              className="h-8.5 w-full rounded-lg border border-[#CFDDE0] bg-[#F4F8F8] pl-8 pr-14 text-xs font-semibold text-[#1B2B30] outline-none transition placeholder:text-[#5B7077] focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="text-slate-500 hover:text-[#1B2B30] cursor-pointer"
                title="Toggle options dropdown"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
            </div>
          </div>

          {/* Floating Dropdown Menu */}
          {isOpen && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[#CFDDE0] bg-white shadow-lg custom-scrollbar">
              {mode === "medicine" ? (
                filteredMedicines.length === 0 ? (
                  <p className="p-3 text-center text-xs text-slate-500">No matching medicines</p>
                ) : (
                  filteredMedicines.map((med) => {
                    const isSelected = med.medicineId === selectedMedicineId;
                    const label = `${med.genericName} ${med.dosage || ""}`.trim();
                    return (
                      <button
                        key={med.medicineId}
                        type="button"
                        onClick={() => {
                          onSelectMedicine(med.medicineId);
                          setQuery("");
                          setIsOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition cursor-pointer ${
                          isSelected
                            ? "bg-[#EBF3F5] text-[#1F4E5A] font-bold"
                            : "text-[#1B2B30] hover:bg-[#F4F8F8]"
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="truncate">{label}</p>
                          <p className="truncate text-[10px] font-normal text-[#5B7077]">
                            {med.category || "General"}
                          </p>
                        </div>
                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#1F4E5A]" />}
                      </button>
                    );
                  })
                )
              ) : (
                filteredCategories.length === 0 ? (
                  <p className="p-3 text-center text-xs text-slate-500">No matching categories</p>
                ) : (
                  filteredCategories.map((c) => {
                    const catName = typeof c === "string" ? c : c.category;
                    const catCount = typeof c === "string" ? null : c.count;
                    const isSelected = catName === selectedCategory;
                    return (
                      <button
                        key={catName}
                        type="button"
                        onClick={() => {
                          onSelectCategory(catName);
                          setQuery("");
                          setIsOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition cursor-pointer ${
                          isSelected
                            ? "bg-[#EBF3F5] text-[#1F4E5A] font-bold"
                            : "text-[#1B2B30] hover:bg-[#F4F8F8]"
                        }`}
                      >
                        <span className="truncate">{catName}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {catCount != null && (
                            <span className="text-[10px] text-slate-400 font-normal">
                              {catCount} items
                            </span>
                          )}
                          {isSelected && <Check className="h-3.5 w-3.5 text-[#1F4E5A]" />}
                        </div>
                      </button>
                    );
                  })
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Interactive List below combobox */}
      <div className="max-h-[460px] overflow-y-auto divide-y divide-[#CFDDE0] pr-1 custom-scrollbar">
        {mode === "medicine" ? (
          filteredMedicines.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-xs font-semibold text-[#5B7077]">No medicines match filters</p>
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="mt-2 text-xs font-bold text-[#1F4E5A] hover:underline cursor-pointer"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            filteredMedicines.map((med) => {
              const isSelected = med.medicineId === selectedMedicineId;
              const fullName = `${med.genericName} ${med.dosage || ""}`.trim();
              const slope = Number(med.slope || 0);

              return (
                <button
                  key={med.medicineId}
                  type="button"
                  onClick={() => onSelectMedicine(med.medicineId)}
                  className={`group flex w-full items-center justify-between px-3.5 py-2.5 text-left transition cursor-pointer ${
                    isSelected
                      ? "border-l-4 border-[#1F4E5A] bg-[#EBF3F5]"
                      : "border-l-4 border-transparent hover:bg-[#F4F8F8]"
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p
                      className={`truncate text-xs font-bold ${
                        isSelected ? "text-[#1F4E5A]" : "text-[#1B2B30] group-hover:text-[#1F4E5A]"
                      }`}
                    >
                      {fullName}
                    </p>
                    <p className="truncate text-[11px] font-medium text-[#5B7077]">
                      {med.category || "General"}
                    </p>
                  </div>

                  <div className="shrink-0 pl-1">
                    {slope > 0.05 ? (
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-500 transition-transform group-hover:scale-110" />
                    ) : slope < -0.05 ? (
                      <TrendingDown className="h-3.5 w-3.5 text-rose-500 transition-transform group-hover:scale-110" />
                    ) : (
                      <Minus className="h-3.5 w-3.5 text-slate-300" />
                    )}
                  </div>
                </button>
              );
            })
          )
        ) : (
          filteredCategories.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-xs font-semibold text-[#5B7077]">No categories match filters</p>
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="mt-2 text-xs font-bold text-[#1F4E5A] hover:underline cursor-pointer"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            filteredCategories.map((c) => {
              const catName = typeof c === "string" ? c : c.category;
              const catCount = typeof c === "string" ? null : c.count;
              const isSelected = catName === selectedCategory;

              return (
                <button
                  key={catName}
                  type="button"
                  onClick={() => onSelectCategory(catName)}
                  className={`group flex w-full items-center justify-between px-3.5 py-2.5 text-left transition cursor-pointer ${
                    isSelected
                      ? "border-l-4 border-[#1F4E5A] bg-[#EBF3F5]"
                      : "border-l-4 border-transparent hover:bg-[#F4F8F8]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                    <Folder className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-[#1F4E5A]" : "text-[#5B7077]"}`} />
                    <p
                      className={`truncate text-xs font-bold ${
                        isSelected ? "text-[#1F4E5A]" : "text-[#1B2B30] group-hover:text-[#1F4E5A]"
                      }`}
                    >
                      {catName}
                    </p>
                  </div>

                  {catCount != null && (
                    <span className="shrink-0 rounded-md bg-[#E5EFF1] px-1.5 py-0.5 text-[10px] font-black text-[#1F4E5A]">
                      {catCount}
                    </span>
                  )}
                </button>
              );
            })
          )
        )}
      </div>
    </section>
  );
}
