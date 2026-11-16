// Per-step undo/redo for the board. Import-free so `npm test` can load it.
//
// A step records only the cards one user action touched, each with its state
// before and after (null = not on the board). Undo writes back only those
// cards, and only when the card still looks the way this user left it; if
// someone else changed it since, it is skipped and reported instead of being
// overwritten. Cards nobody in this step touched are never written, so other
// editors' (and agents') adds, edits and deletes survive an undo.

export type UndoCard = {
  id: string;
  title: string;
  body: string;
  category: string;
  col_year: number;
  col_month: number;
  col_half: number;
  span: number;
  value: number;
  position: number;
  status: string;
  tray: boolean;
};

export type Change<C extends UndoCard = UndoCard> = { id: string; before: C | null; after: C | null };
export type Step<C extends UndoCard = UndoCard> = { changes: Change<C>[] };

export type Write<C extends UndoCard = UndoCard> =
  | { kind: "create"; id: string; card: C } // card is gone live: POST with its id (revives the soft-deleted row)
  | { kind: "update"; id: string; card: C }
  | { kind: "delete"; id: string };

export const MAX_STEPS = 20;

// Fields that are the card's content. Position is written back but ignored for
// conflict checks: it shifts whenever anyone reorders the same cell.
const CONTENT = ["title", "body", "category", "col_year", "col_month", "col_half", "span", "value", "status", "tray"] as const;
export const PAYLOAD = [...CONTENT, "position"] as const;

export function payload<C extends UndoCard>(c: C): Omit<UndoCard, "id"> {
  const out: Record<string, unknown> = {};
  for (const k of PAYLOAD) out[k] = c[k];
  return out as Omit<UndoCard, "id">;
}

export function sameContent(a: UndoCard | null | undefined, b: UndoCard | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return CONTENT.every((k) => a[k] === b[k]);
}

function samePayload(a: UndoCard | null | undefined, b: UndoCard | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return PAYLOAD.every((k) => a[k] === b[k]);
}

// Build a step from the cards map before the action and after it, limited to
// the ids the action touched. Ids whose state didn't change are dropped; an
// empty step (e.g. a drag that moved nothing) returns null.
export function buildStep<C extends UndoCard>(
  before: Record<string, C>,
  after: Record<string, C | undefined>,
  ids: Iterable<string>
): Step<C> | null {
  const changes: Change<C>[] = [];
  for (const id of new Set(ids)) {
    const b = before[id] ?? null;
    const a = after[id] ?? null;
    if (samePayload(b, a)) continue;
    changes.push({ id, before: b ? { ...b } : null, after: a ? { ...a } : null });
  }
  return changes.length ? { changes } : null;
}

// Plan undoing `step` against the live board. Each change is reverted only if
// the live card still matches the step's "after" content; otherwise it's
// skipped. Returns the writes to send, the cards map to show, the ids skipped,
// and the inverse step (what redo needs) covering only what was applied.
export function planUndo<C extends UndoCard>(
  step: Step<C>,
  live: Record<string, C>
): { writes: Write<C>[]; cards: Record<string, C>; skipped: string[]; inverse: Step<C> | null } {
  const writes: Write<C>[] = [];
  const skipped: string[] = [];
  const applied: Change<C>[] = [];
  const cards: Record<string, C> = { ...live };
  for (const ch of step.changes) {
    const now = live[ch.id] ?? null;
    if (!sameContent(now, ch.after)) {
      skipped.push(ch.id);
      continue;
    }
    const target = ch.before;
    if (target === null) {
      writes.push({ kind: "delete", id: ch.id });
      delete cards[ch.id];
    } else {
      writes.push(now === null ? { kind: "create", id: ch.id, card: target } : { kind: "update", id: ch.id, card: target });
      cards[ch.id] = { ...target };
    }
    // Redo goes from what is live now back to what this step had made.
    applied.push({ id: ch.id, before: ch.after, after: target });
  }
  return { writes, cards, skipped, inverse: applied.length ? { changes: applied } : null };
}

// Group ids by container (tray or cell key), ordered by position — the same
// layout rule the load and the poll use.
export function buildItems<C extends UndoCard>(
  cards: Record<string, C>,
  cellIds: string[],
  trayId: string,
  keyOf: (c: C) => string
): Record<string, string[]> {
  const map: Record<string, string[]> = { [trayId]: [] };
  for (const k of cellIds) map[k] = [];
  for (const id in cards) (map[keyOf(cards[id])] ||= []).push(id);
  for (const k in map) map[k].sort((a, b) => cards[a].position - cards[b].position);
  return map;
}

// Push onto a bounded stack (oldest dropped).
export function pushBounded<T>(stack: T[], item: T, max = MAX_STEPS): T[] {
  const next = [...stack, item];
  return next.length > max ? next.slice(next.length - max) : next;
}
