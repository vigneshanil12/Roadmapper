"use client";

import { useEffect, useState } from "react";

type DeletedCard = {
  id: string;
  title: string;
  category: string;
  deleted_at: string;
  updated_by: string | null;
};

type DeletedComment = {
  id: string;
  card_id: string;
  author_name: string;
  body: string;
  deleted_at: string;
  updated_by: string | null;
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Editor-only list of cards and comments deleted in the last 30 days, each
// with a Restore button. Restored rows reappear on the board with the next
// poll (~5s), so this panel doesn't touch the board's state.
export default function RecentlyDeleted({ onClose }: { onClose: () => void }) {
  const [cards, setCards] = useState<DeletedCard[] | null>(null);
  const [comments, setComments] = useState<DeletedComment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  function load() {
    fetch("/api/deleted")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setCards(d.cards ?? []);
        setComments(d.comments ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }

  useEffect(load, []);

  async function restore(kind: "cards" | "comments", id: string) {
    setBusy(id);
    setError("");
    const r = await fetch(`/api/${kind}/${id}/restore`, { method: "POST" }).catch(
      () => null
    );
    setBusy(null);
    if (!r || !r.ok) {
      setError("Restore failed. Try again.");
      return;
    }
    load();
  }

  const titleOf = (cardId: string) =>
    cards?.find((c) => c.id === cardId)?.title ?? "a card";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl bg-white p-5 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recently deleted · last 30 days</h2>
          <button
            onClick={onClose}
            className="rounded px-1 text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        <div className="overflow-y-auto text-xs text-slate-600">
          {cards === null ? (
            <p className="text-slate-400">Loading…</p>
          ) : cards.length === 0 && comments.length === 0 ? (
            <p className="text-slate-400">Nothing deleted recently.</p>
          ) : (
            <>
              {cards.length > 0 && (
                <h3 className="mb-1 font-semibold text-slate-700">Cards</h3>
              )}
              <ul className="mb-3 space-y-1.5">
                {cards.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">
                        {c.title || "(untitled)"}
                      </span>
                      <span className="text-slate-400">
                        {when(c.deleted_at)} · {c.updated_by ?? "unknown"}
                      </span>
                    </span>
                    <button
                      onClick={() => restore("cards", c.id)}
                      disabled={busy === c.id}
                      className="shrink-0 rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
              {comments.length > 0 && (
                <h3 className="mb-1 font-semibold text-slate-700">Comments</h3>
              )}
              <ul className="space-y-1.5">
                {comments.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-slate-800">
                        {c.author_name}: {c.body}
                      </span>
                      <span className="text-slate-400">
                        on {titleOf(c.card_id)} · {when(c.deleted_at)} ·{" "}
                        {c.updated_by ?? "unknown"}
                      </span>
                    </span>
                    <button
                      onClick={() => restore("comments", c.id)}
                      disabled={busy === c.id}
                      className="shrink-0 rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
