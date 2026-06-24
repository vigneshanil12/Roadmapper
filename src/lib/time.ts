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
      label: `${MONTH_NAMES[month - 1].toUpperCase()} ${String(year).slice(-2)}`,
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

// Compact relative time ("just now", "5m", "3h", "2d", "7mo", "1y") for comment
// timestamps. Coarse on purpose — threads only need rough recency.
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// Index (in the flat month list) of the current month — where the board
// should be scrolled to on load. Equals months elapsed since the history floor.
export function currentMonthIndex(now = new Date()): number {
  return monthDiff(
    HISTORY_START_YEAR, HISTORY_START_MONTH, now.getFullYear(), now.getMonth()
  );
}
