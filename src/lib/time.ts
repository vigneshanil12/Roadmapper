// Half-month column model.
// Window: fixed history floor of Jun 2026 (oldest month ever shown) up to
// 11 months ahead of the current month. As months pass, history from Jun 2026
// is kept and one extra forward month is revealed each month.
// Each month split into two halves => columns.

export interface Col {
  key: string; // year-month-half
  year: number;
  month: number; // 1-12
  half: number; // 0 | 1
  label: string; // "Cycle 1" or "Cycle 2"
}

export interface MonthGroup {
  year: number;
  month: number;
  label: string; // "Jun 2026"
  cols: Col[]; // length 2
}

// Oldest month ever shown (history floor). 0-based month: 5 = June.
const HISTORY_START_YEAR = 2026;
const HISTORY_START_MONTH = 5;
// Months shown ahead of the current month.
const FUTURE_MONTHS = 11;

// Whole-month difference: b - a, both as (year, 0-based month).
function monthDiff(aYear: number, aMonth: number, bYear: number, bMonth: number): number {
  return (bYear - aYear) * 12 + (bMonth - aMonth);
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function buildMonths(now = new Date()): MonthGroup[] {
  const groups: MonthGroup[] = [];
  // Start at the history floor; never show months before it.
  const startYear = HISTORY_START_YEAR;
  const startMonth = HISTORY_START_MONTH; // 0-based
  // End at current month + FUTURE_MONTHS ahead. Total = floor..(current+11).
  const forwardEdge = monthDiff(
    startYear, startMonth, now.getFullYear(), now.getMonth()
  ) + FUTURE_MONTHS;
  for (let i = 0; i <= forwardEdge; i++) {
    const d = new Date(startYear, startMonth + i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    groups.push({
      year,
      month,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      cols: [0, 1].map((half) => ({
        key: `${year}-${month}-${half}`,
        year,
        month,
        half,
        label: half === 0 ? "Cycle 1" : "Cycle 2",
      })),
    });
  }
  return groups;
}

// Index (in the flat month list) of the current month — where the board
// should be scrolled to on load. Equals months elapsed since the history floor.
export function currentMonthIndex(now = new Date()): number {
  return monthDiff(
    HISTORY_START_YEAR, HISTORY_START_MONTH, now.getFullYear(), now.getMonth()
  );
}
