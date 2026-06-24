"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Comment } from "@/lib/types";
import { initials } from "@/lib/presence";
import { timeAgo } from "@/lib/time";

const W = 320; // popover width
const MAX_H = 380; // popover max height (thread scrolls within)
const GAP = 8; // gap from the anchored card

// Figma-style comment thread. Anchored next to the card it belongs to; the
// thread body scrolls so the window stays compact no matter how long the
// conversation gets. Both editors and view-only guests can post a reply.
export default function CommentPopover({
  comments,
  anchor,
  me,
  canResolve,
  canDelete,
  onPost,
  onDeleteComment,
  onResolve,
  onClose,
}: {
  comments: Comment[];
  anchor: DOMRect;
  me: { name: string; color: string };
  canResolve: boolean;
  canDelete: (c: Comment) => boolean;
  onPost: (body: string) => void;
  onDeleteComment: (id: string) => void;
  onResolve: () => void;
  onClose: () => void;
}) {
  const [reply, setReply] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: anchor.right + GAP,
    top: anchor.top,
  });

  // Place to the card's right if it fits, else to its left; clamp into the
  // viewport so the window is never clipped.
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.right + GAP;
    if (left + W > vw - 8) left = anchor.left - W - GAP;
    left = Math.max(8, Math.min(left, vw - W - 8));
    const top = Math.max(8, Math.min(anchor.top, vh - MAX_H - 8));
    setPos({ left, top });
  }, [anchor]);

  // Close on outside click or Escape.
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Keep the latest comment in view when the thread grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  function send() {
    const body = reply.trim();
    if (!body) return;
    onPost(body);
    setReply("");
  }

  return (
    <div
      ref={rootRef}
      style={{ left: pos.left, top: pos.top, width: W, maxHeight: MAX_H }}
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <span className="text-sm font-semibold text-slate-800">
          Comment{comments.length > 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1 text-slate-500">
          {canResolve && comments.length > 0 && (
            <button
              title="Resolve — clears this thread for everyone"
              onClick={onResolve}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[11px] hover:bg-slate-100"
            >
              ✓
            </button>
          )}
          <button
            title="Close"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-base hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Thread (scrolls) */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {comments.length === 0 && (
          <p className="py-4 text-center text-xs italic text-slate-400">
            No comments yet. Start the thread.
          </p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="group/c flex gap-2.5">
            <Avatar name={c.author_name} color={c.author_color} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-[13px] font-semibold text-slate-800">
                  {c.author_name}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {timeAgo(c.created_at)}
                </span>
                {canDelete(c) && (
                  <button
                    title="Delete comment"
                    onClick={() => onDeleteComment(c.id)}
                    className="ml-auto flex h-5 w-6 shrink-0 items-center justify-center rounded text-[11px] text-slate-300 opacity-0 transition hover:text-red-500 group-hover/c:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-snug text-slate-700">
                {c.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Reply — avatar, field, and send button share the same px-4 gutter and
          are vertically centered against the input. */}
      <div className="flex items-center gap-2.5 border-t border-slate-100 px-4 py-2.5">
        <Avatar name={me.name} color={me.color} />
        <div className="relative flex flex-1 items-center">
          <textarea
            autoFocus
            rows={1}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Reply"
            className="block max-h-24 min-h-[36px] w-full resize-none rounded-2xl bg-slate-100 py-2 pl-3.5 pr-10 text-[13px] leading-tight outline-none placeholder:text-slate-400 focus:bg-slate-50 focus:ring-1 focus:ring-slate-300"
          />
          <button
            title="Send"
            onClick={send}
            disabled={!reply.trim()}
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-slate-700 text-xs text-white transition disabled:bg-slate-300"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <span
      style={{ backgroundColor: color }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
    >
      {initials(name)}
    </span>
  );
}
