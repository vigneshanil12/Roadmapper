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
  onStartEdit,
  onSave,
  onDelete,
  onCycleStatus,
  onResize,
  overlay = false,
}: {
  card: Card;
  editing: boolean;
  colW: number;
  onStartEdit: (id: string) => void;
  onSave: (id: string, patch: Partial<Card>) => void;
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
        <CardEditor card={card} onSave={onSave} onDelete={onDelete} />
      </div>
    );
  }

  const bullets = card.body
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
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          {card.title && (
            <div
              className={`font-semibold ${done ? "line-through" : ""}`}
            >
              {card.title}
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
          {!card.title && bullets.length === 0 && (
            <span className="italic text-slate-500">Empty — double-click</span>
          )}
        </div>
        {!overlay && (
          <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition group-hover:opacity-100">
            <IconBtn title="Edit" onClick={() => onStartEdit(card.id)}>
              ✎
            </IconBtn>
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

function CardEditor({
  card,
  onSave,
  onDelete,
}: {
  card: Card;
  onSave: (id: string, patch: Partial<Card>) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [body, setBody] = useState(card.body);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function save() {
    const t = title.trim();
    const b = body.trim();
    if (!t && !b) {
      onDelete(card.id); // discard empty
      return;
    }
    onSave(card.id, { title: t, body: b });
  }

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="space-y-1"
    >
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") save();
        }}
        placeholder="Title (bold)"
        className="w-full rounded border border-black/20 bg-white/80 px-1.5 py-1 text-[12px] font-semibold outline-none"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") save();
        }}
        rows={3}
        placeholder="Bullets — one per line"
        className="w-full resize-none rounded border border-black/20 bg-white/80 px-1.5 py-1 text-[12px] outline-none"
      />
      <div className="flex justify-between">
        <button
          onClick={() => onDelete(card.id)}
          className="rounded px-1.5 py-0.5 text-[11px] text-red-700 hover:bg-red-500/10"
        >
          Delete
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
