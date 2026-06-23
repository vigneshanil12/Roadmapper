"use client";

import { useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { TRAY_ID, type Card } from "@/lib/types";
import CardItem from "./CardItem";

// Staging "parking lot" above the grid. Cards are created here neutral-gray and
// adopt a category color once dragged into a month cell. Collapsed by default;
// stays a drop target even while collapsed and auto-expands when a card is
// dragged over it.
export default function Tray({
  cardIds,
  cardsById,
  open,
  dragging,
  onToggle,
  onExpand,
  editingId,
  onAdd,
  onStartEdit,
  onSave,
  onCancel,
  onDelete,
  onCycleStatus,
}: {
  cardIds: string[];
  cardsById: Record<string, Card>;
  open: boolean;
  dragging: boolean;
  onToggle: () => void;
  onExpand: () => void;
  editingId: string | null;
  onAdd: (cellId: string) => void;
  onStartEdit: (id: string) => void;
  onSave: (id: string, patch: Partial<Card>) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onCycleStatus: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY_ID });

  // Auto-expand when something is dragged over the collapsed tray.
  useEffect(() => {
    if (isOver && !open) onExpand();
  }, [isOver, open, onExpand]);

  return (
    <div
      ref={setNodeRef}
      className={`shrink-0 border-b border-slate-200 bg-slate-50 ${
        isOver ? "ring-2 ring-inset ring-slate-400" : ""
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-1.5">
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <span className="inline-block w-3 text-[10px]">{open ? "▾" : "▸"}</span>
          Parking lot
        </button>
        <span className="rounded-full bg-slate-200 px-1.5 text-[11px] text-slate-600">
          {cardIds.length}
        </span>
        <button
          onClick={() => onAdd(TRAY_ID)}
          className="rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-black/5 hover:text-slate-700"
        >
          + add
        </button>
        <span className="ml-auto text-[11px] text-slate-400">
          Staging — drag a card here to park it, or into a month
        </span>
      </div>
      {open ? (
        <div className="flex min-h-[88px] items-start gap-2 overflow-x-auto px-4 pb-2 pt-0.5">
          <SortableContext items={cardIds} strategy={horizontalListSortingStrategy}>
            {cardIds.map((id) => {
              const card = cardsById[id];
              if (!card) return null;
              return (
                <div key={id} className="shrink-0">
                  <CardItem
                    card={card}
                    editing={editingId === id}
                    colW={0}
                    onStartEdit={onStartEdit}
                    onSave={onSave}
                    onCancel={onCancel}
                    onDelete={onDelete}
                    onCycleStatus={onCycleStatus}
                    onResize={() => {}}
                  />
                </div>
              );
            })}
          </SortableContext>
          {cardIds.length === 0 && (
            <div className="flex min-h-[80px] items-center text-[11px] italic text-slate-400">
              Empty — add a card here, then drag it into a month.
            </div>
          )}
        </div>
      ) : (
        // Collapsed: thin drop strip so cards can still be parked here.
        dragging && (
          <div className="mx-4 mb-1.5 flex h-6 items-center justify-center rounded border border-dashed border-slate-300 text-[10px] text-slate-400">
            Drop here to park
          </div>
        )
      )}
    </div>
  );
}
