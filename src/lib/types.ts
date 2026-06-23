export type CategoryId = "growth" | "partner" | "features" | "bugs";
export type CardStatus = "normal" | "done" | "tentative";

export interface Card {
  id: string;
  title: string;
  body: string;
  category: CategoryId;
  col_year: number;
  col_month: number; // 1-12
  col_half: number; // 0 | 1
  span: number; // column width: 1 = half month, 2 = full month
  value: number; // value added, 0-3 (0 = none)
  position: number;
  status: CardStatus;
  tray: boolean; // true = parked in the staging tray; col_* ignored
}

export type NewCard = Omit<Card, "id">;

// Container id for the staging tray (parking lot above the grid).
export const TRAY_ID = "tray";

// Stable key for a single grid cell (category row × half-month column).
export function cellKey(
  category: CategoryId,
  year: number,
  month: number,
  half: number
): string {
  return `${category}|${year}|${month}|${half}`;
}

export function cardCellKey(c: Card): string {
  return c.tray ? TRAY_ID : cellKey(c.category, c.col_year, c.col_month, c.col_half);
}
