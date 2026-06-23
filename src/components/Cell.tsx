"use client";

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
  editingId,
  onAdd,
  onStartEdit,
  onSave,
  onDelete,
  onCycleStatus,
  onResize,
}: {
  cellId: string;
  cardIds: string[];
  cardsById: Record<string, Card>;
  rowBg: string;
  colW: number;
  edgeClass?: string;
  editingId: string | null;
  onAdd: (cellId: string) => void;
  onStartEdit: (id: string) => void;
  onSave: (id: string, patch: Partial<Card>) => void;
  onDelete: (id: string) => void;
  onCycleStatus: (id: string) => void;
  onResize: (id: string, span: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId });

  return (
    <div
      ref={setNodeRef}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) onAdd(cellId);
      }}
      className={`group/cell relative flex min-h-[96px] flex-col gap-1.5 border-b border-r border-slate-200 p-1.5 ${rowBg} ${edgeClass} ${
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
              onStartEdit={onStartEdit}
              onSave={onSave}
              onDelete={onDelete}
              onCycleStatus={onCycleStatus}
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
