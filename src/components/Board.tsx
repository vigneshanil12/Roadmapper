"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { CATEGORIES } from "@/lib/categories";
import { buildMonths, currentMonthIndex } from "@/lib/time";
import { cellKey, TRAY_ID, type Card, type CardStatus, type CategoryId } from "@/lib/types";
import { getIdentity, getRole, initials, type Identity } from "@/lib/presence";
import { getBrowserClient } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import Cell from "./Cell";
import CardItem from "./CardItem";
import Tray from "./Tray";

const LABEL_W = 168;
const COL_W = 224;
const STATUS_CYCLE: CardStatus[] = ["normal", "done", "tentative"];
const STATUS_FILTERS: CardStatus[] = ["done", "tentative"];

interface PresenceUser {
  id: string;
  name: string;
  color: string;
  last_seen: string;
}

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
  const [trayOpen, setTrayOpen] = useState(false);
  // True while a dragged card hovers the parking lot. Expands the tray during
  // the drag without touching the user's manual open/closed preference.
  const [trayHover, setTrayHover] = useState(false);
  // Unsaved edits, stashed when the user clicks away mid-edit (see onDraft).
  const [drafts, setDrafts] = useState<Record<string, { title: string; body: string }>>({});
  // Bottom-edge px of the widest overflowing card per cell. A cell with a wide
  // (span=2) card overflows into the column to its right; that right cell reads
  // this to reserve top space and realign its own cards clear of the overlap.
  const [overflow, setOverflow] = useState<Record<string, number>>({});
  const handleOverflow = useCallback((cellId: string, bottomPx: number) => {
    setOverflow((p) => (p[cellId] === bottomPx ? p : { ...p, [cellId]: bottomPx }));
  }, []);

  // Read-only mode: always on for guests (view-only role), and on for narrow
  // viewports (phones) where the drag-grid is unusable. Disables every edit
  // affordance; the board becomes a scrollable read-only view.
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    const guest = getRole() === "guest";
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setReadOnly(guest || mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Search + filter. A card "matches" when it passes the text query and any
  // active category/status filters. When nothing is filtered, matchIds is null
  // (no dimming); otherwise non-matching cards are dimmed in place so their grid
  // position stays as context.
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<CardStatus>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Live presence — who else has the board open. Avatars in the header.
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const identityRef = useRef<Identity | null>(null);

  // Live cursors — other users' pointers, in grid-content coordinates so a
  // cursor lands on the same cell for everyone regardless of scroll/viewport.
  // Synced over a Supabase Realtime Broadcast channel (no DB writes).
  type RemoteCursor = { name: string; color: string; x: number; y: number; t: number };
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef(0);

  // Per-month value totals, summed per category across both halves. Drives the
  // colored segment chips in each month header.
  const monthTotals = useMemo(() => {
    const m: Record<string, Record<CategoryId, number>> = {};
    for (const id in cardsById) {
      const c = cardsById[id];
      if (c.tray) continue;
      const key = `${c.col_year}-${c.col_month}`;
      const row = (m[key] ||= { growth: 0, partner: 0, features: 0, bugs: 0 });
      row[c.category] += c.value ?? 0;
    }
    return m;
  }, [cardsById]);

  const filterActive = query.trim() !== "" || statusFilter.size > 0;
  const matchIds = useMemo(() => {
    if (!filterActive) return null;
    const q = query.trim().toLowerCase();
    const set = new Set<string>();
    for (const id in cardsById) {
      const c = cardsById[id];
      const textOk = !q || `${c.title}\n${c.body}`.toLowerCase().includes(q);
      const statusOk = statusFilter.size === 0 || statusFilter.has(c.status);
      if (textOk && statusOk) set.add(id);
    }
    return set;
  }, [filterActive, query, statusFilter, cardsById]);

  function toggleStatus(s: CardStatus) {
    setStatusFilter((p) => {
      const n = new Set(p);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });
  }
  function clearFilters() {
    setQuery("");
    setStatusFilter(new Set());
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  const cardsRef = useRef(cardsById);
  itemsRef.current = items;
  cardsRef.current = cardsById;

  // Undo history: snapshots of the full board, newest last. Capped so Ctrl+Z
  // walks back the last ~20 changes.
  type Snapshot = { cards: Record<string, Card>; items: Record<string, string[]> };
  const historyRef = useRef<Array<Snapshot>>([]);
  // Redo stack: snapshots popped by undo, replayed by Ctrl+Shift+Z. Cleared on
  // any fresh change (pushHistory) since a new action invalidates the redo path.
  const redoRef = useRef<Array<Snapshot>>([]);
  function snapshot(): Snapshot {
    const items = itemsRef.current;
    const cloneItems: Record<string, string[]> = {};
    for (const k in items) cloneItems[k] = [...items[k]];
    return { cards: { ...cardsRef.current }, items: cloneItems };
  }
  function pushHistory() {
    historyRef.current.push(snapshot());
    if (historyRef.current.length > 20) historyRef.current.shift();
    redoRef.current = [];
  }

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

  // Poll for changes made by other users. Full re-fetch every 3s, merged into
  // local state. Paused while this user is dragging (activeId) or editing
  // (editingId) so remote data never clobbers in-progress local work. Cards
  // with a stashed draft keep their local copy.
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  // Fields written optimistically (status, span, title, body...) whose PATCH may
  // still be in flight. The poll keeps the local copy of these fields until the
  // server echoes the same value back — otherwise a poll fetch that started
  // before the write lands clobbers it (e.g. status stutters back while cycling).
  const pendingRef = useRef<Record<string, Partial<Card>>>({});
  useEffect(() => {
    if (!loaded) return;
    const id = setInterval(() => {
      if (activeId || editingId) return;
      fetch("/api/cards")
        .then((r) => r.json())
        .then(({ cards }: { cards: Card[] }) => {
          // Re-check: user may have started dragging/editing during the fetch.
          if (activeId || editingId) return;
          const localDrafts = draftsRef.current;
          const pending = pendingRef.current;
          const byId: Record<string, Card> = {};
          const map: Record<string, string[]> = { [TRAY_ID]: [] };
          for (const k of allCellIds) map[k] = [];
          for (const c of cards) {
            // Preserve a card the user has an unsaved draft on.
            let card = c;
            if (localDrafts[c.id]) {
              card = cardsRef.current[c.id] ?? c;
            } else if (pending[c.id]) {
              // Keep the local copy until the server echoes our write back; then
              // the write has landed and remote data can take over again.
              const fields = pending[c.id];
              const synced = (Object.keys(fields) as (keyof Card)[]).every(
                (k) => c[k] === fields[k]
              );
              if (synced) delete pending[c.id];
              else card = cardsRef.current[c.id] ?? c;
            }
            byId[c.id] = card;
            const k = card.tray
              ? TRAY_ID
              : cellKey(card.category, card.col_year, card.col_month, card.col_half);
            (map[k] ||= []).push(c.id);
          }
          for (const k in map)
            map[k].sort((a, b) => byId[a].position - byId[b].position);
          setCardsById(byId);
          setItems(map);
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [loaded, activeId, editingId, allCellIds]);

  // Presence: announce this session every 5s and pull the active roster. On tab
  // close, fire a best-effort leave beacon so the avatar drops immediately
  // instead of waiting out the 15s active window.
  useEffect(() => {
    const me = getIdentity();
    identityRef.current = me;
    let alive = true;

    const beat = () => {
      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(me),
      }).catch(() => {});
    };
    const pull = () => {
      fetch("/api/presence")
        .then((r) => r.json())
        .then(({ users }: { users: PresenceUser[] }) => {
          if (alive && users) setPresence(users);
        })
        .catch(() => {});
    };

    beat();
    pull();
    const id = setInterval(() => {
      beat();
      pull();
    }, 5000);

    // Best-effort leave so the avatar drops at once instead of waiting out the
    // 15s active window. keepalive lets the DELETE finish after the tab unloads.
    const leave = () => {
      fetch("/api/presence", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: me.id }),
        keepalive: true,
      }).catch(() => {});
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") leave();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", leave);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", leave);
    };
  }, []);

  // Live cursors over a Realtime Broadcast channel. Receive others' positions,
  // drop them on explicit leave, and prune any that go stale (sender closed the
  // tab without a leave event). No-op when no anon key is configured.
  useEffect(() => {
    const sb = getBrowserClient();
    if (!sb) return;
    const me = getIdentity();
    const channel = sb.channel("roadmap-cursors", {
      config: { broadcast: { self: false } },
    });
    channel
      .on("broadcast", { event: "cursor" }, ({ payload }) => {
        const p = payload as { id: string } & RemoteCursor;
        if (p.id === me.id) return;
        setCursors((prev) => ({
          ...prev,
          [p.id]: { name: p.name, color: p.color, x: p.x, y: p.y, t: Date.now() },
        }));
      })
      .on("broadcast", { event: "leave" }, ({ payload }) => {
        const { id } = payload as { id: string };
        setCursors((prev) => {
          if (!(id in prev)) return prev;
          const n = { ...prev };
          delete n[id];
          return n;
        });
      })
      .subscribe();
    channelRef.current = channel;

    // Drop cursors with no update for 4s (sender left without a leave event).
    const prune = setInterval(() => {
      setCursors((prev) => {
        const now = Date.now();
        let changed = false;
        const n: Record<string, RemoteCursor> = {};
        for (const id in prev) {
          if (now - prev[id].t < 4000) n[id] = prev[id];
          else changed = true;
        }
        return changed ? n : prev;
      });
    }, 1000);

    const leave = () =>
      channel.send({ type: "broadcast", event: "leave", payload: { id: me.id } });
    window.addEventListener("pagehide", leave);

    return () => {
      clearInterval(prune);
      window.removeEventListener("pagehide", leave);
      leave();
      sb.removeChannel(channel);
      channelRef.current = null;
    };
  }, []);

  // Broadcast this user's pointer in grid-content coordinates, throttled to
  // ~20/s. Coords are relative to the grid's top-left so they map to the same
  // cell on every client regardless of scroll position or viewport size.
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const ch = channelRef.current;
    const grid = gridRef.current;
    const me = identityRef.current;
    if (!ch || !grid || !me) return;
    const now = Date.now();
    if (now - lastSentRef.current < 50) return;
    lastSentRef.current = now;
    const rect = grid.getBoundingClientRect();
    ch.send({
      type: "broadcast",
      event: "cursor",
      payload: {
        id: me.id,
        name: me.name,
        color: me.color,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      },
    });
  }, []);

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

  // Push the server back to a restored snapshot: recreate cards that were
  // deleted, delete cards that were added, PATCH the ones that changed.
  function reconcile(
    live: Record<string, Card>,
    snap: Record<string, Card>
  ) {
    const payload = (c: Card) => ({
      title: c.title,
      body: c.body,
      category: c.category,
      col_year: c.col_year,
      col_month: c.col_month,
      col_half: c.col_half,
      span: c.span,
      value: c.value,
      position: c.position,
      status: c.status,
      tray: c.tray,
    });
    for (const id in snap) {
      if (!live[id]) {
        fetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...payload(snap[id]) }),
        });
      } else if (JSON.stringify(payload(live[id])) !== JSON.stringify(payload(snap[id]))) {
        fetch(`/api/cards/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload(snap[id])),
        });
      }
    }
    for (const id in live) {
      if (!snap[id]) fetch(`/api/cards/${id}`, { method: "DELETE" });
    }
  }

  function applySnapshot(snap: Snapshot) {
    const live = cardsRef.current;
    setEditingId(null);
    setDrafts({});
    setCardsById(snap.cards);
    setItems(snap.items);
    reconcile(live, snap.cards);
  }

  function undo() {
    const snap = historyRef.current.pop();
    if (!snap) return;
    redoRef.current.push(snapshot());
    applySnapshot(snap);
  }

  function redo() {
    const snap = redoRef.current.pop();
    if (!snap) return;
    historyRef.current.push(snapshot());
    applySnapshot(snap);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        const t = e.target as HTMLElement;
        // Let the browser handle undo/redo inside a focused text field.
        if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Navigation shortcuts: "/" focus search, "?" toggle the help sheet, Esc clears
  // the filter / closes help. Text fields keep their own Esc behavior (the card
  // editor cancels) so we only act on Esc from the search box or bare document.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
      if (e.key === "Escape") {
        if (showHelp) {
          setShowHelp(false);
        } else if (t === searchRef.current) {
          clearFilters();
          searchRef.current?.blur();
        } else if (!typing) {
          clearFilters();
        }
        return;
      }
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "?") {
        e.preventDefault();
        setShowHelp((s) => !s);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showHelp]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function findContainer(id: string): string | undefined {
    if (id in itemsRef.current) return id;
    return Object.keys(itemsRef.current).find((k) =>
      itemsRef.current[k].includes(id)
    );
  }

  // Pointer-first collision detection. The dense month grid keeps corner-based
  // detection, but the parking lot is matched by the cursor being *within* it —
  // so it catches a drop even when collapsed/empty (a small rect that
  // closestCorners would never pick over a nearby grid cell).
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointer = pointerWithin(args);
    const trayItems = itemsRef.current[TRAY_ID] ?? [];
    const onTray =
      pointer.find((c) => String(c.id) === TRAY_ID) ??
      pointer.find((c) => trayItems.includes(String(c.id)));
    if (onTray) {
      // Prefer a specific tray card (gives a stack index); else the container.
      const card = pointer.find((c) => trayItems.includes(String(c.id)));
      return card ? [card] : [onTray];
    }
    const corners = closestCorners(args);
    return corners.length ? corners : pointer;
  }, []);

  function handleDragStart(e: DragStartEvent) {
    pushHistory();
    setTrayHover(false);
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    const overC = over ? findContainer(String(over.id)) : undefined;
    // Expand the tray while the card is over it; compress when it leaves.
    setTrayHover(overC === TRAY_ID);
    if (!over) return;
    const activeC = findContainer(String(active.id));
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
    // Card parked via drag — auto-expand so the user sees where it landed.
    if (activeC && itemsRef.current[TRAY_ID]?.includes(String(active.id))) {
      setTrayOpen(true);
    }
    setActiveId(null);
    setTrayHover(false);
  }

  function clearDraft(id: string) {
    setDrafts((d) => {
      if (!(id in d)) return d;
      const n = { ...d };
      delete n[id];
      return n;
    });
  }

  // ---- card CRUD ----
  // Optimistic: the card appears (and is editable) instantly with a client-made
  // id; the POST runs in the background using that same id.
  function addCard(cellId: string) {
    pushHistory();
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
    const card: Card = {
      id: crypto.randomUUID(),
      title: "",
      body: "",
      ...loc,
      span: 1,
      value: 0,
      position,
      status: "normal",
      tray: isTray,
    };
    if (isTray) setTrayOpen(true);
    setCardsById((p) => ({ ...p, [card.id]: card }));
    setItems((p) => ({ ...p, [cellId]: [...(p[cellId] ?? []), card.id] }));
    setEditingId(card.id);
    fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });
  }

  function saveCard(id: string, patch: Partial<Card>) {
    pushHistory();
    clearDraft(id);
    pendingRef.current[id] = { ...pendingRef.current[id], ...patch };
    setCardsById((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
    setEditingId((e) => (e === id ? null : e));
    fetch(`/api/cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  // Stash an in-progress edit as a draft and leave edit mode (triggered by
  // clicking outside the card). A never-touched empty card is just discarded.
  function draftEdit(id: string, patch: { title: string; body: string }) {
    const card = cardsRef.current[id];
    if (!patch.title && !patch.body && card && !card.title.trim() && !card.body.trim()) {
      deleteCard(id);
      return;
    }
    // No actual change vs the saved card (and no pre-existing draft): just leave
    // edit mode without flagging a draft.
    if (
      card &&
      !drafts[id] &&
      patch.title === card.title.trim() &&
      patch.body === card.body.trim()
    ) {
      setEditingId((e) => (e === id ? null : e));
      return;
    }
    setDrafts((d) => ({ ...d, [id]: patch }));
    setEditingId((e) => (e === id ? null : e));
  }

  // Exit edit, discarding any draft. A never-saved (empty) card is removed.
  function cancelEdit(id: string) {
    const card = cardsRef.current[id];
    clearDraft(id);
    if (card && !card.title.trim() && !card.body.trim()) {
      deleteCard(id);
      return;
    }
    setEditingId((e) => (e === id ? null : e));
  }

  function deleteCard(id: string) {
    pushHistory();
    clearDraft(id);
    delete pendingRef.current[id];
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
    // A wide card overflows the next column; keep it at the top of its cell so
    // smaller cards stack below it instead of leaving dead space above.
    if (span === 2) {
      setItems((prev) => {
        const key = Object.keys(prev).find((k) => prev[k].includes(id));
        if (!key || prev[key][0] === id) return prev;
        return { ...prev, [key]: [id, ...prev[key].filter((x) => x !== id)] };
      });
    }
  }

  function cycleStatus(id: string) {
    const cur = cardsRef.current[id];
    if (!cur) return;
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur.status) + 1) % 3];
    saveCard(id, { status: next });
  }

  function cycleValue(id: string) {
    const cur = cardsRef.current[id];
    if (!cur) return;
    const next = ((cur.value ?? 0) + 1) % 4;
    saveCard(id, { value: next });
  }

  async function logout() {
    const me = identityRef.current;
    if (me) {
      await fetch("/api/presence", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: me.id }),
      }).catch(() => {});
    }
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const gridCols = `${LABEL_W}px repeat(${cols.length}, ${COL_W}px)`;
  const activeCard = activeId ? cardsById[activeId] : null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="text-sm font-semibold">Product Roadmap</h1>
        {readOnly && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
            View only
          </span>
        )}

        {/* Search + filters */}
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards…  ( / )"
              className="w-44 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-500"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                title="Clear"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((s) => {
              const on = statusFilter.has(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  title={`Filter: ${s}`}
                  className={`rounded-full border px-2 py-0.5 text-[11px] capitalize transition ${
                    on
                      ? "border-slate-700 bg-slate-800 font-semibold text-white"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
          {filterActive && (
            <button
              onClick={clearFilters}
              className="text-[11px] text-slate-400 underline hover:text-slate-700"
            >
              clear
            </button>
          )}
        </div>

        {/* Presence + actions */}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {presence.length > 0 && (
            <div className="flex items-center -space-x-1.5">
              {presence.slice(0, 6).map((u) => {
                const isMe = u.id === identityRef.current?.id;
                return (
                  <span
                    key={u.id}
                    title={isMe ? `${u.name} (you)` : u.name}
                    style={{ backgroundColor: u.color }}
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ${
                      isMe ? "ring-slate-900" : "ring-white"
                    }`}
                  >
                    {initials(u.name)}
                  </span>
                );
              })}
              {presence.length > 6 && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-300 text-[10px] font-bold text-slate-700 ring-2 ring-white">
                  +{presence.length - 6}
                </span>
              )}
            </div>
          )}
          <button
            onClick={() => setShowHelp(true)}
            title="Keyboard shortcuts (?)"
            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
          >
            ?
          </button>
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
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
          <Tray
            cardIds={items[TRAY_ID] ?? []}
            cardsById={cardsById}
            open={trayOpen || trayHover}
            onToggle={() => setTrayOpen((o) => !o)}
            readOnly={readOnly}
            matchIds={matchIds}
            editingId={editingId}
            drafts={drafts}
            onAdd={addCard}
            onStartEdit={setEditingId}
            onSave={saveCard}
            onCancel={cancelEdit}
            onDraft={draftEdit}
            onDelete={deleteCard}
            onCycleStatus={cycleStatus}
            onCycleValue={cycleValue}
          />
          <div ref={scrollRef} onPointerMove={onPointerMove} className="flex-1 overflow-auto">
            <div
              ref={gridRef}
              className="relative grid w-max"
              style={{ gridTemplateColumns: gridCols }}
            >
            {/* Row 1: month headers */}
            <div className="sticky left-0 top-0 z-30 border-b border-r border-slate-200 bg-white" />
            {months.map((m, i) => {
              const totals = monthTotals[`${m.year}-${m.month}`];
              return (
                <div
                  key={`${m.year}-${m.month}`}
                  style={{ gridColumn: "span 2" }}
                  className={`sticky top-0 z-20 flex h-[37px] items-center justify-between gap-2 border-b border-l-2 border-l-slate-400 border-slate-200 bg-sky-100 px-2 text-sm font-semibold text-sky-900 ${
                    i === months.length - 1 ? "border-r-2 border-r-slate-400" : "border-r"
                  }`}
                >
                  <span className="shrink-0">{m.label}</span>
                  {totals && (
                    <div className="flex shrink-0 items-stretch overflow-hidden rounded-md border border-slate-300/60">
                      {CATEGORIES.map((cat) => {
                        const t = totals[cat.id] ?? 0;
                        if (t <= 0) return null;
                        return (
                          <div
                            key={cat.id}
                            title={`${cat.label}: ${t}`}
                            className={`flex min-w-[40px] flex-col items-center ${cat.chipBg}`}
                          >
                            <span className={`px-2 text-[13px] font-semibold leading-[18px] ${cat.labelText}`}>
                              {t}
                            </span>
                            <span className={`h-[3px] w-full ${cat.chipBar}`} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Row 2: half-month sub headers */}
            <div className="sticky left-0 top-[37px] z-30 border-b border-r border-slate-200 bg-white" />
            {cols.map((c, i) => (
              <div
                key={`h-${c.key}`}
                className={`sticky top-[37px] z-20 border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-center text-[11px] text-slate-500 ${
                  c.half === 0 ? "border-l-2 border-l-slate-400" : ""
                } ${i === cols.length - 1 ? "border-r-2 border-r-slate-400" : ""}`}
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
                overflow={overflow}
                onOverflow={handleOverflow}
                readOnly={readOnly}
                matchIds={matchIds}
                editingId={editingId}
                drafts={drafts}
                onAdd={addCard}
                onStartEdit={setEditingId}
                onSave={saveCard}
                onCancel={cancelEdit}
                onDraft={draftEdit}
                onDelete={deleteCard}
                onCycleStatus={cycleStatus}
                onCycleValue={cycleValue}
                onResize={resizeCard}
              />
            ))}

            {/* Live cursors of other users, in grid-content coordinates. */}
            {Object.entries(cursors).map(([id, c]) => (
              <div
                key={id}
                className="pointer-events-none absolute z-40"
                style={{ left: c.x, top: c.y }}
              >
                <svg width="20" height="20" viewBox="0 0 512 512" fill={c.color}>
                  <path
                    d="M106.66,8.16c-25.2-19.61-61.93-1.64-61.93,30.29v435.11c0,36.38,45.91,52.34,68.47,23.8l107.21-135.59c8.01-10.13,20.2-16.03,33.11-16.03h175.29c36.54,0,52.4-46.23,23.56-68.66L106.66,8.16z"
                    stroke="white"
                    strokeWidth="26"
                    strokeLinejoin="round"
                  />
                </svg>
                <span
                  style={{ backgroundColor: c.color }}
                  className="absolute left-3.5 top-3.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
                >
                  {c.name}
                </span>
              </div>
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
              onCancel={() => {}}
              onDelete={() => {}}
              onCycleStatus={() => {}}
              onCycleValue={() => {}}
              onResize={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="rounded px-1 text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <dl className="space-y-1.5 text-xs text-slate-600">
              {[
                ["/", "Focus search"],
                ["?", "Toggle this help"],
                ["Esc", "Clear filters / close"],
                ["⌘/Ctrl + Z", "Undo"],
                ["⌘/Ctrl + ⇧ + Z", "Redo"],
                ["Double-click cell", "Add a card"],
                ["Double-click card", "Edit"],
              ].map(([k, d]) => (
                <div key={k} className="flex items-center justify-between gap-4">
                  <span>{d}</span>
                  <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                    {k}
                  </kbd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
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
  overflow,
  onOverflow,
  readOnly,
  matchIds,
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
  catId: CategoryId;
  label: string;
  rowBg: string;
  labelText: string;
  cardBg: string;
  cols: ReturnType<typeof buildMonths>[number]["cols"];
  colW: number;
  items: Record<string, string[]>;
  cardsById: Record<string, Card>;
  overflow: Record<string, number>;
  onOverflow: (cellId: string, bottomPx: number) => void;
  readOnly: boolean;
  matchIds: Set<string> | null;
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
  return (
    <>
      <div
        className={`sticky left-0 z-10 flex items-start border-b border-r border-slate-200 p-2 ${cardBg}`}
      >
        <span className={`text-sm font-bold ${labelText}`}>{label}</span>
      </div>
      {cols.map((c, i) => {
        const id = cellKey(catId, c.year, c.month, c.half);
        const edgeClass = `${c.half === 0 ? "border-l-2 border-l-slate-400" : ""} ${
          i === cols.length - 1 ? "border-r-2 border-r-slate-400" : ""
        }`;
        // Reserve top space if the cell to our left has a wide card overflowing in.
        const leftCol = cols[i - 1];
        const leftId = leftCol
          ? cellKey(catId, leftCol.year, leftCol.month, leftCol.half)
          : null;
        const reserveTop = leftId && overflow[leftId] ? overflow[leftId] + 6 : 0;
        return (
          <Cell
            key={id}
            cellId={id}
            cardIds={items[id] ?? []}
            cardsById={cardsById}
            rowBg={rowBg}
            colW={colW}
            edgeClass={edgeClass}
            reserveTop={reserveTop}
            onOverflow={onOverflow}
            readOnly={readOnly}
            matchIds={matchIds}
            editingId={editingId}
            drafts={drafts}
            onAdd={onAdd}
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
    </>
  );
}
