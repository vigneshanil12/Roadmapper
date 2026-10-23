"use client";

import { useEffect, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card } from "@/lib/types";
import { overflowReach } from "@/lib/drag";
import CardItem from "./CardItem";

export default function Cell({
  cellId,
  cardIds,
  cardsById,
  rowBg,
  colW,
  maxSpan = 2,
  edgeClass = "",
  reserveTop = 0,
  onOverflow,
  dragging = false,
  readOnly = false,
  matchIds = null,
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
  commentCounts,
  onOpenComments,
  selected,
  followingIds,
  dropTarget = false,
  onSelect,
}: {
  cellId: string;
  cardIds: string[];
  cardsById: Record<string, Card>;
  rowBg: string;
  colW: number;
  // Columns left from this one to the grid's end — caps a card's resize.
  maxSpan?: number;
  edgeClass?: string;
  // Top padding to reserve because a cell to the left has a wide card
  // overflowing into this column. Pushes this cell's cards clear of it.
  reserveTop?: number;
  // Reports how deep this cell's wide cards reach into each column to its
  // right (see overflowReach) up to the board, which turns it into reserveTop
  // for the cells they cover.
  onOverflow: (cellId: string, reach: number[]) => void;
  // True while any card is being dragged. Measuring is frozen for the duration —
  // see the effect below.
  dragging?: boolean;
  readOnly?: boolean;
  // When non-null, a filter is active: cards not in the set are dimmed.
  matchIds?: Set<string> | null;
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
  commentCounts: Record<string, number>;
  onOpenComments: (id: string, anchor: DOMRect) => void;
  selected: Set<string>;
  // Selected cards riding along with the card being dragged.
  followingIds: Set<string> | null;
  // A card of the group being dragged will land here.
  dropTarget?: boolean;
  onSelect: (id: string, additive: boolean) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId });
  const elRef = useRef<HTMLDivElement | null>(null);
  const setRefs = (node: HTMLDivElement | null) => {
    elRef.current = node;
    setNodeRef(node);
  };

  // Measure wide cards that overflow into the columns to the right and report
  // their lowest bottom edge per covered column. Re-runs on size changes (ResizeObserver) and on card
  // add/remove or live span flips (MutationObserver on data-wide), so the right
  // neighbor realigns immediately while a card is being resized.
  //
  // Frozen while a drag is in flight. dnd-kit rewrites inline transform styles
  // on every pointer move and tracks the dragged node's rect (and its parent
  // cell's rect) with its own observers; measuring here during a drag closed the
  // loop — mutation -> onOverflow -> board state -> reserveTop/padding change ->
  // mutation -> dnd-kit re-measures -> ... React aborted it with error #185
  // ("Maximum update depth exceeded") mid-drag. Layout can't change under a
  // drag anyway; the effect re-runs and re-measures once `dragging` flips back.
  useEffect(() => {
    const el = elRef.current;
    if (!el || dragging) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const wide: Array<{ bottom: number; span: number }> = [];
        el.querySelectorAll<HTMLElement>("[data-wide]").forEach((w) => {
          // Round: offsetTop/offsetHeight are integers today, but a fractional
          // value would never equal the stored one, so every measure would push
          // a new value and re-render the board forever.
          wide.push({
            bottom: Math.round(w.offsetTop + w.offsetHeight),
            span: Number(w.dataset.wide) || 1,
          });
        });
        onOverflow(cellId, overflowReach(wide));
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(measure);
    // data-wide only: `style` fires on every dnd-kit transform write, and a
    // span resize changes data-wide anyway (CardItem sets it to the live span).
    mo.observe(el, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-wide"],
    });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [cellId, onOverflow, dragging, cardIds.join("|")]);

  return (
    <div
      ref={setRefs}
      onDoubleClick={(e) => {
        if (!readOnly && e.target === e.currentTarget) onAdd(cellId);
      }}
      style={reserveTop ? { paddingTop: reserveTop } : undefined}
      className={`group/cell relative flex min-h-[96px] flex-col gap-1.5 border-b border-r border-slate-200 p-1.5 transition-[padding] duration-200 ease-out ${rowBg} ${edgeClass} ${
        dropTarget
          ? "bg-sky-500/10 ring-2 ring-inset ring-sky-500"
          : isOver
          ? "ring-2 ring-inset ring-slate-400"
          : ""
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
              maxSpan={maxSpan}
              readOnly={readOnly}
              dim={!!matchIds && !matchIds.has(id)}
              draft={drafts[id] ?? null}
              onStartEdit={onStartEdit}
              onSave={onSave}
              onCancel={onCancel}
              onDraft={onDraft}
              onDelete={onDelete}
              onCycleStatus={onCycleStatus}
              onCycleValue={onCycleValue}
              onResize={onResize}
              commentCount={commentCounts[id] ?? 0}
              onOpenComments={onOpenComments}
              selected={selected.has(id)}
              following={!!followingIds?.has(id)}
              onSelect={onSelect}
            />
          );
        })}
      </SortableContext>
      {!readOnly && (
        <button
          onClick={() => onAdd(cellId)}
          className="mt-auto self-start rounded px-1.5 py-0.5 text-[11px] text-slate-400 opacity-0 transition hover:bg-black/5 hover:text-slate-600 group-hover/cell:opacity-100"
        >
          + add
        </button>
      )}
    </div>
  );
}
