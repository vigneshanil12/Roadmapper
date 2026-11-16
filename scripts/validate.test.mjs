// Tests for the server-side card validator (src/lib/validate.ts).
// Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { validateCard, invalid, CATEGORY_IDS, CARD_STATUSES, LIMITS } from "../src/lib/validate.ts";

const ID = "3f2a1c4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const card = {
  id: ID, title: "Partner portal v2", body: "line one\nline two", category: "partner",
  col_year: 2026, col_month: 12, col_half: 1, span: 2, value: 3, position: 0, status: "tentative", tray: false,
};

test("a real card passes create and is returned unchanged", () => {
  const v = validateCard(card, "create");
  assert.equal(v.ok, true);
  assert.deepEqual(v.value, card);
});

test("create fills defaults and needs the cell", () => {
  const v = validateCard({ category: "bugs", col_year: 2027, col_month: 1, col_half: 0 }, "create");
  assert.deepEqual(v, {
    ok: true,
    value: { title: "", body: "", category: "bugs", col_year: 2027, col_month: 1, col_half: 0, span: 1, value: 0, position: 0, status: "normal", tray: false },
  });
  const missing = validateCard({ category: "bugs", col_year: 2027, col_half: 0 }, "create");
  assert.deepEqual(missing, { ok: false, field: "col_month", error: "required" });
});

test("unknown fields are dropped (no writing created_by / deleted_at)", () => {
  const v = validateCard({ ...card, created_by: "Forged", deleted_at: null, jira: "x" }, "create");
  assert.deepEqual(Object.keys(v.value).sort(), Object.keys(card).sort());
  const p = validateCard({ title: "x", deleted_at: "2026-01-01" }, "patch");
  assert.deepEqual(p.value, { title: "x" });
});

const bad = [
  ["category", "Growth"], ["category", "ops"], ["status", "blocked"],
  ["col_month", 0], ["col_month", 13], ["col_month", 6.5], ["col_month", "6"],
  ["col_half", 2], ["col_half", -1], ["col_year", 2025], ["col_year", 2041],
  ["value", 4], ["value", -1], ["span", 0], ["span", LIMITS.spanMax + 1],
  ["position", -1], ["position", 1.5], ["tray", "false"], ["tray", 1],
  ["id", "not-a-uuid"], ["title", "x".repeat(121)], ["body", "x".repeat(2001)], ["title", 5],
];
for (const [field, value] of bad) {
  test(`rejects ${field}=${JSON.stringify(value).slice(0, 20)}`, () => {
    const v = validateCard({ ...card, [field]: value }, "create");
    assert.equal(v.ok, false);
    assert.equal(v.field, field);
    assert.match(invalid(v).error, new RegExp(`^Invalid ${field}: `));
  });
}

test("limits accept the edges", () => {
  for (const [f, val] of [["title", "x".repeat(120)], ["body", "x".repeat(2000)], ["span", 96], ["col_year", 2040], ["position", 10000], ["value", 0]])
    assert.equal(validateCard({ ...card, [f]: val }, "create").ok, true, f);
});

test("patch validates only what is sent; empty patch is rejected", () => {
  assert.deepEqual(validateCard({ status: "done" }, "patch"), { ok: true, value: { status: "done" } });
  assert.equal(validateCard({ status: "nope" }, "patch").field, "status");
  assert.equal(validateCard({}, "patch").ok, false);
  assert.equal(validateCard(null, "patch").ok, false);
  assert.equal(validateCard([], "patch").ok, false);
});

test("move needs id + cell + position; tray defaults false", () => {
  const row = { id: ID, category: "features", col_year: 2026, col_month: 8, col_half: 0, position: 2 };
  assert.deepEqual(validateCard(row, "move"), { ok: true, value: { ...row, tray: false } });
  assert.deepEqual(validateCard({ ...row, id: undefined }, "move"), { ok: false, field: "id", error: "required" });
  assert.equal(validateCard({ ...row, position: undefined }, "move").field, "position");
  assert.equal(validateCard({ ...row, title: "x" }, "move").value.title, undefined);
});

test("enums match the unions in types.ts", () => {
  const src = readFileSync(new URL("../src/lib/types.ts", import.meta.url), "utf8");
  const union = (name) =>
    src.match(new RegExp(`type ${name} = ([^;]+);`))[1].split("|").map((s) => s.trim().replace(/"/g, ""));
  assert.deepEqual(union("CategoryId"), [...CATEGORY_IDS]);
  assert.deepEqual(union("CardStatus"), [...CARD_STATUSES]);
});

test("every card in the latest ops snapshot passes", (t) => {
  let snap;
  try {
    const dir = new URL("../../urbanaut/snapshots/roadmap/", import.meta.url);
    const latest = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().pop();
    snap = JSON.parse(readFileSync(new URL(latest, dir), "utf8"));
  } catch {
    t.skip("ops repo snapshot not available on this machine");
    return;
  }
  for (const c of snap.cards) {
    const v = validateCard(c, "create");
    assert.equal(v.ok, true, `${c.id} ${v.field}: ${v.error}`);
  }
});
