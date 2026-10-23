// Data-safety helpers shared by the API routes: who made a change (actor
// stamps) and the soft-delete filter. No imports, so `npm test` can load this
// file directly (Node strips the types).
//
// The actor always comes from the rm_name cookie set by /api/login, never from
// the request body, so a client can't write someone else's name into history.

export const UNKNOWN_ACTOR = "unknown";
const NAME_COOKIE = "rm_name"; // mirrors auth.ts NAME_COOKIE

// How far back the "Recently deleted" panel looks.
export const DELETED_WINDOW_DAYS = 30;

type CookieSource = {
  cookies: { get(name: string): { value: string } | undefined };
};

export function actorFrom(req: CookieSource): string {
  const name = req.cookies.get(NAME_COOKIE)?.value?.trim();
  return name ? name.slice(0, 80) : UNKNOWN_ACTOR;
}

// Stamp an UPDATE. Applied last so a stray body field can't override it.
export function stampUpdate<T extends object>(
  patch: T,
  actor: string
): T & { updated_by: string } {
  return { ...patch, updated_by: actor };
}

// Stamp an INSERT.
export function stampInsert<T extends object>(
  row: T,
  actor: string
): T & { created_by: string; updated_by: string } {
  return { ...row, created_by: actor, updated_by: actor };
}

// The soft-delete marker: deleted_at + who deleted it.
export function softDeletePatch(actor: string, now = new Date()) {
  return { deleted_at: now.toISOString(), updated_by: actor };
}

export function restorePatch(actor: string) {
  return { deleted_at: null, updated_by: actor };
}

// Every read of live rows goes through this so a deleted card or comment never
// reaches the board, the comment threads or the assistant.
export function notDeleted<Q extends { is(column: string, value: null): Q }>(
  query: Q
): Q {
  return query.is("deleted_at", null);
}

export function deletedSince(now = new Date(), days = DELETED_WINDOW_DAYS): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

// Mirror of the row_history trigger's skip rule (supabase/migrations/
// 20261023_r1_safety.sql): an UPDATE that only touches these columns is a
// reorder within a cell and isn't logged. Kept here so the rule is tested.
export const HISTORY_NOISE = ["position", "updated_at", "updated_by"] as const;

export function isHistoryNoise(
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>
): boolean {
  const keys = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);
  for (const k of keys) {
    if ((HISTORY_NOISE as readonly string[]).includes(k)) continue;
    if (JSON.stringify(oldRow[k]) !== JSON.stringify(newRow[k])) return false;
  }
  return true;
}

// Constant-time string compare for the export bearer token.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
