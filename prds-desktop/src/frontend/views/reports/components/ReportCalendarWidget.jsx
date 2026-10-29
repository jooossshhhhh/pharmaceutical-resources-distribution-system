import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, RotateCcw, Check } from "lucide-react";

const MONTHS = [
  { short: "Jan", name: "January" },
  { short: "Feb", name: "February" },
  { short: "Mar", name: "March" },
  { short: "Apr", name: "April" },
  { short: "May", name: "May" },
  { short: "Jun", name: "June" },
  { short: "Jul", name: "July" },
  { short: "Aug", name: "August" },
  { short: "Sep", name: "September" },
  { short: "Oct", name: "October" },
  { short: "Nov", name: "November" },
  { short: "Dec", name: "December" },
];

export default function ReportCalendarWidget({ selectedDate, onSelectDate }) {
  const [viewDate, setViewDate] = useState(() => new Date(selectedDate || new Date()));
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);

  const yearRef = useRef(null);
  const monthRef = useRef(null);
  const selectedYearItemRef = useRef(null);

  // Synchronize viewDate when selectedDate changes externally
  useEffect(() => {
    if (selectedDate) {
      setViewDate(new Date(selectedDate));
    }
  }, [selectedDate]);

  // Click outside listener for custom dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (yearRef.current && !yearRef.current.contains(event.target)) {
        setYearDropdownOpen(false);
      }
      if (monthRef.current && !monthRef.current.contains(event.target)) {
        setMonthDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-scroll inside year dropdown to active selected year when opened
  useEffect(() => {
    if (yearDropdownOpen && selectedYearItemRef.current) {
      selectedYearItemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [yearDropdownOpen]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexed
  const monthName = MONTHS[month]?.name || "";

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  const minYear = 2000;

  // Year options: from current year down to year 2000
  const yearOptions = useMemo(() => {
    const list = [];
    for (let y = todayYear; y >= minYear; y--) {
      list.push(y);
    }
    return list;
  }, [todayYear]);

  const prevMonth = () => {
    const nextDate = new Date(year, month - 1, 1);
    setViewDate(nextDate);
    const maxDays = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    const currentDay = selectedDate ? selectedDate.getDate() : 1;
    const newDay = Math.min(currentDay, maxDays);
    onSelectDate(new Date(nextDate.getFullYear(), nextDate.getMonth(), newDay));
  };

  const nextMonth = () => {
    const nextDate = new Date(year, month + 1, 1);
    setViewDate(nextDate);
    const maxDays = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    const currentDay = selectedDate ? selectedDate.getDate() : 1;
    const newDay = Math.min(currentDay, maxDays);
    onSelectDate(new Date(nextDate.getFullYear(), nextDate.getMonth(), newDay));
  };

  const handleYearSelect = (newYear) => {
    const nextDate = new Date(newYear, month, 1);
    setViewDate(nextDate);
    const maxDays = new Date(newYear, month + 1, 0).getDate();
    const baseDay = selectedDate ? selectedDate.getDate() : today.getDate();
    const newDay = Math.min(baseDay, maxDays);
    onSelectDate(new Date(newYear, month, newDay));
    setYearDropdownOpen(false);
  };

  const handleMonthSelect = (newMonth) => {
    const nextDate = new Date(year, newMonth, 1);
    setViewDate(nextDate);
    const maxDays = new Date(year, newMonth + 1, 0).getDate();
    const baseDay = selectedDate ? selectedDate.getDate() : today.getDate();
    const newDay = Math.min(baseDay, maxDays);
    onSelectDate(new Date(year, newMonth, newDay));
    setMonthDropdownOpen(false);
  };

  const handleGoToToday = () => {
    const now = new Date();
    setViewDate(now);
    onSelectDate(now);
    setYearDropdownOpen(false);
    setMonthDropdownOpen(false);
  };

  // Days in month calculation
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Starting day of the week (0 = Sun, 1 = Mon... convert to Mon = 0)
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const startOffset = (firstDayOfWeek + 6) % 7;

  // Selected date comparison
  const selectedYear = selectedDate ? selectedDate.getFullYear() : null;
  const selectedMonth = selectedDate ? selectedDate.getMonth() : null;
  const selectedDay = selectedDate ? selectedDate.getDate() : null;

  // True only when currently focused on today's exact date and month/year
  const isTodaySelected =
    selectedYear === todayYear &&
    selectedMonth === todayMonth &&
    selectedDay === todayDay &&
    year === todayYear &&
    month === todayMonth;

  const days = [];
  for (let i = 0; i < startOffset; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(d);
  }

  const handleDayClick = (day) => {
    if (!day) return;
    const next = new Date(year, month, day);
    onSelectDate(next);
  };

  return (
    <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-4 shadow-xs w-full lg:w-[280px] shrink-0 transition-all">
      {/* Month & Year Header with inline scrollable dropdowns & Controls */}
      <div className="flex items-center justify-between pb-3 border-b border-[#CFDDE0]">
        <div className="flex items-center gap-1">
          {/* Month Selector Dropdown */}
          <div className="relative" ref={monthRef}>
            <button
              type="button"
              onClick={() => {
                setMonthDropdownOpen((prev) => !prev);
                setYearDropdownOpen(false);
              }}
              className="flex items-center gap-1 font-bold text-sm text-[#1B2B30] hover:text-[#1F4E5A] px-2 py-1 rounded-lg hover:bg-[#E5EFF1]/70 transition-colors cursor-pointer border border-transparent hover:border-[#CFDDE0]"
              aria-label="Select month"
              title="Choose month"
            >
              <span>{monthName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-[#5B7077]" />
            </button>

            {monthDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-32 max-h-52 overflow-y-auto bg-white border border-[#CFDDE0] rounded-xl shadow-lg z-50 py-1 text-xs">
                {MONTHS.map((m, idx) => {
                  const isSelected = idx === month;
                  return (
                    <button
                      key={m.short}
                      type="button"
                      onClick={() => handleMonthSelect(idx)}
                      className={`w-full text-left px-3 py-1.5 font-medium transition-colors cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? "bg-[#1F4E5A] text-white font-bold"
                          : "text-[#1B2B30] hover:bg-[#E2F3EC] hover:text-[#1F4E5A]"
                      }`}
                    >
                      <span>{m.name}</span>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Year Selector Dropdown (Scrollable, 2000 to Current Year) */}
          <div className="relative" ref={yearRef}>
            <button
              type="button"
              onClick={() => {
                setYearDropdownOpen((prev) => !prev);
                setMonthDropdownOpen(false);
              }}
              className="flex items-center gap-1 font-bold text-sm text-[#1B2B30] hover:text-[#1F4E5A] px-2 py-1 rounded-lg hover:bg-[#E5EFF1]/70 transition-colors cursor-pointer border border-transparent hover:border-[#CFDDE0]"
              aria-label="Select year"
              title="Choose year"
            >
              <span>{year}</span>
              <ChevronDown className="h-3.5 w-3.5 text-[#5B7077]" />
            </button>

            {yearDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-24 max-h-48 overflow-y-auto bg-white border border-[#CFDDE0] rounded-xl shadow-lg z-50 py-1 text-xs">
                {yearOptions.map((y) => {
                  const isSelected = y === year;
                  return (
                    <button
                      key={y}
                      ref={isSelected ? selectedYearItemRef : null}
                      type="button"
                      onClick={() => handleYearSelect(y)}
                      className={`w-full text-left px-3 py-1.5 font-medium transition-colors cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? "bg-[#1F4E5A] text-white font-bold"
                          : "text-[#1B2B30] hover:bg-[#E2F3EC] hover:text-[#1F4E5A]"
                      }`}
                    >
                      <span>{y}</span>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Action Controls: Reset to Current Date Icon (only when not on current date) & Prev / Next */}
        <div className="flex items-center gap-1">
          {!isTodaySelected && (
            <button
              type="button"
              onClick={handleGoToToday}
              className="p-1.5 rounded-md text-[#1F4E5A] hover:bg-[#E2F3EC] hover:text-[#4C9F80] transition-colors cursor-pointer mr-0.5"
              aria-label="Reset to current date"
              title="Reset to current date"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={prevMonth}
            className="p-1 rounded-md text-[#5B7077] hover:bg-[#E5EFF1]/60 hover:text-[#1B2B30] transition-colors cursor-pointer"
            aria-label="Previous month"
            title="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1 rounded-md text-[#5B7077] hover:bg-[#E5EFF1]/60 hover:text-[#1B2B30] transition-colors cursor-pointer"
            aria-label="Next month"
            title="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Weekday headers: Mo Tu We Th Fr Sa Su */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[#42474e] pt-3 pb-1.5">
        <div>Mo</div>
        <div>Tu</div>
        <div>We</div>
        <div>Th</div>
        <div>Fr</div>
        <div>Sa</div>
        <div>Su</div>
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {days.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="h-7 w-7" />;
          }

          const isSelected =
            selectedYear === year &&
            selectedMonth === month &&
            selectedDay === day;

          const isToday =
            todayYear === year &&
            todayMonth === month &&
            todayDay === day;

          return (
            <button
              key={`day-${day}`}
              type="button"
              onClick={() => handleDayClick(day)}
              className={`h-7 w-7 mx-auto rounded-full flex items-center justify-center font-medium transition-all cursor-pointer relative ${
                isSelected
                  ? "bg-[#1F4E5A] text-white font-bold shadow-xs scale-105"
                  : isToday
                  ? "border border-[#4C9F80] text-[#4C9F80] font-semibold hover:bg-[#E2F3EC]/50"
                  : "text-[#1B2B30] hover:bg-[#E2F3EC]/40 hover:text-[#1F4E5A]"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
