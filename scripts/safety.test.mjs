// Tests for the data-safety helpers (src/lib/safety.ts): actor stamping, the
// soft-delete read filter and the history skip rule the DB trigger mirrors.
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import {
  UNKNOWN_ACTOR,
  actorFrom,
  stampUpdate,
  stampInsert,
  softDeletePatch,
  restorePatch,
  notDeleted,
  deletedSince,
  isHistoryNoise,
  safeEqual,
} from "../src/lib/safety.ts";

const req = (cookies) => ({
  cookies: { get: (n) => (n in cookies ? { value: cookies[n] } : undefined) },
});

test("actor comes from the rm_name cookie", () => {
  assert.equal(actorFrom(req({ rm_name: "Mrunal" })), "Mrunal");
  assert.equal(actorFrom(req({ rm_name: "  Vignesh " })), "Vignesh");
});

test("missing or blank cookie → unknown", () => {
  assert.equal(actorFrom(req({})), UNKNOWN_ACTOR);
  assert.equal(actorFrom(req({ rm_name: "   " })), UNKNOWN_ACTOR);
});

test("stamp overrides any body-supplied actor", () => {
  const patch = { title: "x", updated_by: "Forged" };
  assert.deepEqual(stampUpdate(patch, "Samyukta"), { title: "x", updated_by: "Samyukta" });
  const row = { title: "y", created_by: "Forged", updated_by: "Forged" };
  assert.deepEqual(stampInsert(row, "Vignesh"), {
    title: "y",
    created_by: "Vignesh",
    updated_by: "Vignesh",
  });
});

test("soft delete sets deleted_at + actor; restore clears it", () => {
  const now = new Date("2026-10-23T10:00:00Z");
  assert.deepEqual(softDeletePatch("Vignesh", now), {
    deleted_at: "2026-10-23T10:00:00.000Z",
    updated_by: "Vignesh",
  });
  assert.deepEqual(restorePatch("Vignesh"), { deleted_at: null, updated_by: "Vignesh" });
});

test("notDeleted filters on deleted_at is null and keeps the builder chain", () => {
  const calls = [];
  const q = { is(col, val) { calls.push([col, val]); return q; } };
  assert.equal(notDeleted(q), q);
  assert.deepEqual(calls, [["deleted_at", null]]);
});

test("deletedSince looks back 30 days by default", () => {
  const now = new Date("2026-10-31T00:00:00Z");
  assert.equal(deletedSince(now), "2026-10-01T00:00:00.000Z");
});

test("history skips position-only reorders, keeps real changes", () => {
  const base = { id: "a", title: "t", col_month: 10, position: 0, updated_at: "1", updated_by: "V" };
  assert.equal(isHistoryNoise(base, { ...base, position: 3, updated_at: "2", updated_by: "M" }), true);
  assert.equal(isHistoryNoise(base, { ...base, col_month: 11, position: 3 }), false);
  assert.equal(isHistoryNoise(base, { ...base, title: "t2" }), false);
  assert.equal(isHistoryNoise(base, { ...base, deleted_at: "2026-10-23" }), false);
});

test("safeEqual", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
});
