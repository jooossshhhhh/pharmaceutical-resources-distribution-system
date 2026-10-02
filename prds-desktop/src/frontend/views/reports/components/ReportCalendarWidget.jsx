import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

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
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() =>
    selectedDate ? selectedDate.getFullYear() : new Date().getFullYear()
  );

  // Synchronize viewDate and pickerYear when selectedDate changes externally
  useEffect(() => {
    if (selectedDate) {
      setViewDate(new Date(selectedDate));
      setPickerYear(selectedDate.getFullYear());
    }
  }, [selectedDate]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexed

  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(viewDate);

  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  // Days in month calculation
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Starting day of the week (0 = Sun, 1 = Mon... convert to Mon = 0)
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  // Mon = 0, Tue = 1, Wed = 2, Thu = 3, Fri = 4, Sat = 5, Sun = 6
  const startOffset = (firstDayOfWeek + 6) % 7;

  // Selected date comparison
  const selectedYear = selectedDate ? selectedDate.getFullYear() : null;
  const selectedMonth = selectedDate ? selectedDate.getMonth() : null;
  const selectedDay = selectedDate ? selectedDate.getDate() : null;

  // Today comparison
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

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

  const handleMonthSelect = (selectedMonthIdx) => {
    const newViewDate = new Date(pickerYear, selectedMonthIdx, 1);
    setViewDate(newViewDate);
    const maxDays = new Date(pickerYear, selectedMonthIdx + 1, 0).getDate();
    const currentDay = selectedDate ? selectedDate.getDate() : 1;
    const newDay = Math.min(currentDay, maxDays);
    onSelectDate(new Date(pickerYear, selectedMonthIdx, newDay));
    setIsPickerOpen(false);
  };

  const handleSelectToday = () => {
    const now = new Date();
    setViewDate(now);
    setPickerYear(now.getFullYear());
    onSelectDate(now);
    setIsPickerOpen(false);
  };

  // Year options for fast dropdown jump
  const currentBaseYear = new Date().getFullYear();
  const minYear = 2020;
  const maxYear = Math.max(currentBaseYear + 8, 2035);
  const yearOptions = [];
  for (let y = minYear; y <= maxYear; y++) {
    yearOptions.push(y);
  }

  return (
    <div className="bg-white border border-[#d8dadc] rounded-xl p-4 shadow-xs w-full lg:w-[280px] shrink-0 transition-all">
      {!isPickerOpen ? (
        <>
          {/* Month & Year Header with Clickable Month/Year & Prev/Next buttons */}
          <div className="flex items-center justify-between pb-3 border-b border-[#d8dadc]/60">
            <button
              type="button"
              onClick={() => {
                setPickerYear(year);
                setIsPickerOpen(true);
              }}
              className="flex items-center gap-1.5 font-bold text-sm text-[#0d1117] hover:text-[#00a36c] px-2 py-1 -ml-2 rounded-lg hover:bg-[#f8f9ff] transition-all cursor-pointer group"
              title="Click to choose month and year"
            >
              <span>
                {monthName} {year}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[#42474e] group-hover:text-[#00a36c] transition-colors" />
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1 rounded-md text-[#42474e] hover:bg-[#f8f9ff] hover:text-[#0d1117] transition-colors cursor-pointer"
                aria-label="Previous month"
                title="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1 rounded-md text-[#42474e] hover:bg-[#f8f9ff] hover:text-[#0d1117] transition-colors cursor-pointer"
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
                      ? "bg-[#00a36c] text-white font-bold shadow-xs scale-105"
                      : isToday
                      ? "border border-[#00a36c] text-[#00a36c] font-semibold hover:bg-emerald-50"
                      : "text-[#0d1117] hover:bg-emerald-50 hover:text-emerald-700"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* Month & Year Selection Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#d8dadc]/60">
            <button
              type="button"
              onClick={() => setIsPickerOpen(false)}
              className="flex items-center gap-1 font-bold text-xs text-[#00a36c] hover:text-[#008f5d] px-2 py-1 -ml-2 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer"
              title="Back to calendar days"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Calendar</span>
            </button>

            {/* Year Stepper & Dropdown */}
            <div className="flex items-center gap-1 bg-[#f8f9ff] px-2 py-0.5 rounded-lg border border-[#d8dadc]">
              <button
                type="button"
                onClick={() => setPickerYear((y) => Math.max(minYear, y - 1))}
                className="p-1 rounded text-[#42474e] hover:text-[#0d1117] hover:bg-white transition-colors cursor-pointer"
                aria-label="Previous year"
                title="Previous year"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <select
                value={pickerYear}
                onChange={(e) => setPickerYear(Number(e.target.value))}
                className="bg-transparent font-bold text-xs text-[#0d1117] cursor-pointer focus:outline-none px-1"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setPickerYear((y) => Math.min(maxYear, y + 1))}
                className="p-1 rounded text-[#42474e] hover:text-[#0d1117] hover:bg-white transition-colors cursor-pointer"
                aria-label="Next year"
                title="Next year"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* 3x4 Grid of Months */}
          <div className="pt-3 pb-2">
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS.map((m, idx) => {
                const isSelected = selectedYear === pickerYear && selectedMonth === idx;
                const isCurrentCalendarMonth = year === pickerYear && month === idx;
                const isTodayMonth = todayYear === pickerYear && todayMonth === idx;

                return (
                  <button
                    key={m.short}
                    type="button"
                    onClick={() => handleMonthSelect(idx)}
                    className={`py-2 px-1 text-xs rounded-lg transition-all cursor-pointer text-center ${
                      isSelected
                        ? "bg-[#00a36c] text-white shadow-xs font-bold scale-[1.02]"
                        : isCurrentCalendarMonth
                        ? "bg-emerald-50 text-[#00a36c] border border-[#00a36c]/40 font-semibold"
                        : isTodayMonth
                        ? "border border-dashed border-[#00a36c]/50 text-[#00a36c] hover:bg-emerald-50 font-medium"
                        : "text-[#0d1117] hover:bg-[#f8f9ff] hover:text-[#00a36c] font-medium"
                    }`}
                  >
                    <div className="text-xs font-semibold leading-tight">{m.short}</div>
                    <div
                      className={`text-[9px] mt-0.5 leading-tight ${
                        isSelected ? "text-emerald-100" : "text-[#42474e]"
                      }`}
                    >
                      {m.name}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-[#d8dadc]/60 text-[11px]">
              <button
                type="button"
                onClick={handleSelectToday}
                className="font-semibold text-[#00a36c] hover:underline cursor-pointer"
              >
                Go to Today
              </button>
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="text-[#42474e] hover:text-[#0d1117] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
