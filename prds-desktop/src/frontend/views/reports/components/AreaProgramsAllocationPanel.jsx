import { useMemo, useState } from "react";
import { formatPeso, formatReportDate } from "@shared/utils/reportUtils";
import { getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import {
  Calendar,
  MapPin,
  Package,
  Layers,
  CheckCircle,
  Filter,
  X,
} from "lucide-react";

/**
 * AreaProgramsAllocationPanel
 * Dedicated UI representation of Excel Columns X through AA (Transferred to Other Programs & AREA / PROGRAM).
 * Displays active public health campaigns, their medicine allocations, and financial investments.
 */
export default function AreaProgramsAllocationPanel({
  otherPrograms = [],
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  selectedProgramFilter = null,
  onSelectProgramFilter,
  medicines = [],
}) {
  const targetMonthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const [isExpanded, setIsExpanded] = useState(false);

  // Resilient medicines catalog map to lookup unit_cost and metadata
  const medicinesMap = useMemo(() => {
    const list = medicines && medicines.length > 0
      ? medicines
      : getSnapshot(STORAGE_KEYS.MEDICINES, []);
    const map = new Map();
    (list || []).forEach((m) => {
      if (m.id) map.set(String(m.id), m);
      const nameKey = `${String(m.generic_name || "").trim().toLowerCase()}|${String(m.dosage || "").trim().toLowerCase()}`;
      if (nameKey !== "|") map.set(nameKey, m);
    });
    return map;
  }, [medicines]);

  // Filter and process programs for the target month
  const monthlyPrograms = useMemo(() => {
    return (otherPrograms || [])
      .filter((prog) => {
        if (prog.status === "CANCELLED") return false;
        const pDate = prog.program_date || prog.completed_at || prog.created_at || "";
        return String(pDate).startsWith(targetMonthPrefix);
      })
      .map((prog) => {
        const meds = prog.medicines || [];
        let totalValuation = 0;
        let totalUnits = 0;

        const medicineDetails = meds.map((m) => {
          const medObj = m.medicine || {};
          const medId = String(m.medicine_id || medObj.id || "");
          const generic = (medObj.generic_name || m.generic_name || "").trim();
          const dosage = (medObj.dosage || m.dosage || "").trim();
          const nameKey = `${generic.toLowerCase()}|${dosage.toLowerCase()}`;

          const catalogMed = (medId ? medicinesMap.get(medId) : null) || (nameKey !== "|" ? medicinesMap.get(nameKey) : null) || {};

          const qty = Number(m.quantity_used ?? m.quantity ?? 0);
          const rawUnitCost = medObj.unit_cost ?? m.unit_cost ?? catalogMed.unit_cost;
          const unitCost = Number(rawUnitCost !== undefined && rawUnitCost !== null && rawUnitCost !== "" ? rawUnitCost : 0);
          const lineTotal = qty * unitCost;
          totalValuation += lineTotal;
          totalUnits += qty;

          const displayGeneric = generic || catalogMed.generic_name || "Medicine";
          const displayDosage = dosage || catalogMed.dosage || "";
          const name = displayDosage ? `${displayGeneric} ${displayDosage}` : displayGeneric;

          return {
            id: m.id,
            name,
            quantity: qty,
            unitOfMeasure: medObj.unit_of_measure || m.unit_of_measure || catalogMed.unit_of_measure || "UNIT",
            unitCost,
            lineTotal,
          };
        });

        return {
          id: prog.id,
          name: (prog.program_name || prog.title || "Public Health Program").trim(),
          date: prog.program_date || prog.created_at,
          description: prog.description || "",
          targetArea: prog.target_area || prog.location || "City of Naga",
          status: prog.status || "COMPLETED",
          medicines: medicineDetails,
          totalUnits,
          totalValuation,
        };
      });
  }, [otherPrograms, targetMonthPrefix]);

  // Overall totals across all programs in month
  const summary = useMemo(() => {
    let grandValuation = 0;
    let grandUnits = 0;
    monthlyPrograms.forEach((p) => {
      grandValuation += p.totalValuation;
      grandUnits += p.totalUnits;
    });

    return {
      grandValuation,
      grandUnits,
      programCount: monthlyPrograms.length,
    };
  }, [monthlyPrograms]);

  // Colors for program distribution bars (PRDS Clinical Teal, Sky Blue, Mint, Coral)
  const PALETTE = [
    "bg-[#1F4E5A]",
    "bg-[#34769B]",
    "bg-[#4C9F80]",
    "bg-[#D9826B]",
    "bg-[#286575]",
    "bg-[#2D7A5D]",
  ];

  if (monthlyPrograms.length === 0) {
    return (
      <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-5 shadow-xs">
        <div className="pb-3 border-b border-[#CFDDE0]">
          <h2 className="text-sm font-bold text-[#1B2B30]">
            Transferred to Other Programs
          </h2>
        </div>
        <div className="py-8 text-center text-[#5B7077]">
          <Package className="h-8 w-8 mx-auto text-[#5B7077]/40 mb-2" />
          <p className="text-xs font-medium text-[#1B2B30]">
            No Other Programs recorded for this month.
          </p>
          <p className="text-[11px] text-[#5B7077] mt-0.5">
            All pharmaceutical issuances for this period were standard walk-in dispensations and barangay health station fulfillments.
          </p>
        </div>
      </div>
    );
  }

  const displayedPrograms = isExpanded
    ? monthlyPrograms
    : monthlyPrograms.slice(0, 4);

  return (
    <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-4 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-[#CFDDE0]">
        <div>
          <div>
            <h2 className="text-sm font-bold text-[#1B2B30]">
              Transferred to Other Programs
            </h2>
          </div>
          <p className="text-[11.5px] text-[#5B7077] mt-0.5">
            Medicines transferred from CHO inventory to specialized programs under the Other Programs module.
          </p>
        </div>

        {selectedProgramFilter && (
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <span className="text-[11px] text-[#5B7077]">Filter active:</span>
            <span className="inline-flex items-center gap-1 bg-[#EBF3F5] text-[#1F4E5A] text-xs font-semibold px-2.5 py-1 rounded-lg border border-[#1F4E5A]/30">
              <Filter className="h-3 w-3" />
              <span>{selectedProgramFilter}</span>
              <button
                type="button"
                onClick={() => onSelectProgramFilter?.(null)}
                className="hover:text-[#163840] cursor-pointer ml-1"
                title="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Main Grid: Left side Cards, Right side Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Active Programs Cards Grid (7 Cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="text-[11.5px] font-bold text-[#5B7077] uppercase tracking-wide flex items-center justify-between">
            <span>Other Programs ({monthlyPrograms.length})</span>
            <span className="text-[11px] text-[#5B7077] font-normal">Click a card to filter ledger table</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayedPrograms.map((prog, idx) => {
              const isSelected = selectedProgramFilter === prog.name;
              return (
                <div
                  key={prog.id || idx}
                  onClick={() => {
                    if (isSelected) {
                      onSelectProgramFilter?.(null);
                    } else {
                      onSelectProgramFilter?.(prog.name);
                    }
                  }}
                  className={`border rounded-xl p-3.5 transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "bg-[#EBF3F5] border-[#1F4E5A] shadow-xs ring-1 ring-[#1F4E5A]/30"
                      : "bg-[#F4F8F8] hover:bg-[#F9FBFB] border-[#CFDDE0] hover:border-[#1F4E5A]/30"
                  }`}
                >
                  <div>
                    {/* Program Title & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-bold text-[#1B2B30] line-clamp-1" title={prog.name}>
                        {prog.name}
                      </h4>
                      <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E8F5F1] text-[#2D7A5D] border border-[#4C9F80]/30">
                        {prog.status}
                      </span>
                    </div>

                    {/* Metadata: Date and Area */}
                    <div className="mt-2 space-y-1 text-[11px] text-[#5B7077]">
                      {prog.date && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3 text-[#5B7077]/60 shrink-0" />
                          <span>{formatReportDate(prog.date)}</span>
                        </div>
                      )}
                      {prog.targetArea && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-[#5B7077]/60 shrink-0" />
                          <span className="truncate">{prog.targetArea}</span>
                        </div>
                      )}
                    </div>

                    {/* Medicines List Snippet */}
                    <div className="mt-3 pt-2.5 border-t border-[#CFDDE0]">
                      <div className="text-[10.5px] font-semibold text-[#5B7077] uppercase mb-1">
                        Program Medicines ({prog.medicines.length}):
                      </div>
                      <div className="space-y-1 max-h-20 overflow-y-auto pr-1">
                        {prog.medicines.slice(0, 3).map((med, mIdx) => (
                          <div key={med.id || mIdx} className="flex items-center justify-between text-[11px]">
                            <span className="text-[#1B2B30] truncate max-w-[150px]" title={med.name}>
                              {med.name}
                            </span>
                            <span className="font-semibold text-[#1F4E5A] shrink-0">
                              {med.quantity} {med.unitOfMeasure}
                            </span>
                          </div>
                        ))}
                        {prog.medicines.length > 3 && (
                          <div className="text-[10px] text-[#5B7077] italic">
                            +{prog.medicines.length - 3} more medicines
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Valuation Footer */}
                  <div className="mt-3 pt-2 border-t border-[#CFDDE0] flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#5B7077]">Total Cost:</span>
                    <span className="text-xs font-bold text-[#1F4E5A]">
                      {formatPeso(prog.totalValuation)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* See more / See less text link when programs count > 4 */}
          {monthlyPrograms.length > 4 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="text-xs font-semibold text-[#1F4E5A] hover:text-[#286575] underline cursor-pointer transition-colors"
              >
                {isExpanded ? "see less" : "see more"}
              </button>
            </div>
          )}
        </div>

        {/* Right: Allocation Distribution Chart & Summary (5 Cols) */}
        <div className="lg:col-span-5 bg-[#F4F8F8] border border-[#CFDDE0] rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-[#1B2B30] mb-3">
              <span>Other Programs Cost Breakdown</span>
            </div>

            {/* Total Investment Callout */}
            <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-lg p-3 mb-3.5">
              <div className="text-[11px] font-semibold text-[#5B7077] uppercase">
                TOTAL OTHER PROGRAMS COST
              </div>
              <div className="text-xl font-bold text-[#1F4E5A] mt-1">
                {formatPeso(summary.grandValuation)}
              </div>
              <div className="text-[11px] text-[#5B7077] mt-1 flex items-center justify-between">
                <span>Total Quantity Transferred:</span>
                <strong className="text-[#1B2B30]">{summary.grandUnits.toLocaleString()} units</strong>
              </div>
            </div>

            {/* Program Distribution Progress Bars */}
            <div className="space-y-2.5">
              {monthlyPrograms.map((prog, pIdx) => {
                const percentage = summary.grandValuation > 0
                  ? Math.round((prog.totalValuation / summary.grandValuation) * 100)
                  : 0;
                const barColor = PALETTE[pIdx % PALETTE.length];
                const isSelected = selectedProgramFilter === prog.name;

                return (
                  <div
                    key={prog.id || pIdx}
                    onClick={() => {
                      if (isSelected) {
                        onSelectProgramFilter?.(null);
                      } else {
                        onSelectProgramFilter?.(prog.name);
                      }
                    }}
                    className={`cursor-pointer p-1.5 rounded-lg transition-colors ${
                      isSelected ? "bg-[#EBF3F5]" : "hover:bg-[#F9FBFB]"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-semibold text-[#1B2B30] truncate max-w-[170px]" title={prog.name}>
                        {prog.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#1F4E5A]">{formatPeso(prog.totalValuation)}</span>
                        <span className="text-[10px] text-[#5B7077] font-medium">({percentage}%)</span>
                      </div>
                    </div>

                    <div className="w-full bg-[#CFDDE0] rounded-full h-2 overflow-hidden">
                      <div
                        className={`${barColor} h-2 rounded-full transition-all duration-300`}
                        style={{ width: `${Math.max(4, percentage)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
