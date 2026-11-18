// Tests for the R3 agent lane rules (src/lib/agent.ts) and a source check on
// the bearer route. Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { AGENT_NS, checkRow, isAgentActor, planRow, tierOf, uuid5 } from "../src/lib/agent.ts";

const ok = { decided_by: "vignesh@urbanaut.in" };
const CARD = "11111111-2222-4333-8444-555555555555";
const live = (over = {}) => ({
  id: CARD, title: "Partial cancellations", body: "", category: "features",
  col_year: 2026, col_month: 10, col_half: 1, span: 1, value: 0, position: 0,
  status: "normal", tray: false, jira_keys: ["URBN-2656"], deleted_at: null, ...over,
});
const doneCard = {
  title: "Host analytics phase 1", body: "Mobile + web", category: "partner",
  col_year: 2026, col_month: 10, col_half: 0, status: "done", tray: false,
};

test("uuid5 is standard RFC 4122 v5 (matches Python uuid.uuid5)", () => {
  // python3 -c "import uuid;print(uuid.uuid5(uuid.UUID('6f1c2d0e-3b7a-5c4e-9a1d-8e2f4b6c7d90'),'RP-20261118-001-01'))"
  assert.equal(AGENT_NS, "6f1c2d0e-3b7a-5c4e-9a1d-8e2f4b6c7d90");
  assert.equal(uuid5("RP-20261118-001-01"), "b8749ca2-a75e-55ee-a6a0-c8a3905280e3");
  assert.match(uuid5("x"), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(uuid5("a"), uuid5("a"));
  assert.notEqual(uuid5("a"), uuid5("b"));
});

test("tier: only tentative tray cards and comments are notify", () => {
  assert.equal(tierOf("comment", {}), "notify");
  assert.equal(tierOf("create_card", { status: "tentative", tray: true }), "notify");
  assert.equal(tierOf("create_card", { status: "tentative", tray: false }), "gate");
  assert.equal(tierOf("create_card", { status: "done", tray: true }), "gate");
  assert.equal(tierOf("create_card", { status: "normal", tray: true }), "gate");
  assert.equal(tierOf("edit_card", {}), "gate");
  assert.equal(tierOf("link_keys", {}), "gate");
  assert.equal(tierOf("delete_card", {}), "gate");
});

test("checkRow: unknown ops, bad ids and unapproved gate rows are refused", () => {
  assert.match(checkRow({ id: "RP-20261118-001-01", op: "delete_card", card_id: CARD, payload: {} }), /op must be/);
  assert.match(checkRow({ id: "x", op: "comment", card_id: CARD, payload: { body: "hi" } }), /id must/);
  assert.match(checkRow({ id: "RP-20261118-001-01", op: "comment", payload: { body: "hi" } }), /card_id/);
  assert.match(checkRow({ id: "RP-20261118-001-01", op: "create_card", payload: doneCard }), /approval/);
  assert.match(checkRow({ id: "RP-20261118-001-01", op: "create_card", payload: doneCard, approval: { decided_by: " " } }), /approval/);
  assert.equal(checkRow({ id: "RP-20261118-001-01", op: "create_card", payload: doneCard, approval: ok }), null);
  assert.equal(checkRow({ id: "RP-20261118-001-02", op: "comment", card_id: CARD, payload: { body: "hi" } }), null);
});

test("create_card: deterministic id, validated, never revives a deleted card", () => {
  const row = { id: "RP-20261118-001-01", op: "create_card", payload: doneCard, approval: ok };
  const p = planRow(row, null);
  assert.equal(p.kind, "insert_card");
  assert.equal(p.id, uuid5("RP-20261118-001-01"));
  assert.equal(p.fields.status, "done");
  assert.equal(p.fields.span, 1);
  assert.equal(planRow(row, { id: p.id, deleted_at: null }).kind, "noop");
  const del = planRow(row, { id: p.id, deleted_at: "2026-11-19T00:00:00Z" });
  assert.equal(del.kind, "noop");
  assert.match(del.why, /not revived/);
  const bad = planRow({ ...row, payload: { ...doneCard, category: "nope" } }, null);
  assert.equal(bad.kind, "fail");
  // a caller-supplied id is ignored
  assert.equal(planRow({ ...row, payload: { ...doneCard, id: CARD } }, null).id, uuid5(row.id));
});

test("comment: needs a live card, idempotent by id, length capped", () => {
  const row = { id: "RP-20261118-001-02", op: "comment", card_id: CARD, payload: { body: " Shipped 29 Sep " } };
  const p = planRow(row, live());
  assert.deepEqual(p, { kind: "insert_comment", id: uuid5(row.id), card_id: CARD, body: "Shipped 29 Sep" });
  assert.equal(planRow(row, live(), { id: p.id }).kind, "noop");
  assert.equal(planRow(row, null).kind, "fail");
  assert.equal(planRow(row, live({ deleted_at: "2026-11-01T00:00:00Z" })).kind, "fail");
  assert.equal(planRow({ ...row, payload: { body: "x".repeat(1001) } }, live()).kind, "fail");
});

test("edit_card: applies only changed fields, no-op on re-apply, fails if a person changed it", () => {
  const row = {
    id: "RP-20261118-001-03", op: "edit_card", card_id: CARD, approval: ok,
    payload: { set: { status: "done" }, expect: { status: "normal", title: "Partial cancellations" } },
  };
  assert.deepEqual(planRow(row, live()), { kind: "update_card", id: CARD, fields: { status: "done" } });
  assert.equal(planRow(row, live({ status: "done" })).kind, "noop");
  const drift = planRow(row, live({ title: "Partial cancellations v2" }));
  assert.equal(drift.kind, "fail");
  assert.match(drift.error, /title/);
  assert.equal(planRow({ ...row, payload: { set: { status: "gone" } } }, live()).kind, "fail");
  assert.equal(planRow({ ...row, approval: null }, live()).kind, "fail");
});

test("link_keys: union with existing keys, normalised, no-op when present", () => {
  const row = { id: "RP-20261118-001-04", op: "link_keys", card_id: CARD, approval: ok, payload: { add: [" urbn-2700", "URBN-2656"] } };
  assert.deepEqual(planRow(row, live()), { kind: "update_card", id: CARD, fields: { jira_keys: ["URBN-2656", "URBN-2700"] } });
  assert.equal(planRow({ ...row, payload: { add: ["URBN-2656"] } }, live()).kind, "noop");
  assert.equal(planRow({ ...row, payload: { add: ["JIRA-1"] } }, live()).kind, "fail");
});

test("isAgentActor", () => {
  assert.equal(isAgentActor("agent:releases"), true);
  assert.equal(isAgentActor("Vignesh"), false);
  assert.equal(isAgentActor(null), false);
});

test("agent route checks its own bearer token first and is the only agent route", () => {
  const dir = new URL("../src/app/api/agent/", import.meta.url).pathname;
  assert.deepEqual(readdirSync(dir), ["apply"], "every agent/* route is exempt from requireRole; add none without a bearer check");
  const src = readFileSync(new URL("../src/app/api/agent/apply/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /export\s+async\s+function\s+(GET|PUT|PATCH|DELETE)\b/);
  const body = src.slice(src.indexOf("export async function POST"));
  const firstStmts = body.slice(body.indexOf("{") + 1, body.indexOf("const body ="));
  assert.match(firstStmts, /process\.env\.AGENT_APPLY_TOKEN/);
  assert.match(firstStmts, /safeEqual\(token, expected\)/);
  assert.match(firstStmts, /status: 401/);
  assert.doesNotMatch(src, /EXPORT_TOKEN/, "agent lane must not accept the export token");
  const proxy = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /pathname === "\/api\/agent\/apply"/);
});
