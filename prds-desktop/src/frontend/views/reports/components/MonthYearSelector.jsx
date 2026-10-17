import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar, Clock, RotateCcw } from "lucide-react";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const AVAILABLE_YEARS = [2022, 2023, 2024, 2025, 2026, 2027, 2028];

export default function MonthYearSelector({
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  onChangePeriod,
}) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const isCurrentMonth = year === currentYear && month === currentMonth;

  // Compute period coverage and previous month anchor dates
  const periodInfo = useMemo(() => {
    const targetDate = new Date(year, month - 1, 1);
    const monthName = MONTH_NAMES[month - 1] || "Current Month";
    const lastDay = new Date(year, month, 0).getDate();

    const prevDate = new Date(year, month - 1, 0);
    const prevMonthName = MONTH_NAMES[prevDate.getMonth()];
    const prevLastDay = prevDate.getDate();
    const prevYear = prevDate.getFullYear();

    return {
      monthName,
      lastDay,
      periodLabel: `${monthName} 1, ${year} – ${monthName} ${lastDay}, ${year}`,
      daysInMonth: lastDay,
      begAnchorLabel: `${prevMonthName} ${prevLastDay}, ${prevYear}`,
    };
  }, [year, month]);

  const handlePrevMonth = () => {
    let nextMonth = month - 1;
    let nextYear = year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }
    onChangePeriod?.({ year: nextYear, month: nextMonth });
  };

  const handleNextMonth = () => {
    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    onChangePeriod?.({ year: nextYear, month: nextMonth });
  };

  const handleCurrentMonth = () => {
    onChangePeriod?.({ year: currentYear, month: currentMonth });
  };

  return (
    <div className="bg-white border border-[#d8dadc] rounded-xl p-3.5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      {/* Left: Month and Year Selectors */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0d1117] mr-1">
          <Calendar className="h-4 w-4 text-[#00a36c]" />
          <span>Reporting Month:</span>
        </div>

        {/* Month Dropdown */}
        <select
          value={month}
          onChange={(e) => onChangePeriod?.({ year, month: Number(e.target.value) })}
          className="bg-white border border-slate-200 hover:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-semibold text-[#0d1117] rounded-lg px-3 py-1.5 cursor-pointer transition-colors"
        >
          {MONTH_NAMES.map((mName, idx) => (
            <option key={mName} value={idx + 1}>
              {mName}
            </option>
          ))}
        </select>

        {/* Year Dropdown */}
        <select
          value={year}
          onChange={(e) => onChangePeriod?.({ year: Number(e.target.value), month })}
          className="bg-white border border-slate-200 hover:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-semibold text-[#0d1117] rounded-lg px-3 py-1.5 cursor-pointer transition-colors"
        >
          {AVAILABLE_YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {/* Navigation buttons */}
        <div className="flex items-center gap-1 ml-1">
          <button
            type="button"
            title="Previous Month"
            onClick={handlePrevMonth}
            className="p-1.5 bg-white hover:bg-[#f8f9ff] text-[#42474e] hover:text-[#0d1117] border border-[#d8dadc] rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Next Month"
            onClick={handleNextMonth}
            className="p-1.5 bg-white hover:bg-[#f8f9ff] text-[#42474e] hover:text-[#0d1117] border border-[#d8dadc] rounded-lg transition-colors cursor-pointer"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          {!isCurrentMonth && (
            <button
              type="button"
              onClick={handleCurrentMonth}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-[#f8f9ff] hover:bg-emerald-50 text-[#00a36c] border border-emerald-200 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Current</span>
            </button>
          )}
        </div>
      </div>

      {/* Right: Informational Period Banner */}
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-[#42474e]">
        <span className="flex items-center gap-1 bg-[#f8f9ff] border border-blue-100 text-blue-800 font-medium px-2.5 py-1 rounded-md">
          <Clock className="h-3 w-3 text-blue-600" />
          <span>Period: <strong className="text-blue-950 font-semibold">{periodInfo.periodLabel}</strong> ({periodInfo.daysInMonth} Days)</span>
        </span>
      </div>
    </div>
  );
}
