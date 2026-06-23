"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { CATEGORIES } from "@/lib/categories";
import { buildMonths, currentMonthIndex } from "@/lib/time";
import { cellKey, TRAY_ID, type Card, type CardStatus, type CategoryId } from "@/lib/types";
import Cell from "./Cell";
import CardItem from "./CardItem";
import Tray from "./Tray";

const LABEL_W = 168;
const COL_W = 224;
const STATUS_CYCLE: CardStatus[] = ["normal", "tentative", "done"];

function parseCell(id: string): {
  category: CategoryId;
  year: number;
  month: number;
  half: number;
} {
  const [category, year, month, half] = id.split("|");
  return {
    category: category as CategoryId,
    year: Number(year),
    month: Number(month),
    half: Number(half),
  };
}

export default function Board() {
  const months = useMemo(() => buildMonths(), []);
  const cols = useMemo(() => months.flatMap((m) => m.cols), [months]);

  const allCellIds = useMemo(() => {
    const keys: string[] = [];
    for (const cat of CATEGORIES)
      for (const c of cols) keys.push(cellKey(cat.id, c.year, c.month, c.half));
    return keys;
  }, [cols]);

  const [cardsById, setCardsById] = useState<Record<string, Card>>({});
  const [items, setItems] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [trayOpen, setTrayOpen] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  const cardsRef = useRef(cardsById);
  itemsRef.current = items;
  cardsRef.current = cardsById;

  // Load cards.
  useEffect(() => {
    let alive = true;
    fetch("/api/cards")
      .then((r) => r.json())
      .then(({ cards }: { cards: Card[] }) => {
        if (!alive) return;
        const byId: Record<string, Card> = {};
        const map: Record<string, string[]> = { [TRAY_ID]: [] };
        for (const k of allCellIds) map[k] = [];
        for (const c of cards) {
          byId[c.id] = c;
          const k = c.tray
            ? TRAY_ID
            : cellKey(c.category, c.col_year, c.col_month, c.col_half);
          (map[k] ||= []).push(c.id);
        }
        for (const k in map)
          map[k].sort((a, b) => byId[a].position - byId[b].position);
        setCardsById(byId);
        setItems(map);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [allCellIds]);

  // Scroll to current month on first load.
  useEffect(() => {
    if (loaded && scrollRef.current) {
      scrollRef.current.scrollLeft = currentMonthIndex() * 2 * COL_W;
    }
  }, [loaded]);

  // Persist layout (cell + position) whenever items settle after a drag.
  useEffect(() => {
    if (!loaded || activeId) return;
    const updates: Array<Record<string, unknown>> = [];
    const next = { ...cardsRef.current };
    for (const key of Object.keys(items)) {
      // Tray: keep category/col as-is, only flag tray + stack order.
      if (key === TRAY_ID) {
        items[key].forEach((id, idx) => {
          const card = next[id];
          if (!card) return;
          if (!card.tray || card.position !== idx) {
            next[id] = { ...card, tray: true, position: idx };
            updates.push({
              id,
              category: card.category,
              col_year: card.col_year,
              col_month: card.col_month,
              col_half: card.col_half,
              position: idx,
              tray: true,
            });
          }
        });
        continue;
      }
      const { category, year, month, half } = parseCell(key);
      items[key].forEach((id, idx) => {
        const card = next[id];
        if (!card) return;
        if (
          card.category !== category ||
          card.col_year !== year ||
          card.col_month !== month ||
          card.col_half !== half ||
          card.position !== idx ||
          card.tray
        ) {
          next[id] = {
            ...card,
            category,
            col_year: year,
            col_month: month,
            col_half: half,
            position: idx,
            tray: false,
          };
          updates.push({
            id,
            category,
            col_year: year,
            col_month: month,
            col_half: half,
            position: idx,
            tray: false,
          });
        }
      });
    }
    if (updates.length) {
      setCardsById(next);
      fetch("/api/cards/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
    }
  }, [items, activeId, loaded]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function findContainer(id: string): string | undefined {
    if (id in itemsRef.current) return id;
    return Object.keys(itemsRef.current).find((k) =>
      itemsRef.current[k].includes(id)
    );
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeC = findContainer(String(active.id));
    const overC = findContainer(String(over.id));
    if (!activeC || !overC || activeC === overC) return;

    setItems((prev) => {
      const activeItems = prev[activeC];
      const overItems = prev[overC];
      const overIsContainer = String(over.id) in prev;
      const newIndex = overIsContainer
        ? overItems.length
        : Math.max(0, overItems.indexOf(String(over.id)));
      return {
        ...prev,
        [activeC]: activeItems.filter((id) => id !== String(active.id)),
        [overC]: [
          ...overItems.slice(0, newIndex),
          String(active.id),
          ...overItems.slice(newIndex),
        ],
      };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const activeC = findContainer(String(active.id));
    if (over && activeC) {
      const overC = findContainer(String(over.id));
      if (activeC === overC && !(String(over.id) in itemsRef.current)) {
        const arr = itemsRef.current[activeC];
        const oldIndex = arr.indexOf(String(active.id));
        const newIndex = arr.indexOf(String(over.id));
        if (oldIndex !== newIndex && newIndex >= 0) {
          setItems((prev) => ({
            ...prev,
            [activeC]: arrayMove(prev[activeC], oldIndex, newIndex),
          }));
        }
      }
    }
    setActiveId(null);
  }

  // ---- card CRUD ----
  async function addCard(cellId: string) {
    const isTray = cellId === TRAY_ID;
    // Tray cards have no real column yet; default to the current half-month so
    // the stored col_* are valid until the card is dropped into a cell.
    const now = new Date();
    const loc = isTray
      ? {
          category: "features" as CategoryId,
          col_year: now.getFullYear(),
          col_month: now.getMonth() + 1,
          col_half: now.getDate() <= 15 ? 0 : 1,
        }
      : (() => {
          const { category, year, month, half } = parseCell(cellId);
          return { category, col_year: year, col_month: month, col_half: half };
        })();
    const position = itemsRef.current[cellId]?.length ?? 0;
    const res = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "",
        body: "",
        ...loc,
        span: 1,
        position,
        status: "normal",
        tray: isTray,
      }),
    });
    const { card } = (await res.json()) as { card: Card };
    if (isTray) setTrayOpen(true);
    setCardsById((p) => ({ ...p, [card.id]: card }));
    setItems((p) => ({ ...p, [cellId]: [...(p[cellId] ?? []), card.id] }));
    setEditingId(card.id);
  }

  function saveCard(id: string, patch: Partial<Card>) {
    setCardsById((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
    setEditingId(null);
    fetch(`/api/cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  function deleteCard(id: string) {
    setEditingId((e) => (e === id ? null : e));
    setCardsById((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
    setItems((p) => {
      const n: Record<string, string[]> = {};
      for (const k of Object.keys(p)) n[k] = p[k].filter((x) => x !== id);
      return n;
    });
    fetch(`/api/cards/${id}`, { method: "DELETE" });
  }

  function resizeCard(id: string, span: number) {
    saveCard(id, { span });
  }

  function cycleStatus(id: string) {
    const cur = cardsRef.current[id];
    if (!cur) return;
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur.status) + 1) % 3];
    saveCard(id, { status: next });
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const gridCols = `${LABEL_W}px repeat(${cols.length}, ${COL_W}px)`;
  const activeCard = activeId ? cardsById[activeId] : null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="text-sm font-semibold">Product Roadmap</h1>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>Double-click a cell to add · drag to move · hover a card for actions</span>
          <button
            onClick={logout}
            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
          <Tray
            cardIds={items[TRAY_ID] ?? []}
            cardsById={cardsById}
            open={trayOpen}
            onToggle={() => setTrayOpen((o) => !o)}
            editingId={editingId}
            onAdd={addCard}
            onStartEdit={setEditingId}
            onSave={saveCard}
            onDelete={deleteCard}
            onCycleStatus={cycleStatus}
          />
          <div ref={scrollRef} className="flex-1 overflow-auto">
            <div
              className="grid w-max"
              style={{ gridTemplateColumns: gridCols }}
            >
            {/* Row 1: month headers */}
            <div className="sticky left-0 top-0 z-30 border-b border-r border-slate-200 bg-white" />
            {months.map((m) => (
              <div
                key={`${m.year}-${m.month}`}
                style={{ gridColumn: "span 2" }}
                className="sticky top-0 z-20 border-b border-r border-slate-200 bg-sky-100 px-2 py-2 text-center text-sm font-semibold text-sky-900"
              >
                {m.label}
              </div>
            ))}

            {/* Row 2: half-month sub headers */}
            <div className="sticky left-0 top-[37px] z-30 border-b border-r border-slate-200 bg-white" />
            {cols.map((c) => (
              <div
                key={`h-${c.key}`}
                className="sticky top-[37px] z-20 border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-center text-[11px] text-slate-500"
              >
                {c.label}
              </div>
            ))}

            {/* Category rows */}
            {CATEGORIES.map((cat) => (
              <RowFragment
                key={cat.id}
                catId={cat.id}
                label={cat.label}
                rowBg={cat.rowBg}
                labelText={cat.labelText}
                cardBg={cat.cardBg}
                cols={cols}
                colW={COL_W}
                items={items}
                cardsById={cardsById}
                editingId={editingId}
                onAdd={addCard}
                onStartEdit={setEditingId}
                onSave={saveCard}
                onDelete={deleteCard}
                onCycleStatus={cycleStatus}
                onResize={resizeCard}
              />
            ))}
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeCard ? (
            <CardItem
              card={activeCard}
              editing={false}
              colW={COL_W}
              overlay
              onStartEdit={() => {}}
              onSave={() => {}}
              onDelete={() => {}}
              onCycleStatus={() => {}}
              onResize={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function RowFragment({
  catId,
  label,
  rowBg,
  labelText,
  cardBg,
  cols,
  colW,
  items,
  cardsById,
  editingId,
  onAdd,
  onStartEdit,
  onSave,
  onDelete,
  onCycleStatus,
  onResize,
}: {
  catId: CategoryId;
  label: string;
  rowBg: string;
  labelText: string;
  cardBg: string;
  cols: ReturnType<typeof buildMonths>[number]["cols"];
  colW: number;
  items: Record<string, string[]>;
  cardsById: Record<string, Card>;
  editingId: string | null;
  onAdd: (cellId: string) => void;
  onStartEdit: (id: string) => void;
  onSave: (id: string, patch: Partial<Card>) => void;
  onDelete: (id: string) => void;
  onCycleStatus: (id: string) => void;
  onResize: (id: string, span: number) => void;
}) {
  return (
    <>
      <div
        className={`sticky left-0 z-10 flex items-start border-b border-r border-slate-200 p-2 ${cardBg}`}
      >
        <span className={`text-sm font-bold ${labelText}`}>{label}</span>
      </div>
      {cols.map((c) => {
        const id = cellKey(catId, c.year, c.month, c.half);
        return (
          <Cell
            key={id}
            cellId={id}
            cardIds={items[id] ?? []}
            cardsById={cardsById}
            rowBg={rowBg}
            colW={colW}
            editingId={editingId}
            onAdd={onAdd}
            onStartEdit={onStartEdit}
            onSave={onSave}
            onDelete={onDelete}
            onCycleStatus={onCycleStatus}
            onResize={onResize}
          />
        );
      })}
    </>
  );
}
