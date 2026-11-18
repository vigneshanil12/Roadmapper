// Agent proposal lane (R3). The only way an agent's change reaches the board:
// agents write proposal files in the ops repo, the ops repo's applier Action
// (no LLM) sends approved rows here with AGENT_APPLY_TOKEN. This file holds
// the pure rules so `npm test` can check them; the route does the I/O.
//
// Rules (docs/agent-platform/roadmapper.md → R3 in the ops repo):
// - ops: create_card | comment | edit_card | link_keys. Nothing else (no
//   delete, no settings, no comment edits).
// - tier is computed HERE from op + payload, never trusted from the caller:
//   notify = a tentative card in the tray, or a comment. Everything else is
//   gate and needs `approval.decided_by` (the applier sets it only for rows
//   the owner approved on the dashboard).
// - idempotent: a created card / comment gets id = uuid5(row id), so a
//   re-apply finds it and does nothing. A card a human deleted since stays
//   deleted (never revived).
// - edit_card carries `expect` (the values the proposer saw); if a human
//   changed any of them since, the row fails instead of overwriting.

import { createHash } from "node:crypto";
import { validateCard, type CardFields } from "./validate.ts";

export const AGENT_OPS = ["create_card", "comment", "edit_card", "link_keys"] as const;
export type AgentOp = (typeof AGENT_OPS)[number];
export type Tier = "notify" | "gate";

export const AGENT_LIMITS = { rowsPerCall: 25, commentMax: 1000 } as const;
export const ROW_ID = /^RP-\d{8}-\d{3}-\d{2,3}$/;
export const AGENT_NAME = /^[a-z][a-z0-9-]{1,30}$/;

// Fixed namespace for agent row ids (uuid5). The ops repo's Python uses the
// same value, so either side can predict a card's id.
export const AGENT_NS = "6f1c2d0e-3b7a-5c4e-9a1d-8e2f4b6c7d90";

export function uuid5(name: string, ns = AGENT_NS): string {
  const nsBytes = Buffer.from(ns.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([nsBytes, Buffer.from(name, "utf8")])).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = b.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export type AgentRow = {
  id: string;
  op: AgentOp;
  card_id?: string;
  payload: Record<string, unknown>;
  approval?: { decided_by?: string; decided_at?: string } | null;
};

export function tierOf(op: string, payload: Record<string, unknown> | undefined): Tier {
  if (op === "comment") return "notify";
  if (op === "create_card" && payload?.status === "tentative" && payload?.tray === true) return "notify";
  return "gate";
}

export type LiveCard = CardFields & { id: string; deleted_at?: string | null };
export type LiveComment = { id: string; deleted_at?: string | null };

export type Plan =
  | { kind: "insert_card"; id: string; fields: CardFields }
  | { kind: "insert_comment"; id: string; card_id: string; body: string }
  | { kind: "update_card"; id: string; fields: CardFields }
  | { kind: "noop"; id: string; why: string }
  | { kind: "fail"; error: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Shape + tier checks that need no database. Returns an error or null.
export function checkRow(row: unknown): string | null {
  if (!row || typeof row !== "object") return "row must be an object";
  const r = row as Partial<AgentRow>;
  if (typeof r.id !== "string" || !ROW_ID.test(r.id)) return "id must look like RP-20261118-001-01";
  if (!(AGENT_OPS as readonly string[]).includes(String(r.op))) return `op must be one of ${AGENT_OPS.join(", ")}`;
  if (!r.payload || typeof r.payload !== "object" || Array.isArray(r.payload)) return "payload must be an object";
  if (r.op !== "create_card" && (typeof r.card_id !== "string" || !/^[0-9a-f-]{36}$/i.test(r.card_id)))
    return "card_id (UUID) required";
  if (tierOf(r.op as string, r.payload) === "gate" && !(r.approval?.decided_by ?? "").trim())
    return "gate row needs approval.decided_by";
  return null;
}

// Decide what one row does, given what is live now. `card` = the target card
// (comment/edit/link) or the would-be created card (create). Pure.
export function planRow(row: AgentRow, card: LiveCard | null, comment: LiveComment | null = null): Plan {
  const err = checkRow(row);
  if (err) return { kind: "fail", error: err };
  const p = row.payload;

  if (row.op === "create_card") {
    const id = uuid5(row.id);
    if (card) return { kind: "noop", id, why: card.deleted_at ? "deleted by a person since; not revived" : "already applied" };
    const { id: _ignored, ...rest } = p as Record<string, unknown>;
    void _ignored;
    const v = validateCard(rest, "create");
    if (!v.ok) return { kind: "fail", error: `Invalid ${v.field}: ${v.error}` };
    return { kind: "insert_card", id, fields: v.value };
  }

  if (!card || card.deleted_at) return { kind: "fail", error: "target card not found (deleted or wrong id)" };

  if (row.op === "comment") {
    const id = uuid5(row.id);
    if (comment) return { kind: "noop", id, why: "already applied" };
    const body = typeof p.body === "string" ? p.body.trim() : "";
    if (!body) return { kind: "fail", error: "comment body required" };
    if (body.length > AGENT_LIMITS.commentMax) return { kind: "fail", error: `comment max ${AGENT_LIMITS.commentMax} characters` };
    return { kind: "insert_comment", id, card_id: card.id, body };
  }

  if (row.op === "link_keys") {
    const add = p.add;
    if (!Array.isArray(add) || add.length === 0) return { kind: "fail", error: "payload.add must be a non-empty list of keys" };
    const v = validateCard({ jira_keys: [...(card.jira_keys ?? []), ...add] }, "patch");
    if (!v.ok) return { kind: "fail", error: `Invalid ${v.field}: ${v.error}` };
    if (same(v.value.jira_keys, card.jira_keys ?? [])) return { kind: "noop", id: card.id, why: "keys already linked" };
    return { kind: "update_card", id: card.id, fields: { jira_keys: v.value.jira_keys } };
  }

  // edit_card
  const set = p.set;
  const expect = (p.expect ?? {}) as Record<string, unknown>;
  if (!set || typeof set !== "object" || Array.isArray(set)) return { kind: "fail", error: "payload.set must be an object" };
  const v = validateCard(set, "patch");
  if (!v.ok) return { kind: "fail", error: `Invalid ${v.field}: ${v.error}` };
  const live = card as unknown as Record<string, unknown>;
  const changes = Object.entries(v.value).filter(([k, val]) => !same(live[k], val));
  if (changes.length === 0) return { kind: "noop", id: card.id, why: "already applied" };
  const drifted = Object.entries(expect).filter(([k, val]) => !same(live[k], val)).map(([k]) => k);
  if (drifted.length) return { kind: "fail", error: `changed by someone since proposed: ${drifted.join(", ")}` };
  return { kind: "update_card", id: card.id, fields: Object.fromEntries(changes) as CardFields };
}

export function agentActor(name: string): string {
  return `agent:${name}`;
}

export function isAgentActor(v: unknown): boolean {
  return typeof v === "string" && v.startsWith("agent:");
}
