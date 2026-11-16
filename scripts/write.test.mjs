// Tests for the board's write wrapper (src/lib/write.ts): every write is
// checked, a lapsed session is recognised, server errors retry a bounded number
// of times. Run with: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { sendWrite, isSignedOut } from "../src/lib/write.ts";

const res = (status, body = {}, { type = "application/json", redirected = false } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  redirected,
  headers: { get: (n) => (n.toLowerCase() === "content-type" ? type : null) },
  json: async () => {
    if (type !== "application/json") throw new SyntaxError("Unexpected token <");
    return body;
  },
});

const noSleep = { sleep: async () => {} };
const seq = (...rs) => {
  let i = 0;
  const calls = { n: 0 };
  const send = async () => {
    calls.n++;
    const r = rs[Math.min(i++, rs.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  return { send, calls };
};

test("2xx JSON → ok, body passed through", async () => {
  const { send, calls } = seq(res(200, { card: { id: "a" } }));
  const o = await sendWrite(send, noSleep);
  assert.equal(o.kind, "ok");
  assert.deepEqual(o.body, { card: { id: "a" } });
  assert.equal(calls.n, 1);
});

test("401 → signed-out, no retry", async () => {
  const { send, calls } = seq(res(401, { error: "Signed out" }));
  assert.equal((await sendWrite(send, noSleep)).kind, "signed-out");
  assert.equal(calls.n, 1);
});

test("redirect followed to the login page (HTML 200) → signed-out", async () => {
  const { send } = seq(res(200, null, { type: "text/html", redirected: true }));
  assert.equal((await sendWrite(send, noSleep)).kind, "signed-out");
  const { send: send2 } = seq(res(200, null, { type: "text/html" }));
  assert.equal((await sendWrite(send2, noSleep)).kind, "signed-out");
});

test("5xx retries then succeeds", async () => {
  const slept = [];
  const { send, calls } = seq(res(500, { error: "db" }), res(200, { ok: true }));
  const o = await sendWrite(send, { sleep: async (ms) => slept.push(ms) });
  assert.equal(o.kind, "ok");
  assert.equal(calls.n, 2);
  assert.deepEqual(slept, [300]);
});

test("5xx every time → failed after bounded retries, carries server error", async () => {
  const { send, calls } = seq(res(500, { error: "2 of 3 cards not saved" }));
  const o = await sendWrite(send, noSleep);
  assert.equal(o.kind, "failed");
  assert.equal(o.error, "2 of 3 cards not saved");
  assert.equal(calls.n, 3); // 1 + 2 retries
});

test("network error retries", async () => {
  const { send, calls } = seq(new TypeError("Failed to fetch"), res(200, {}));
  assert.equal((await sendWrite(send, noSleep)).kind, "ok");
  assert.equal(calls.n, 2);
  const { send: s2, calls: c2 } = seq(new TypeError("Failed to fetch"));
  const o = await sendWrite(s2, noSleep);
  assert.equal(o.kind, "failed");
  assert.equal(o.status, 0);
  assert.equal(c2.n, 3);
});

test("400/403/404 fail at once (no retry)", async () => {
  for (const status of [400, 403, 404]) {
    const { send, calls } = seq(res(status, { error: "nope" }));
    const o = await sendWrite(send, noSleep);
    assert.equal(o.kind, "failed");
    assert.equal(o.status, status);
    assert.equal(calls.n, 1);
  }
});

test("429 is retried", async () => {
  const { send, calls } = seq(res(429), res(200, {}));
  assert.equal((await sendWrite(send, noSleep)).kind, "ok");
  assert.equal(calls.n, 2);
});

test("isSignedOut for reads", () => {
  assert.equal(isSignedOut({ status: 401 }), true);
  assert.equal(isSignedOut({ status: 200, redirected: true }), true);
  assert.equal(isSignedOut({ status: 200 }), false);
  assert.equal(isSignedOut({ status: 500 }), false);
});
