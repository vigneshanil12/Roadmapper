// Tests for per-step undo/redo (src/lib/undo.ts): single-user behaviour stays
// the same, and undo never reverts another editor's work. Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { buildStep, planUndo, buildItems, pushBounded, payload, MAX_STEPS } from "../src/lib/undo.ts";

const card = (id, over = {}) => ({
  id, title: id.toUpperCase(), body: "", category: "features",
  col_year: 2026, col_month: 12, col_half: 0, span: 1, value: 0, position: 0, status: "normal", tray: false, jira_keys: [],
  ...over,
});
const board = (...cs) => Object.fromEntries(cs.map((c) => [c.id, c]));

// Simulate the server: apply a plan's writes to a board map.
function serverApply(live, writes) {
  const out = { ...live };
  for (const w of writes) {
    if (w.kind === "delete") delete out[w.id];
    else out[w.id] = { ...w.card };
  }
  return out;
}
// Undo then redo round-trip on a single-user board.
function roundTrip(before, after, ids) {
  const step = buildStep(before, after, ids);
  assert.ok(step, "step recorded");
  const u = planUndo(step, after);
  assert.deepEqual(u.skipped, []);
  assert.deepEqual(serverApply(after, u.writes), before);
  assert.deepEqual(u.cards, before);
  const r = planUndo(u.inverse, u.cards);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(r.cards, after);
  return { step, u, r };
}

// ---- single user ----

test("add → undo deletes it → redo re-creates the same id", () => {
  const a = card("a");
  const n = card("n", { position: 1 });
  const { u, r } = roundTrip(board(a), board(a, n), ["n"]);
  assert.deepEqual(u.writes, [{ kind: "delete", id: "n" }]);
  assert.equal(r.writes[0].kind, "create");
  assert.equal(r.writes[0].id, "n");
});

test("edit title / status / value / span each undo + redo", () => {
  const a = card("a");
  for (const patch of [{ title: "New" }, { status: "done" }, { value: 3 }, { span: 4 }, { body: "x\ny" }]) {
    const { u } = roundTrip(board(a), board({ ...a, ...patch }), ["a"]);
    assert.deepEqual(u.writes, [{ kind: "update", id: "a", card: a }]);
  }
});

test("delete → undo revives the same row (POST with id) → redo deletes again", () => {
  const a = card("a");
  const { u, r } = roundTrip(board(a), {}, ["a"]);
  assert.deepEqual(u.writes, [{ kind: "create", id: "a", card: a }]);
  assert.deepEqual(r.writes, [{ kind: "delete", id: "a" }]);
});

test("single drag across cells, incl. the reindexed neighbours", () => {
  const a = card("a", { position: 0 });
  const b = card("b", { position: 1 });
  const c = card("c", { col_month: 11, position: 0 });
  const after = board({ ...a, col_month: 11, position: 1 }, { ...b, position: 0 }, c);
  const { u } = roundTrip(board(a, b, c), after, ["a", "b"]);
  assert.equal(u.writes.length, 2);
});

test("group drag of three cards into the tray", () => {
  const cs = ["a", "b", "c"].map((id, i) => card(id, { position: i }));
  const after = board(...cs.map((c, i) => ({ ...c, tray: true, position: i })));
  roundTrip(board(...cs), after, ["a", "b", "c"]);
});

test("a drag that moved nothing records no step", () => {
  const a = card("a");
  assert.equal(buildStep(board(a), board({ ...a }), ["a"]), null);
  assert.equal(buildStep(board(a), board(a), []), null);
});

test("history is bounded", () => {
  let s = [];
  for (let i = 0; i < MAX_STEPS + 5; i++) s = pushBounded(s, i);
  assert.equal(s.length, MAX_STEPS);
  assert.equal(s[0], 5);
});

test("steps are snapshots: later local mutation can't change them", () => {
  const a = card("a");
  const before = board(a);
  const step = buildStep(before, board({ ...a, title: "X" }), ["a"]);
  before.a.title = "mutated";
  assert.equal(step.changes[0].before.title, "A");
});

// ---- two editors ----

test("another editor's new card survives my undo", () => {
  const a = card("a");
  const step = buildStep(board(a), board({ ...a, title: "Mine" }), ["a"]);
  const theirs = card("t", { title: "Theirs" });
  const live = board({ ...a, title: "Mine" }, theirs);
  const u = planUndo(step, live);
  assert.deepEqual(u.writes, [{ kind: "update", id: "a", card: a }]);
  assert.deepEqual(u.cards.t, theirs);
  assert.deepEqual(serverApply(live, u.writes).t, theirs);
});

