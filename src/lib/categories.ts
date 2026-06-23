import type { CategoryId } from "./types";

export interface Category {
  id: CategoryId;
  label: string;
  // Tailwind classes tuned to match the FigJam board palette.
  rowBg: string; // category label cell + faint row tint
  labelText: string;
  cardBg: string;
  cardBgFaint: string; // 50% opacity fill for dashed/tentative cards
  cardBorder: string;
  cardBorderHex: string; // border hex (matches cardBorder) for custom dashed stroke
  // Value badge fills for value 1/2/3 (lightest → darkest), each "bg + text".
  valueFill: [string, string, string];
  // Value badge for 0: outline only, no fill.
  valueOutline: string;
  // Month-header total chip: light fill + thick underline bar.
  chipBg: string;
  chipBar: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "growth",
    label: "Growth & User Delight",
    rowBg: "bg-green-100/40",
    labelText: "text-green-800",
    cardBg: "bg-green-200",
    cardBgFaint: "bg-green-200/50",
    cardBorder: "border-green-400",
    cardBorderHex: "#4ade80",
    valueFill: [
      "bg-green-300 text-green-900",
      "bg-green-500 text-white",
      "bg-green-700 text-white",
    ],
    valueOutline: "border border-green-500 text-green-700",
    chipBg: "bg-green-100",
    chipBar: "bg-green-600",
  },
  {
    id: "partner",
    label: "Partner Convenience",
    rowBg: "bg-amber-100/40",
    labelText: "text-amber-800",
    cardBg: "bg-amber-200",
    cardBgFaint: "bg-amber-200/50",
    cardBorder: "border-amber-400",
    cardBorderHex: "#fbbf24",
    valueFill: [
      "bg-amber-300 text-amber-900",
      "bg-amber-500 text-white",
      "bg-amber-700 text-white",
    ],
    valueOutline: "border border-amber-500 text-amber-700",
    chipBg: "bg-amber-100",
    chipBar: "bg-amber-600",
  },
  {
    id: "features",
    label: "New Features",
    rowBg: "bg-violet-100/40",
    labelText: "text-violet-800",
    cardBg: "bg-violet-200",
    cardBgFaint: "bg-violet-200/50",
    cardBorder: "border-violet-400",
    cardBorderHex: "#a78bfa",
    valueFill: [
      "bg-violet-300 text-violet-900",
      "bg-violet-500 text-white",
      "bg-violet-700 text-white",
    ],
    valueOutline: "border border-violet-500 text-violet-700",
    chipBg: "bg-violet-100",
    chipBar: "bg-violet-600",
  },
  {
    id: "bugs",
    label: "Bugs",
    rowBg: "bg-red-100/40",
    labelText: "text-red-800",
    cardBg: "bg-red-200",
    cardBgFaint: "bg-red-200/50",
    cardBorder: "border-red-400",
    cardBorderHex: "#f87171",
    valueFill: [
      "bg-red-300 text-red-900",
      "bg-red-500 text-white",
      "bg-red-700 text-white",
    ],
    valueOutline: "border border-red-500 text-red-700",
    chipBg: "bg-red-100",
    chipBar: "bg-red-600",
  },
];

export const CATEGORY_MAP: Record<CategoryId, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c])
) as Record<CategoryId, Category>;
