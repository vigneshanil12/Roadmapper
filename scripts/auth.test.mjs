// Tests for in-route auth (src/lib/auth.ts requireRole) and a source scan that
// fails if any API route handler skips it. Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { requireRole, roleForToken } from "../src/lib/auth.ts";

process.env.APP_SESSION_SECRET = "editor-secret";
process.env.APP_GUEST_SESSION_SECRET = "guest-secret";

const req = (token) => ({
  cookies: { get: (n) => (n === "rm_auth" && token !== undefined ? { value: token } : undefined) },
});

test("no cookie → 401 for any and editor", async () => {
  for (const need of ["any", "editor"]) {
    const r = requireRole(req(undefined), need);
    assert.ok(r instanceof Response);
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { error: "Signed out" });
  }
});

test("wrong token → 401", () => {
  const r = requireRole(req("nope"), "any");
  assert.ok(r instanceof Response);
  assert.equal(r.status, 401);
});

test("guest: allowed for any, 403 for editor", () => {
  assert.deepEqual(requireRole(req("guest-secret"), "any"), { role: "guest" });
  const r = requireRole(req("guest-secret"), "editor");
  assert.ok(r instanceof Response);
  assert.equal(r.status, 403);
});

test("editor: allowed for both", () => {
  assert.deepEqual(requireRole(req("editor-secret"), "any"), { role: "editor" });
  assert.deepEqual(requireRole(req("editor-secret"), "editor"), { role: "editor" });
});

test("fails closed when secrets are unset", () => {
  const saved = { ...process.env };
  delete process.env.APP_SESSION_SECRET;
  delete process.env.APP_GUEST_SESSION_SECRET;
  try {
    assert.equal(roleForToken(""), null);
    assert.equal(roleForToken("undefined"), null);
    const r = requireRole(req("anything"), "any");
    assert.ok(r instanceof Response);
    assert.equal(r.status, 401);
  } finally {
    process.env.APP_SESSION_SECRET = saved.APP_SESSION_SECRET;
    process.env.APP_GUEST_SESSION_SECRET = saved.APP_GUEST_SESSION_SECRET;
  }
});

// ---- route scan ----
// Routes that legitimately run without a session: login/logout set and clear
// it, health is the keepalive ping, export and agent/apply check their own
// bearer tokens (EXPORT_TOKEN, AGENT_APPLY_TOKEN; agent.test.mjs checks that).
const EXEMPT = new Set(["login", "logout", "health", "export", "agent"]);
const API = new URL("../src/app/api/", import.meta.url).pathname;

function routeFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

const METHOD = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g;

test("every exported API handler calls requireRole first", () => {
  const files = routeFiles(API);
  assert.ok(files.length >= 10, "route scan found too few files");
  const missing = [];
  let checked = 0;
  for (const f of files) {
    const rel = relative(API, f);
    if (EXEMPT.has(rel.split("/")[0])) continue;
    const src = readFileSync(f, "utf8");
    // Non-async or re-exported handlers would dodge the scan; forbid them.
    assert.doesNotMatch(src, /export\s+(const|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/, `${rel}: use "export async function"`);
    assert.doesNotMatch(src, /export\s*\{[^}]*\b(GET|POST|PUT|PATCH|DELETE)\b/, `${rel}: re-exported handler`);
    const starts = [...src.matchAll(METHOD)];
    for (let i = 0; i < starts.length; i++) {
      const body = src.slice(starts[i].index, starts[i + 1]?.index ?? src.length);
      // The guard must come before any other statement in the handler: the
      // first statement after the opening brace.
      const afterBrace = body.slice(body.indexOf("{", body.indexOf(")")) + 1).trimStart();
      checked++;
      if (!/^const auth = requireRole\(req, "(any|editor)"\);\s*if \(auth instanceof Response\) return auth;/.test(afterBrace))
        missing.push(`${rel} ${starts[i][1]}`);
    }
  }
  assert.ok(checked >= 15, `only ${checked} handlers checked`);
  assert.deepEqual(missing, [], `handlers without requireRole: ${missing.join(", ")}`);
});
