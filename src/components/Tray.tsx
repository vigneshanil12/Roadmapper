"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { TRAY_ID, type Card } from "@/lib/types";
import CardItem from "./CardItem";

// Staging "parking lot" above the grid. Cards are created here neutral-gray and
// adopt a category color once dragged into a month cell. Collapsible to reclaim
// vertical space.
export default function Tray({
  cardIds,
  cardsById,
  open,
  onToggle,
  editingId,
  onAdd,
  onStartEdit,
  onSave,
  onDelete,
  onCycleStatus,
}: {
  cardIds: string[];
  cardsById: Record<string, Card>;
  open: boolean;
  onToggle: () => void;
  editingId: string | null;
  onAdd: (cellId: string) => void;
  onStartEdit: (id: string) => void;
  onSave: (id: string, patch: Partial<Card>) => void;
  onDelete: (id: string) => void;
  onCycleStatus: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY_ID });

  return (
    <div className="shrink-0 border-b border-slate-200 bg-slate-50">
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
          Staging — drag a card into a month
        </span>
      </div>
      {open && (
        <div
          ref={setNodeRef}
          className={`flex min-h-[88px] items-start gap-2 overflow-x-auto px-4 pb-2 pt-0.5 ${
            isOver ? "ring-2 ring-inset ring-slate-400" : ""
          }`}
        >
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
      )}
    </div>
  );
}
