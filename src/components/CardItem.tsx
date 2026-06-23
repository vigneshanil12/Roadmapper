"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card, CardStatus } from "@/lib/types";
import { CATEGORY_MAP } from "@/lib/categories";

const STATUS_CYCLE: CardStatus[] = ["normal", "tentative", "done"];
const STATUS_LABEL: Record<CardStatus, string> = {
  normal: "•",
  tentative: "dashed",
  done: "done",
};

export default function CardItem({
  card,
  editing,
  colW,
  draft = null,
  onStartEdit,
  onSave,
  onCancel,
  onDraft,
  onDelete,
  onCycleStatus,
  onResize,
  overlay = false,
}: {
  card: Card;
  editing: boolean;
  colW: number;
  draft?: { title: string; body: string } | null;
  onStartEdit: (id: string) => void;
  onSave: (id: string, patch: Partial<Card>) => void;
  onCancel: (id: string) => void;
  onDraft?: (id: string, patch: { title: string; body: string }) => void;
  onDelete: (id: string) => void;
  onCycleStatus: (id: string) => void;
  onResize: (id: string, span: number) => void;
  overlay?: boolean;
}) {
  const cat = CATEGORY_MAP[card.category];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: editing || overlay });

  // Live span while dragging the resize handle; falls back to persisted span.
  const [resizeSpan, setResizeSpan] = useState<number | null>(null);
  const span = resizeSpan ?? card.span ?? 1;
  // Card sits in a cell padded 6px each side; width = colW*span minus that pad.
  // Tray cards use a fixed width (no half-month grid to size against).
  const widthPx = card.tray ? 208 : colW * span - 12;

  const style = overlay
    ? { width: widthPx }
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        width: widthPx,
        zIndex: span > 1 ? 5 : undefined,
      };

  function startResize(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startSpan = card.span ?? 1;
    function move(ev: PointerEvent) {
      const raw = startSpan + Math.round((ev.clientX - startX) / colW);
      setResizeSpan(Math.min(2, Math.max(1, raw)));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizeSpan((cur) => {
        const final = cur ?? startSpan;
        if (final !== startSpan) onResize(card.id, final);
        return null;
      });
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Parked cards are neutral gray; they take on the category color once dropped
  // into a month row.
  const fill = card.tray ? "bg-white" : cat.cardBg;
  const borderColor = card.tray ? "border-slate-300" : cat.cardBorder;
  const base = `relative rounded-lg border px-2.5 py-2 text-[12px] leading-snug shadow-sm ${fill} ${
    card.status === "tentative"
      ? `border-dashed border-2 ${borderColor}`
      : `border ${borderColor}`
  }`;

  if (editing) {
    return (
      <div ref={setNodeRef} style={style} className={base}>
        <CardEditor
          card={card}
          draft={draft}
          done={card.status === "done"}
          onSave={onSave}
          onCancel={onCancel}
          onDraft={onDraft}
        />
      </div>
    );
  }

  // A draft (unsaved edit, stashed when the user clicked away) shadows the
  // saved title/body until they reopen the card and Save or discard it.
  const shownTitle = draft ? draft.title : card.title;
  const shownBody = draft ? draft.body : card.body;
  const bullets = shownBody
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const done = card.status === "done";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={() => onStartEdit(card.id)}
      className={`${base} group cursor-grab active:cursor-grabbing ${
        done ? "opacity-70" : ""
      }`}
    >
      {draft && (
        <span
          title="Unsaved draft — double-click to keep editing, then Save"
          className="absolute -left-1 -top-1 z-10 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white"
        />
      )}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          {shownTitle && (
            <div
              className={`font-semibold ${done ? "line-through" : ""}`}
            >
              {shownTitle}
            </div>
          )}
          {bullets.length > 0 && (
            <ul className={`mt-0.5 ${done ? "line-through" : ""}`}>
              {bullets.map((b, i) => (
                <li key={i} className="flex gap-1">
                  <span>•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {!shownTitle && bullets.length === 0 && (
            <span className="italic text-slate-500">Empty — double-click</span>
          )}
        </div>
        {!overlay && (
          <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition group-hover:opacity-100">
            <IconBtn
              title={`Status: ${STATUS_LABEL[card.status]} (click to cycle)`}
              onClick={() => onCycleStatus(card.id)}
            >
              {card.status === "done" ? "✓" : card.status === "tentative" ? "▢" : "○"}
            </IconBtn>
            <IconBtn title="Delete" onClick={() => onDelete(card.id)}>
              ✕
            </IconBtn>
          </div>
        )}
      </div>
      {!overlay && !card.tray && (
        <div
          title="Drag to resize (half ↔ full month)"
          onPointerDown={startResize}
          onDoubleClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-0 z-10 h-full w-2 cursor-ew-resize rounded-r-lg opacity-0 transition hover:bg-black/10 group-hover:opacity-100"
        >
          <div className="absolute right-0.5 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded bg-black/25" />
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex h-4 w-4 items-center justify-center rounded text-[10px] text-slate-600 hover:bg-black/10"
    >
      {children}
    </button>
  );
}

// Body editing keeps a literal "• " in front of every line so bullets stay
// visible while typing. We strip them again before persisting.
function withBullets(raw: string): string {
  const lines = raw.split("\n").map((l) => l.replace(/^•\s?/, ""));
  return (lines.length ? lines : [""]).map((l) => `• ${l}`).join("\n");
}
function stripBullets(text: string): string {
  return text
    .split("\n")
    .map((l) => l.replace(/^•\s?/, "").trim())
    .filter(Boolean)
    .join("\n");
}

function CardEditor({
  card,
  draft,
  done,
  onSave,
  onCancel,
  onDraft,
}: {
  card: Card;
  draft: { title: string; body: string } | null;
  done: boolean;
  onSave: (id: string, patch: Partial<Card>) => void;
  onCancel: (id: string) => void;
  onDraft?: (id: string, patch: { title: string; body: string }) => void;
}) {
  const initTitle = draft ? draft.title : card.title;
  const initBody = draft ? draft.body : card.body;
  const [title, setTitle] = useState(initTitle);
  const [body, setBody] = useState(withBullets(initBody));
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Latest values for the outside-click handler, which runs once on mount.
  const valsRef = useRef({ title, body });
  valsRef.current = { title, body };

  // Grow textareas to fit content so editing sits exactly where the text shows.
  function autosize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    const el = titleRef.current;
    if (el) {
      autosize(el);
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    autosize(bodyRef.current);
  }, []);

  // Clicking anywhere outside the card stashes the in-progress text as a draft
  // and exits edit mode (instead of losing it). Save/Cancel handle commit/discard.
  useEffect(() => {
    if (!onDraft) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      const { title, body } = valsRef.current;
      onDraft!(card.id, { title: title.trim(), body: stripBullets(body) });
    }
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [card.id, onDraft]);

  function save() {
    onSave(card.id, { title: title.trim(), body: stripBullets(body) });
  }

  return (
    <div
      ref={rootRef}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Title — borderless, rendered exactly like the card title. */}
      <textarea
        ref={titleRef}
        value={title}
        rows={1}
        onChange={(e) => {
          setTitle(e.target.value);
          autosize(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            bodyRef.current?.focus();
          }
          if (e.key === "Escape") onCancel(card.id);
        }}
        placeholder="Title"
        className={`w-full resize-none overflow-hidden bg-transparent text-[12px] font-semibold leading-snug outline-none placeholder:font-normal placeholder:italic placeholder:text-slate-400 ${
          done ? "line-through" : ""
        }`}
      />
      {/* Body — one bullet per line; "• " prefixes are kept live and stripped on save. */}
      <textarea
        ref={bodyRef}
        value={body}
        rows={1}
        onChange={(e) => {
          setBody(e.target.value);
          autosize(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Start the next line already bulleted.
            e.preventDefault();
            const el = e.currentTarget;
            const pos = el.selectionStart;
            const next = body.slice(0, pos) + "\n• " + body.slice(el.selectionEnd);
            setBody(next);
            requestAnimationFrame(() => {
              el.selectionStart = el.selectionEnd = pos + 3;
              autosize(el);
            });
          }
          if (e.key === "Escape") onCancel(card.id);
        }}
        placeholder="• One bullet per line"
        className={`mt-0.5 w-full resize-none overflow-hidden bg-transparent text-[12px] leading-snug outline-none placeholder:italic placeholder:text-slate-400 ${
          done ? "line-through" : ""
        }`}
      />
      <div className="mt-1 flex justify-end gap-1">
        <button
          onClick={() => onCancel(card.id)}
          className="rounded px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-black/10"
        >
          Cancel
        </button>
        <button
          onClick={save}
          className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white"
        >
          Save
        </button>
      </div>
    </div>
  );
}
