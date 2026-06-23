"use client";

import { useEffect, useRef, useState } from "react";
import {
  useSortable,
  defaultAnimateLayoutChanges,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Animate position changes even when they come from a programmatic reorder
// (e.g. a card jumping to the top of its cell on resize), not just drags — so
// the shift slides instead of snapping. wasDragging:true lets the default
// helper treat any index change as animatable.
const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });
import type { Card, CardStatus } from "@/lib/types";
import { CATEGORY_MAP, type Category } from "@/lib/categories";

// Value badge cycles through 0 → 1 → 2 → 3 → 0.
export const VALUE_CYCLE = [0, 1, 2, 3];

// Neutral (slate) shades for parked tray cards, which have no category color.
const TRAY_VALUE_FILL = [
  "bg-slate-300 text-slate-800",
  "bg-slate-500 text-white",
  "bg-slate-700 text-white",
] as const;
const TRAY_VALUE_OUTLINE = "border border-slate-400 text-slate-500";

const STATUS_CYCLE: CardStatus[] = ["normal", "done", "tentative"];
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
  onCycleValue,
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
  onCycleValue: (id: string) => void;
  onResize: (id: string, span: number) => void;
  overlay?: boolean;
}) {
  const cat = CATEGORY_MAP[card.category];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: editing || overlay, animateLayoutChanges });

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

  const isDone = card.status === "done";
  const isTentative = card.status === "tentative";

  // Parked cards are neutral gray; they take on the category color once dropped
  // into a month row. Done cards go white with dark category text; tentative
  // cards use a 50%-opacity fill behind a custom-density dashed border.
  const fill = card.tray
    ? "bg-white"
    : isDone
    ? "bg-white"
    : isTentative
    ? cat.cardBgFaint
    : cat.cardBg;
  // Done cards recolor all text/strikethrough/tick to the row-header dark hex
  // (e.g. amber-800 / #92400e); currentColor carries it to line-through + tick.
  const doneText = isDone ? (card.tray ? "text-slate-800" : cat.labelText) : "";
  // Tentative borders are drawn by an SVG overlay (DashedBorder) that follows
  // the rounded corners; the box itself carries no border. Others get a solid one.
  const borderClass = isTentative
    ? "border-0"
    : `border ${card.tray ? "border-slate-300" : cat.cardBorder}`;
  const base = `relative rounded-lg px-2.5 py-2 text-[12px] leading-snug shadow-sm ${fill} ${borderClass} ${doneText}`;
  const dashHex = card.tray ? "#94a3b8" : cat.cardBorderHex;
  const tickHex = card.tray ? "#1e293b" : cat.labelHex;

  // Wide (span>1) cards overflow into the next column; the neighbor cell reads
  // this flag to reserve top space and avoid overlap. Live span so it reacts
  // mid-resize, before the new span persists.
  const wide = !overlay && !card.tray && span > 1 ? "1" : undefined;

  if (editing) {
    return (
      <div ref={setNodeRef} data-wide={wide} style={style} className={base}>
        {isTentative && <DashedBorder color={dashHex} />}
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
      data-wide={wide}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={() => onStartEdit(card.id)}
      className={`${base} group cursor-grab active:cursor-grabbing`}
    >
      {isTentative && <DashedBorder color={dashHex} />}
      {draft && (
        <span
          title="Unsaved draft — double-click to keep editing, then Save"
          className="absolute -left-1 -top-1 z-10 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white"
        />
      )}
      <div className="flex items-start justify-between gap-1">
        <div className="flex min-w-0 flex-1 items-start gap-1">
          {done && (
            <span
              title="Completed"
              style={{ backgroundColor: tickHex }}
              className="mt-px flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold leading-none text-white"
            >
              ✓
            </span>
          )}
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
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {/* Value badge — always visible, click to cycle 0→1→2→3. */}
          <ValueBadge
            value={card.value ?? 0}
            cat={cat}
            tray={card.tray}
            overlay={overlay}
            onClick={() => onCycleValue(card.id)}
          />
          {!overlay && (
            <div className="flex flex-col items-end gap-0.5 opacity-0 transition group-hover:opacity-100">
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

// Round badge showing a card's value (0-3). 0 = outline only; 1-3 fill with the
// row's category color, lightest → darkest. Click cycles the value.
function ValueBadge({
  value,
  cat,
  tray,
  overlay,
  onClick,
}: {
  value: number;
  cat: Category;
  tray: boolean;
  overlay: boolean;
  onClick: () => void;
}) {
  const v = Math.min(3, Math.max(0, value));
  const fills = tray ? TRAY_VALUE_FILL : cat.valueFill;
  const outline = tray ? TRAY_VALUE_OUTLINE : cat.valueOutline;
  const tone = v === 0 ? outline : fills[v - 1];
  const cls = `flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold leading-none ${tone}`;

  if (overlay) {
    return <span className={cls}>{v}</span>;
  }
  return (
    <button
      title={`Value: ${v}/3 (click to cycle)`}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`${cls} transition hover:brightness-95`}
    >
      {v}
    </button>
  );
}

// Rounded dashed border for tentative cards, drawn as an SVG stroke so the
// dashes follow the card's rounded corners (a CSS/gradient border can't, and a
// plain border-dashed gives no control over dash density). Inset 1px with
// overflow visible so the 2px stroke isn't clipped at the edges.
function DashedBorder({ color }: { color: string }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute"
      style={{ top: 1, left: 1, right: 1, bottom: 1, overflow: "visible" }}
    >
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        rx="7"
        ry="7"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray="8 6"
      />
    </svg>
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
        className={`w-full resize-none overflow-hidden bg-transparent p-0 text-[12px] font-semibold leading-snug outline-none placeholder:font-normal placeholder:italic placeholder:text-slate-400 ${
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
        className={`mt-0.5 w-full resize-none overflow-hidden bg-transparent p-0 text-[12px] leading-snug outline-none placeholder:italic placeholder:text-slate-400 ${
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
