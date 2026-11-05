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

export default function MonthYearSelector({
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  onChangePeriod,
}) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const isCurrentMonth = year === currentYear && month === currentMonth;
  const isAtLatestMonth = year > currentYear || (year === currentYear && month >= currentMonth);

  // Available years: past years up to current year (future years cannot be audited)
  const availableYears = useMemo(() => {
    const list = [];
    for (let y = 2022; y <= currentYear; y++) {
      list.push(y);
    }
    return list;
  }, [currentYear]);

  // Available months: if viewing current year, future months are disabled
  const monthOptions = useMemo(() => {
    return MONTH_NAMES.map((mName, idx) => {
      const mNum = idx + 1;
      const isFuture = year > currentYear || (year === currentYear && mNum > currentMonth);
      return {
        name: mName,
        value: mNum,
        isFuture,
      };
    });
  }, [year, currentYear, currentMonth]);

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
    if (isAtLatestMonth) return;
    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    if (nextYear > currentYear || (nextYear === currentYear && nextMonth > currentMonth)) {
      return;
    }
    onChangePeriod?.({ year: nextYear, month: nextMonth });
  };

  const handleCurrentMonth = () => {
    onChangePeriod?.({ year: currentYear, month: currentMonth });
  };

  return (
    <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-3.5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      {/* Left: Month and Year Selectors */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1B2B30] mr-1">
          <Calendar className="h-4 w-4 text-[#1F4E5A]" />
          <span>Reporting Month:</span>
        </div>

        {/* Month Dropdown */}
        <select
          value={month}
          onChange={(e) => {
            const m = Number(e.target.value);
            if (year === currentYear && m > currentMonth) return;
            onChangePeriod?.({ year, month: m });
          }}
          className="bg-[#F9FBFB] border border-[#CFDDE0] hover:border-[#34769B] focus:outline-none focus:ring-1 focus:ring-[#34769B] text-xs font-semibold text-[#1B2B30] rounded-lg px-3 py-1.5 cursor-pointer transition-colors"
        >
          {monthOptions.map((m) => (
            <option key={m.name} value={m.value} disabled={m.isFuture}>
              {m.name}{m.isFuture ? " (Future - Unopened)" : ""}
            </option>
          ))}
        </select>

        {/* Year Dropdown */}
        <select
          value={year}
          onChange={(e) => {
            const newYear = Number(e.target.value);
            let newMonth = month;
            if (newYear === currentYear && newMonth > currentMonth) {
              newMonth = currentMonth;
            }
            onChangePeriod?.({ year: newYear, month: newMonth });
          }}
          className="bg-[#F9FBFB] border border-[#CFDDE0] hover:border-[#34769B] focus:outline-none focus:ring-1 focus:ring-[#34769B] text-xs font-semibold text-[#1B2B30] rounded-lg px-3 py-1.5 cursor-pointer transition-colors"
        >
          {availableYears.map((y) => (
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
            className="p-1.5 bg-[#F9FBFB] hover:bg-[#E5EFF1]/60 text-[#5B7077] hover:text-[#1B2B30] border border-[#CFDDE0] rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={isAtLatestMonth ? "Future months cannot be audited yet" : "Next Month"}
            disabled={isAtLatestMonth}
            onClick={handleNextMonth}
            className="p-1.5 bg-[#F9FBFB] hover:bg-[#E5EFF1]/60 text-[#5B7077] hover:text-[#1B2B30] border border-[#CFDDE0] rounded-lg transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-[#F9FBFB] disabled:hover:text-[#5B7077]"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          {!isCurrentMonth && (
            <button
              type="button"
              onClick={handleCurrentMonth}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-[#E5EFF1] hover:bg-[#E2F3EC] text-[#1F4E5A] border border-[#CFDDE0] text-[11px] font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Current</span>
            </button>
          )}
        </div>
      </div>

      {/* Right: Informational Period Banner */}
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-[#5B7077]">
        <span className="flex items-center gap-1 bg-[#EBF3F5] border border-[#1F4E5A]/20 text-[#1F4E5A] font-medium px-2.5 py-1 rounded-md">
          <Clock className="h-3 w-3 text-[#1F4E5A]" />
          <span>Period: <strong className="text-[#1F4E5A] font-semibold">{periodInfo.periodLabel}</strong> ({periodInfo.daysInMonth} Days)</span>
        </span>
      </div>
    </div>
  );
}
