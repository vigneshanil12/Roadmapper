import type { CategoryId } from "./types";

export interface Category {
  id: CategoryId;
  label: string;
  // Tailwind classes tuned to match the FigJam board palette.
  rowBg: string; // category label cell + faint row tint
  labelText: string;
  cardBg: string;
  cardBorder: string;
  // Value badge fills for value 1/2/3 (lightest → darkest), each "bg + text".
  valueFill: [string, string, string];
  // Value badge for 0: outline only, no fill.
  valueOutline: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "growth",
    label: "Growth & User Delight",
    rowBg: "bg-green-100/40",
    labelText: "text-green-800",
    cardBg: "bg-green-200",
    cardBorder: "border-green-400",
    valueFill: [
      "bg-green-300 text-green-900",
      "bg-green-500 text-white",
      "bg-green-700 text-white",
    ],
    valueOutline: "border border-green-500 text-green-700",
  },
  {
    id: "partner",
    label: "Partner Convenience",
    rowBg: "bg-amber-100/40",
    labelText: "text-amber-800",
    cardBg: "bg-amber-200",
    cardBorder: "border-amber-400",
    valueFill: [
      "bg-amber-300 text-amber-900",
      "bg-amber-500 text-white",
      "bg-amber-700 text-white",
    ],
    valueOutline: "border border-amber-500 text-amber-700",
  },
  {
    id: "features",
    label: "New Features",
    rowBg: "bg-violet-100/40",
    labelText: "text-violet-800",
    cardBg: "bg-violet-200",
    cardBorder: "border-violet-400",
    valueFill: [
      "bg-violet-300 text-violet-900",
      "bg-violet-500 text-white",
      "bg-violet-700 text-white",
    ],
    valueOutline: "border border-violet-500 text-violet-700",
  },
  {
    id: "bugs",
    label: "Bugs",
    rowBg: "bg-red-100/40",
    labelText: "text-red-800",
    cardBg: "bg-red-200",
    cardBorder: "border-red-400",
    valueFill: [
      "bg-red-300 text-red-900",
      "bg-red-500 text-white",
      "bg-red-700 text-white",
    ],
    valueOutline: "border border-red-500 text-red-700",
  },
];

export const CATEGORY_MAP: Record<CategoryId, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c])
) as Record<CategoryId, Category>;
