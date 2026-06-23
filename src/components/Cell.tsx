"use client";

import { useEffect, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card } from "@/lib/types";
import CardItem from "./CardItem";

export default function Cell({
  cellId,
  cardIds,
  cardsById,
  rowBg,
  colW,
  edgeClass = "",
  reserveTop = 0,
  onOverflow,
  editingId,
  drafts,
  onAdd,
  onStartEdit,
  onSave,
  onCancel,
  onDraft,
  onDelete,
  onCycleStatus,
  onCycleValue,
  onResize,
}: {
  cellId: string;
  cardIds: string[];
  cardsById: Record<string, Card>;
  rowBg: string;
  colW: number;
  edgeClass?: string;
  // Top padding to reserve because the left-neighbor cell has a wide card
  // overflowing into this column. Pushes this cell's cards clear of it.
  reserveTop?: number;
  // Reports this cell's own wide-card overflow (bottom edge px) up to the board,
  // which feeds it to the cell on the right as its reserveTop.
  onOverflow: (cellId: string, bottomPx: number) => void;
  editingId: string | null;
  drafts: Record<string, { title: string; body: string }>;
  onAdd: (cellId: string) => void;
  onStartEdit: (id: string) => void;
  onSave: (id: string, patch: Partial<Card>) => void;
  onCancel: (id: string) => void;
  onDraft: (id: string, patch: { title: string; body: string }) => void;
  onDelete: (id: string) => void;
  onCycleStatus: (id: string) => void;
  onCycleValue: (id: string) => void;
  onResize: (id: string, span: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId });
  const elRef = useRef<HTMLDivElement | null>(null);
  const setRefs = (node: HTMLDivElement | null) => {
    elRef.current = node;
    setNodeRef(node);
  };

  // Measure wide cards that overflow into the next column and report their
  // lowest bottom edge. Re-runs on size changes (ResizeObserver) and on card
  // add/remove or live span flips (MutationObserver on data-wide), so the right
  // neighbor realigns immediately while a card is being resized.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        let maxBottom = 0;
        el.querySelectorAll<HTMLElement>('[data-wide="1"]').forEach((w) => {
          const bottom = w.offsetTop + w.offsetHeight;
          if (bottom > maxBottom) maxBottom = bottom;
        });
        onOverflow(cellId, maxBottom);
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(measure);
    mo.observe(el, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-wide", "style"],
    });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [cellId, onOverflow, cardIds.join("|")]);

  return (
    <div
      ref={setRefs}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) onAdd(cellId);
      }}
      style={reserveTop ? { paddingTop: reserveTop } : undefined}
      className={`group/cell relative flex min-h-[96px] flex-col gap-1.5 border-b border-r border-slate-200 p-1.5 transition-[padding] duration-200 ease-out ${rowBg} ${edgeClass} ${
        isOver ? "ring-2 ring-inset ring-slate-400" : ""
      }`}
    >
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        {cardIds.map((id) => {
          const card = cardsById[id];
          if (!card) return null;
          return (
            <CardItem
              key={id}
              card={card}
              editing={editingId === id}
              colW={colW}
              draft={drafts[id] ?? null}
              onStartEdit={onStartEdit}
              onSave={onSave}
              onCancel={onCancel}
              onDraft={onDraft}
              onDelete={onDelete}
              onCycleStatus={onCycleStatus}
              onCycleValue={onCycleValue}
              onResize={onResize}
            />
          );
        })}
      </SortableContext>
      <button
        onClick={() => onAdd(cellId)}
        className="mt-auto self-start rounded px-1.5 py-0.5 text-[11px] text-slate-400 opacity-0 transition hover:bg-black/5 hover:text-slate-600 group-hover/cell:opacity-100"
      >
        + add
      </button>
    </div>
  );
}
