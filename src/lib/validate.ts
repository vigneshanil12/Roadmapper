// Server-side card validation, shared by POST /api/cards, PATCH /api/cards/[id]
// and POST /api/cards/batch. Import-free so `npm test` can load it. The same
// limits exist as CHECK constraints on public.cards
// (supabase/migrations/20261116_r15_checks.sql); keep the two in step.
// Must match the unions in src/lib/types.ts (a test checks this).

export const CATEGORY_IDS = ["growth", "partner", "features", "bugs"] as const;
export const CARD_STATUSES = ["normal", "done", "tentative"] as const;

export const LIMITS = {
  titleMax: 120,
  bodyMax: 2000,
  yearMin: 2026,
  yearMax: 2040,
  // The resize handle allows "columns left in the window" (window grows two
  // columns a month), so cap at 4 years of half-months.
  spanMax: 96,
  positionMax: 10000,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Mode = "create" | "patch" | "move";
export type CardFields = {
  id?: string;
  title?: string;
  body?: string;
  category?: string;
  col_year?: number;
  col_month?: number;
  col_half?: number;
  span?: number;
  value?: number;
  position?: number;
  status?: string;
  tray?: boolean;
};
export type Validated =
  | { ok: true; value: CardFields }
  | { ok: false; field: string; error: string };

const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

type Rule = (v: unknown) => string | null;
const RULES: Record<keyof CardFields, Rule> = {
  id: (v) => (typeof v === "string" && UUID.test(v) ? null : "must be a UUID"),
  title: (v) =>
    typeof v !== "string" ? "must be text" : v.length > LIMITS.titleMax ? `max ${LIMITS.titleMax} characters` : null,
  body: (v) =>
    typeof v !== "string" ? "must be text" : v.length > LIMITS.bodyMax ? `max ${LIMITS.bodyMax} characters` : null,
  category: (v) => ((CATEGORY_IDS as readonly unknown[]).includes(v) ? null : `one of ${CATEGORY_IDS.join(", ")}`),
  status: (v) => ((CARD_STATUSES as readonly unknown[]).includes(v) ? null : `one of ${CARD_STATUSES.join(", ")}`),
  col_year: (v) => (int(v, LIMITS.yearMin, LIMITS.yearMax) ? null : `integer ${LIMITS.yearMin}-${LIMITS.yearMax}`),
  col_month: (v) => (int(v, 1, 12) ? null : "integer 1-12"),
  col_half: (v) => (v === 0 || v === 1 ? null : "0 or 1"),
  span: (v) => (int(v, 1, LIMITS.spanMax) ? null : `integer 1-${LIMITS.spanMax}`),
  value: (v) => (int(v, 0, 3) ? null : "integer 0-3"),
  position: (v) => (int(v, 0, LIMITS.positionMax) ? null : `integer 0-${LIMITS.positionMax}`),
  tray: (v) => (typeof v === "boolean" ? null : "true or false"),
};

const CONTENT = ["title", "body", "category", "col_year", "col_month", "col_half", "span", "value", "position", "status", "tray"] as const;
const MOVE = ["id", "category", "col_year", "col_month", "col_half", "position", "tray"] as const;

const DEFAULTS: CardFields = { title: "", body: "", span: 1, value: 0, position: 0, status: "normal", tray: false };

// create: full card (defaults filled, id optional); patch: only the fields
// present; move: one batch row (id + cell + position, all required except tray).
// Unknown fields are dropped. First failure wins.
export function validateCard(input: unknown, mode: Mode): Validated {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, field: "body", error: "JSON object required" };
  }
  const src = input as Record<string, unknown>;
  const keys: readonly (keyof CardFields)[] =
    mode === "move" ? MOVE : mode === "create" ? ["id", ...CONTENT] : CONTENT;
  const out: CardFields = {};
  for (const k of keys) {
    let v = src[k];
    if (v === undefined || v === null) {
      if (mode === "create" && k in DEFAULTS) v = DEFAULTS[k];
      else if (mode === "move" && k === "tray") v = false;
      else if (mode === "patch" || k === "id") {
        if (mode === "move" && k === "id") return { ok: false, field: "id", error: "required" };
        continue;
      } else return { ok: false, field: k, error: "required" };
    }
    const err = RULES[k](v);
    if (err) return { ok: false, field: k, error: err };
    (out as Record<string, unknown>)[k] = v;
  }
  if (mode === "patch" && Object.keys(out).length === 0) {
    return { ok: false, field: "body", error: "no card fields to update" };
  }
  return { ok: true, value: out };
}

// The JSON body for a 400.
export function invalid(v: { field: string; error: string }) {
  return { error: `Invalid ${v.field}: ${v.error}`, field: v.field };
}
