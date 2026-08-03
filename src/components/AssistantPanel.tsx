"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Msg = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "Does next month look overloaded?",
  "What should we prioritise right now?",
  "Where are the quality risks?",
  "What's missing from the roadmap?",
  "Give me a candid product outlook.",
];

// Inline markdown: **bold** and `code`. The model is told to stick to this
// subset, so a tiny splitter beats a markdown dependency.
function renderInline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="rounded bg-slate-200/70 px-1 text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

// Render an assistant answer: bullets, numbered lists, headings-as-bold,
// paragraphs. Raw markdown asterisks otherwise show verbatim in the bubble.
function AssistantText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        if (bullet) {
          return (
            <div key={i} className="flex gap-1.5 pl-1">
              <span className="select-none text-slate-400">•</span>
              <span>{renderInline(bullet[1])}</span>
            </div>
          );
        }
        const num = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (num) {
          return (
            <div key={i} className="flex gap-1.5 pl-1">
              <span className="select-none text-slate-400">{num[1]}.</span>
              <span>{renderInline(num[2])}</span>
            </div>
          );
        }
        const heading = line.match(/^\s*#{1,4}\s+(.*)$/);
        if (heading) {
          return (
            <div key={i} className="font-semibold">
              {renderInline(heading[1])}
            </div>
          );
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <div key={i}>{renderInline(line)}</div>;
      })}
    </div>
  );
}

// Right-docked planning assistant. Read-only: it answers questions about the
// roadmap, it never edits it. Editors can also set the shared "product context"
// that seeds every answer.
export default function AssistantPanel({
  open,
  onClose,
  isEditor,
}: {
  open: boolean;
  onClose: () => void;
  isEditor: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [showCtx, setShowCtx] = useState(false);
  const [ctx, setCtx] = useState("");
  const [ctxLoaded, setCtxLoaded] = useState(false);
  const [ctxSaving, setCtxSaving] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the shared product context the first time the panel opens.
  useEffect(() => {
    if (!open || ctxLoaded) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setCtx(d.product_context ?? ""))
      .catch(() => {})
      .finally(() => setCtxLoaded(true));
  }, [open, ctxLoaded]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function send(thread: Msg[]) {
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: thread }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Request failed");
      setMessages((m) => [...m, { role: "assistant", text: d.answer }]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", text: q }];
    setMessages(next);
    setInput("");
    void send(next);
  }

  // Re-send the thread after a failure; the user's question is already in it.
  function retry() {
    if (busy || !messages.length || messages[messages.length - 1].role !== "user") return;
    void send(messages);
  }

  async function saveCtx() {
    setCtxSaving(true);
    try {
      const r = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_context: ctx }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Save failed");
      }
      setShowCtx(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCtxSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 z-40 flex h-full w-full max-w-[400px] flex-col border-l border-slate-200 bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">✨</span>
          <span className="text-sm font-semibold text-slate-800">PM & QA assistant</span>
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          {messages.length > 0 && (
            <button
              title="Clear conversation"
              onClick={() => {
                setMessages([]);
                setErr(null);
              }}
              className="rounded px-2 py-1 text-xs hover:bg-slate-100"
            >
              Clear
            </button>
          )}
          {isEditor && (
            <button
              title="Edit product context"
              onClick={() => setShowCtx((s) => !s)}
              className={`rounded px-2 py-1 text-xs hover:bg-slate-100 ${
                showCtx ? "bg-slate-100 text-slate-800" : ""
              }`}
            >
              Product context
            </button>
          )}
          <button
            title="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-base hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Product context editor (editors only) */}
      {isEditor && showCtx && (
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <p className="mb-1.5 text-[11px] leading-snug text-slate-500">
            Shared context that seeds every answer — product mission, target users,
            team size, current goals. The more you add, the sharper the advice.
          </p>
          <textarea
            value={ctx}
            onChange={(e) => setCtx(e.target.value)}
            rows={5}
            placeholder="e.g. We're a B2B payments dashboard for SMB merchants. Team: 3 engineers + 1 designer. This quarter we're focused on reducing churn and shipping the partner API…"
            className="block w-full resize-none rounded-lg border border-slate-200 bg-white p-2.5 text-[13px] leading-snug outline-none focus:ring-1 focus:ring-slate-300"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setShowCtx(false)}
              className="rounded px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={saveCtx}
              disabled={ctxSaving}
              className="rounded bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {ctxSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-[13px] leading-snug text-slate-500">
              Ask about your roadmap — load, priorities, gaps, quality risks, what
              to add. I read the live board and card comments but can&apos;t change
              anything.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-left text-[13px] text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-slate-800 px-3.5 py-2 text-[13px] leading-snug text-white"
                  : "max-w-[92%] rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2 text-[13px] leading-relaxed text-slate-800"
              }
            >
              {m.role === "user" ? m.text : <AssistantText text={m.text} />}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2 text-[13px] text-slate-400">
              Thinking…
            </div>
          </div>
        )}

        {err && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2">
            <p className="text-[12px] text-red-600">{err}</p>
            {!busy &&
              messages.length > 0 &&
              messages[messages.length - 1].role === "user" && (
                <button
                  onClick={retry}
                  className="shrink-0 rounded border border-red-200 px-2 py-0.5 text-[12px] font-medium text-red-600 hover:bg-red-100"
                >
                  Retry
                </button>
              )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 p-3">
        <div className="relative flex items-center">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder="Ask about the roadmap…"
            className="block max-h-32 min-h-[40px] w-full resize-none rounded-2xl bg-slate-100 py-2.5 pl-3.5 pr-11 text-[13px] leading-tight outline-none placeholder:text-slate-400 focus:bg-slate-50 focus:ring-1 focus:ring-slate-300"
          />
          <button
            title="Send"
            onClick={() => ask(input)}
            disabled={!input.trim() || busy}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-slate-800 text-sm text-white transition disabled:bg-slate-300"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