test("another editor's edit to a different card survives my undo", () => {
  const a = card("a");
  const b = card("b");
  const step = buildStep(board(a, b), board({ ...a, status: "done" }, b), ["a"]);
  const live = board({ ...a, status: "done" }, { ...b, title: "Edited by M" });
  const u = planUndo(step, live);
  assert.equal(u.writes.length, 1);
  assert.equal(u.cards.b.title, "Edited by M");
});

test("another editor's delete of a different card is not revived", () => {
  const a = card("a");
  const b = card("b");
  const step = buildStep(board(a, b), board({ ...a, value: 2 }, b), ["a"]);
  const u = planUndo(step, board({ ...a, value: 2 }));
  assert.equal(u.writes.length, 1);
  assert.equal(u.cards.b, undefined);
});

test("a card I touched that someone else then edited is skipped, not overwritten", () => {
  const a = card("a");
  const step = buildStep(board(a), board({ ...a, title: "Mine" }), ["a"]);
  const u = planUndo(step, board({ ...a, title: "Theirs" }));
  assert.deepEqual(u.writes, []);
  assert.deepEqual(u.skipped, ["a"]);
  assert.equal(u.inverse, null);
  assert.equal(u.cards.a.title, "Theirs");
});

test("a card I added that someone else then deleted stays deleted", () => {
  const n = card("n");
  const step = buildStep({}, board(n), ["n"]);
  const u = planUndo(step, {});
  assert.deepEqual(u.writes, []);
  assert.deepEqual(u.skipped, ["n"]);
});

test("a card I deleted that someone else then restored is left alone", () => {
  const a = card("a");
  const step = buildStep(board(a), {}, ["a"]);
  const u = planUndo(step, board({ ...a, title: "Restored + edited" }));
  assert.deepEqual(u.skipped, ["a"]);
});

test("mixed group step: applies the untouched ones, skips the changed one", () => {
  const cs = ["a", "b", "c"].map((id, i) => card(id, { position: i }));
  const after = cs.map((c) => ({ ...c, col_month: 11 }));
  const step = buildStep(board(...cs), board(...after), ["a", "b", "c"]);
  const live = board(after[0], { ...after[1], status: "done" }, after[2]);
  const u = planUndo(step, live);
  assert.deepEqual(u.skipped, ["b"]);
  assert.deepEqual(u.writes.map((w) => w.id), ["a", "c"]);
  assert.equal(u.inverse.changes.length, 2);
});

test("someone else only reordering the cell doesn't block my undo", () => {
  const a = card("a", { position: 0 });
  const step = buildStep(board(a), board({ ...a, span: 2 }), ["a"]);
  const u = planUndo(step, board({ ...a, span: 2, position: 3 }));
  assert.deepEqual(u.skipped, []);
  assert.equal(u.writes[0].card.span, 1);
});

test("redo after someone changed the card is skipped too", () => {
  const a = card("a");
  const step = buildStep(board(a), board({ ...a, title: "Mine" }), ["a"]);
  const u = planUndo(step, board({ ...a, title: "Mine" }));
  const r = planUndo(u.inverse, board({ ...a, title: "Theirs" }));
  assert.deepEqual(r.skipped, ["a"]);
});

// ---- helpers ----

test("buildItems groups by cell, tray separate, ordered by position", () => {
  const key = (c) => (c.tray ? "tray" : `${c.category}|${c.col_year}|${c.col_month}|${c.col_half}`);
  const cells = ["features|2026|12|0", "bugs|2026|12|0"];
  const items = buildItems(
    board(card("a", { position: 2 }), card("b", { position: 0 }), card("t", { tray: true })),
    cells,
    "tray",
    key
  );
  assert.deepEqual(items, { tray: ["t"], "features|2026|12|0": ["b", "a"], "bugs|2026|12|0": [] });
});

test("payload carries only card fields", () => {
  assert.deepEqual(Object.keys(payload({ ...card("a"), created_by: "x", updated_at: "y" })).sort(), [
    "body", "category", "col_half", "col_month", "col_year", "jira_keys", "position", "span", "status", "title", "tray", "value",
  ]);
});

test("jira_keys edits are undoable and conflict-checked by value", () => {
  const a = card("a");
  const linked = { ...a, jira_keys: ["URBN-1"] };
  roundTrip(board(a), board(linked), ["a"]);
  const step = buildStep(board(a), board(linked), ["a"]);
  // Same keys, new array instance: still "unchanged since", so undo applies.
  assert.deepEqual(planUndo(step, board({ ...linked, jira_keys: ["URBN-1"] })).skipped, []);
  // Someone else changed the links since: skipped.
  assert.deepEqual(planUndo(step, board({ ...linked, jira_keys: ["URBN-2"] })).skipped, ["a"]);
});
