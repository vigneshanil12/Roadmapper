// Half-month column model.
// Window: 6 months in the past (scroll back to reach) + 9 months forward,
// each split into two halves => columns.

export interface Col {
  key: string; // year-month-half
  year: number;
  month: number; // 1-12
  half: number; // 0 | 1
  label: string; // "1-15" or "16+"
}

export interface MonthGroup {
  year: number;
  month: number;
  label: string; // "Jun 2026"
  cols: Col[]; // length 2
}

const PAST_MONTHS = 6;
const FUTURE_MONTHS = 9;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function buildMonths(now = new Date()): MonthGroup[] {
  const groups: MonthGroup[] = [];
  const startYear = now.getFullYear();
  const startMonth = now.getMonth(); // 0-based
  for (let i = -PAST_MONTHS; i < FUTURE_MONTHS; i++) {
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
        label: half === 0 ? "1–15" : "16+",
      })),
    });
  }
  return groups;
}

// Index (in the flat month list) of the current month — where the board
// should be scrolled to on load.
export function currentMonthIndex(): number {
  return PAST_MONTHS;
}
