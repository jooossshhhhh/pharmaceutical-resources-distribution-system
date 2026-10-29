import { History, Pill } from "lucide-react";

export default function DispensingTabToggle({
  activeTab = "DISPENSE",
  onSelectTab,
  historyCount = 0,
}) {
  return (
    <div className="inline-flex h-10 items-center rounded-xl bg-[#E5EFF1] p-1 border border-[#CFDDE0] shadow-2xs">
      <button
        type="button"
        onClick={() => onSelectTab("DISPENSE")}
        className={`inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-bold transition-all cursor-pointer ${
          activeTab === "DISPENSE"
            ? "bg-[#34769B] text-white shadow-xs"
            : "text-[#5B7077] hover:text-[#1B2B30] hover:bg-[#F9FBFB]/60"
        }`}
      >
        <Pill className="h-3.5 w-3.5" />
        <span>New Dispensing</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectTab("HISTORY")}
        className={`inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-bold transition-all cursor-pointer ${
          activeTab === "HISTORY"
            ? "bg-[#1F4E5A] text-white shadow-xs"
            : "text-[#5B7077] hover:text-[#1B2B30] hover:bg-[#F9FBFB]/60"
        }`}
      >
        <History className="h-3.5 w-3.5" />
        <span>Dispensing History</span>
        {historyCount > 0 && (
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
              activeTab === "HISTORY"
                ? "bg-white/20 text-white"
                : "bg-[#CFDDE0] text-[#1B2B30]"
            }`}
          >
            {historyCount}
          </span>
        )}
      </button>
    </div>
  );
}
