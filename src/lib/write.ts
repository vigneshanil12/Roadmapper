// One wrapper for every card/comment write the board sends, so no write can
// fail silently. Import-free (fetch + sleep are injected) so `npm test` can
// load it directly.
//
//   ok          the server confirmed the write (2xx JSON)
//   signed-out  401, or a redirect / HTML answer (an old proxy, an expired
//               session): the change did NOT land and retrying won't help
//   failed      anything else after a short bounded retry (5xx / network);
//               other 4xx fail at once (retrying a rejected payload is pointless)

export type WriteOutcome =
  | { kind: "ok"; status: number; body: unknown }
  | { kind: "signed-out"; status: number }
  | { kind: "failed"; status: number; error: string };

export type WriteOptions = {
  // Delays before each retry; length = number of retries.
  backoff?: number[];
  sleep?: (ms: number) => Promise<unknown>;
};

export const DEFAULT_BACKOFF = [300, 1000];

const realSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ResponseLike = {
  ok: boolean;
  status: number;
  redirected?: boolean;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
};

function isJson(r: ResponseLike): boolean {
  return (r.headers.get("content-type") ?? "").includes("application/json");
}

export async function sendWrite(
  send: () => Promise<ResponseLike>,
  opts: WriteOptions = {}
): Promise<WriteOutcome> {
  const backoff = opts.backoff ?? DEFAULT_BACKOFF;
  const sleep = opts.sleep ?? realSleep;
  let last: WriteOutcome = { kind: "failed", status: 0, error: "not sent" };
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    if (attempt > 0) await sleep(backoff[attempt - 1]);
    let r: ResponseLike;
    try {
      r = await send();
    } catch (e) {
      last = { kind: "failed", status: 0, error: e instanceof Error ? e.message : String(e) };
      continue; // network error: retry
    }
    if (r.status === 401 || r.redirected || (r.ok && !isJson(r))) {
      return { kind: "signed-out", status: r.status };
    }
    const body = await r.json().catch(() => null);
    if (r.ok) return { kind: "ok", status: r.status, body };
    const msg = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
    const error = msg ? String(msg) : `HTTP ${r.status}`;
    last = { kind: "failed", status: r.status, error };
    // Only server-side trouble is worth retrying.
    if (r.status < 500 && r.status !== 408 && r.status !== 429) return last;
  }
  return last;
}

// A read that came back signed out (401, or a redirect to the login page).
export function isSignedOut(r: { status: number; redirected?: boolean }): boolean {
  return r.status === 401 || !!r.redirected;
}
