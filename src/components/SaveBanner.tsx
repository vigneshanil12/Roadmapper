"use client";

// Persistent strip under the header when a write didn't land. Two kinds:
//   signed-out  the session lapsed; nothing saves until the user logs in again
//   failed      a write failed after retries; names the action, offers Retry
export type SaveProblem =
  | { kind: "signed-out" }
  | { kind: "failed"; label: string; error: string; retry: () => void };

export default function SaveBanner({
  problem,
  onDismiss,
}: {
  problem: SaveProblem | null;
  onDismiss: () => void;
}) {
  if (!problem) return null;
  const signedOut = problem.kind === "signed-out";
  return (
    <div
      role="alert"
      className={`fixed left-1/2 top-3 z-[60] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-lg px-4 py-2 text-sm shadow-lg ${
        signedOut ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300" : "bg-rose-100 text-rose-900 ring-1 ring-rose-300"
      }`}
    >
      {signedOut ? (
        <>
          <span>Signed out — your last change wasn&apos;t saved.</span>
          <a href="/login" className="font-semibold underline">
            Log in again
          </a>
        </>
      ) : (
        <>
          <span title={problem.error}>Not saved: {problem.label}.</span>
          <button className="font-semibold underline" onClick={problem.retry}>
            Retry
          </button>
          <button aria-label="Dismiss" className="opacity-60 hover:opacity-100" onClick={onDismiss}>
            ✕
          </button>
        </>
      )}
    </div>
  );
}
