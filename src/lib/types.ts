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
  position: number;
  status: CardStatus;
}

export type NewCard = Omit<Card, "id">;

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
  return cellKey(c.category, c.col_year, c.col_month, c.col_half);
}
