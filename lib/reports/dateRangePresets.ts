/** Pure date-range math for quick-filter presets — no DB I/O. All ranges are computed in the
 * caller's local time (these run client-side, in DateRangeFilter) and are "to date" for the
 * current period (e.g. "This month" runs from the 1st through today, not through month-end). */

export type DateRangePreset = { label: string; from: string; to: string };

function toIso(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

function fyLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** fyStartMonth is 1-12 (e.g. 4 = April), matching
 * Business.preferences.documentNumbering.fyStartMonth. */
export function buildDateRangePresets(fyStartMonth: number, now: Date = new Date()): DateRangePreset[] {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  const thisMonthStart = new Date(year, month, 1);
  const lastMonthStart = new Date(year, month - 1, 1);
  const lastMonthEnd = new Date(year, month, 0);

  const thisYearStart = new Date(year, 0, 1);
  const lastYearStart = new Date(year - 1, 0, 1);
  const lastYearEnd = new Date(year - 1, 11, 31);

  const thisFyStartYear = month + 1 >= fyStartMonth ? year : year - 1;
  const thisFyStart = new Date(thisFyStartYear, fyStartMonth - 1, 1);
  const lastFyStart = new Date(thisFyStartYear - 1, fyStartMonth - 1, 1);
  const lastFyEnd = new Date(thisFyStartYear, fyStartMonth - 1, 0);

  return [
    { label: "This month", from: toIso(thisMonthStart), to: toIso(now) },
    { label: "Last month", from: toIso(lastMonthStart), to: toIso(lastMonthEnd) },
    { label: `FY ${fyLabel(thisFyStartYear)}`, from: toIso(thisFyStart), to: toIso(now) },
    { label: `FY ${fyLabel(thisFyStartYear - 1)}`, from: toIso(lastFyStart), to: toIso(lastFyEnd) },
    { label: "This year", from: toIso(thisYearStart), to: toIso(now) },
    { label: "Last year", from: toIso(lastYearStart), to: toIso(lastYearEnd) },
  ];
}
