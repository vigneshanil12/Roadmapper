import type { CategoryId } from "./types";

export interface Category {
  id: CategoryId;
  label: string;
  // Tailwind classes tuned to match the FigJam board palette.
  rowBg: string; // category label cell + faint row tint
  labelText: string;
  cardBg: string;
  cardBorder: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "growth",
    label: "Growth & User Delight",
    rowBg: "bg-green-100/40",
    labelText: "text-green-800",
    cardBg: "bg-green-200",
    cardBorder: "border-green-400",
  },
  {
    id: "partner",
    label: "Partner Convenience",
    rowBg: "bg-amber-100/40",
    labelText: "text-amber-800",
    cardBg: "bg-amber-200",
    cardBorder: "border-amber-400",
  },
  {
    id: "features",
    label: "New Features",
    rowBg: "bg-violet-100/40",
    labelText: "text-violet-800",
    cardBg: "bg-violet-200",
    cardBorder: "border-violet-400",
  },
  {
    id: "bugs",
    label: "Bugs",
    rowBg: "bg-red-100/40",
    labelText: "text-red-800",
    cardBg: "bg-red-200",
    cardBorder: "border-red-400",
  },
];

export const CATEGORY_MAP: Record<CategoryId, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c])
) as Record<CategoryId, Category>;
