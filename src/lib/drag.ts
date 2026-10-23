// Pure container math behind the board's drag handlers.
//
// Every function here takes the *current* container map and returns a new one —
// no refs, no component state. That is the whole point: the crashes we have had
// while dragging all came from mixing a lagging snapshot (itemsRef, read at
// event time) with a fresh one (`prev`, inside a setState updater). Keeping the
// math pure means the handlers can derive everything from `prev` and these
// functions can be tested without React or dnd-kit.

export type Containers = Record<string, string[]>;

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

// Which container holds `id` — or `id` itself when it *is* a container.
export function findContainerIn(
  items: Containers,
  id: string
): string | undefined {
  if (id in items) return id;
  return Object.keys(items).find((k) => items[k].includes(id));
}

// onDragOver: move the dragged card into the container it is hovering. Returns
// `prev` unchanged when there is nothing to do, so React can skip the render.
export function moveBetween(
  prev: Containers,
  activeId: string,
  overId: string
): Containers {
  const activeC = findContainerIn(prev, activeId);
  const overC = findContainerIn(prev, overId);
  if (!activeC || !overC || activeC === overC) return prev;
  const overItems = prev[overC];
  // An earlier queued update already moved it — inserting again would put the
  // same id in two SortableContexts, which crashes dnd-kit.
  if (overItems.includes(activeId)) return prev;
  const overIsContainer = overId in prev;
  const newIndex = overIsContainer
    ? overItems.length
    : Math.max(0, overItems.indexOf(overId));
  return {
    ...prev,
    [activeC]: prev[activeC].filter((id) => id !== activeId),
    [overC]: [
      ...overItems.slice(0, newIndex),
      activeId,
      ...overItems.slice(newIndex),
    ],
  };
}

// onDragEnd: reorder within a single container when the card was dropped on a
// sibling card. Cross-container drops are already handled by moveBetween.
export function reorderWithin(
  prev: Containers,
  activeId: string,
  overId: string
): Containers {
  const activeC = findContainerIn(prev, activeId);
  const overC = findContainerIn(prev, overId);
  if (!activeC || !overC || activeC !== overC) return prev;
  // Dropped on the container itself, not on a sibling: nothing to sort against.
  if (overId in prev) return prev;
  const arr = prev[activeC];
  const oldIndex = arr.indexOf(activeId);
  const newIndex = arr.indexOf(overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
  return { ...prev, [activeC]: arrayMove(arr, oldIndex, newIndex) };
}

// Collision resolution for the month grid.
//
// A span=2 card is *wider than its own cell*: it renders over the column to its
// right (CardItem sizes it colW*2). dnd-kit registers every sortable card as a
// droppable at its real rect, so a wide card in Cycle 1 owns a droppable rect
// sitting inside Cycle 2's space — and closestCorners preferred it over the
// Cycle 2 cell itself (a full-row rect whose corners are far from the small
// dragged card). Dropping anywhere in Cycle 2 therefore filed the card back
// into Cycle 1, with no way to reach Cycle 2 at all.
//
// So the cell under the *pointer* wins, and card candidates are only honoured
// when they actually live in that cell (they carry the insertion index).
// Falling back to the cell id drops at the end of it.
export function resolveGridCollision(
  items: Containers,
  cellId: string,
  candidateIds: string[]
): string {
  const own = items[cellId] ?? [];
  return candidateIds.find((id) => own.includes(id)) ?? cellId;
}

// ---- Wide-card overflow --------------------------------------------------
//
// A card with span N renders over the N-1 columns to its right. Each cell
// reports how far down its wide cards reach into each of those columns:
// reach[k] is the lowest bottom edge (px) among cards that cover the column
// k+1 to the right, i.e. cards with span > k+1. A span=4 card contributes to
// reach[0..2]; a span=2 card only to reach[0].
export function overflowReach(wide: Array<{ bottom: number; span: number }>): number[] {
  const reach: number[] = [];
  for (const { bottom, span } of wide) {
    for (let k = 0; k < span - 1; k++) reach[k] = Math.max(reach[k] ?? 0, bottom);
  }
  return reach;
}

// Top space cell `i` in a row must reserve: the deepest overhang from any cell
// to its left whose wide cards reach this far.
export function reserveFor(
  overflow: Record<string, number[]>,
  rowCells: string[],
  i: number
): number {
  let max = 0;
  for (let j = i - 1; j >= 0; j--) {
    const v = overflow[rowCells[j]]?.[i - j - 1];
    if (v && v > max) max = v;
  }
  return max;
}

// ---- Group move ----------------------------------------------------------
//
// Multi-select drag. A group drag does not move anything live (dnd-kit only
// knows about the grabbed card, so live-moving it alone reshuffled cells under
// the rest of the group). Instead the board previews the landing cells from
// planGroupMove and applies everything at once on drop with applyGroupMove.
//
// Every card shifts by the same row/column delta the grabbed card travelled,
// so the group keeps its shape; the delta is clamped so no card — grabbed one
// included — falls off the grid. The parking lot has no geometry: dropping
// there (or dragging out of it) sends the whole group to the target container.

export type GroupGrid = { cats: string[]; cols: string[]; tray: string };

// Destination container per card id, or null when nothing moves. `ids` lists
// the grabbed card first. Ids missing from `items` are skipped.
export function planGroupMove(
  items: Containers,
  ids: string[],
  originC: string,
  targetC: string,
  grid: GroupGrid
): Record<string, string> | null {
  if (originC === targetC) return null;
  const from: Record<string, string> = {};
  for (const id of ids) {
    const c = findContainerIn(items, id);
    if (c && c !== id) from[id] = c;
  }
  const present = Object.keys(from);
  if (!present.length) return null;

  const pos = (cell: string) => {
    const bar = cell.indexOf("|");
    return {
      row: grid.cats.indexOf(cell.slice(0, bar)),
      col: grid.cols.indexOf(cell.slice(bar + 1)),
    };
  };
  const plan: Record<string, string> = {};
  if (originC === grid.tray || targetC === grid.tray) {
    for (const id of present) plan[id] = targetC;
    return plan;
  }
  const a = pos(originC);
  const b = pos(targetC);
  if (a.row < 0 || a.col < 0 || b.row < 0 || b.col < 0) return null;
  let dRow = b.row - a.row;
  let dCol = b.col - a.col;
  for (const id of present) {
    if (from[id] === grid.tray) continue;
    const p = pos(from[id]);
    if (p.row < 0 || p.col < 0) continue;
    dRow = Math.min(Math.max(dRow, -p.row), grid.cats.length - 1 - p.row);
    dCol = Math.min(Math.max(dCol, -p.col), grid.cols.length - 1 - p.col);
  }
  if (dRow === 0 && dCol === 0) return null;
  for (const id of present) {
    const p = from[id] === grid.tray ? null : pos(from[id]);
    plan[id] =
      p && p.row >= 0 && p.col >= 0
        ? `${grid.cats[p.row + dRow]}|${grid.cols[p.col + dCol]}`
        : // A parked card in a grid move lands with the grabbed card.
          `${grid.cats[a.row + dRow]}|${grid.cols[a.col + dCol]}`;
  }
  return plan;
}

// Apply a plan from planGroupMove. Cards headed to the grabbed card's cell go
// in as one block, in their original board order, before `overId` when that is
// a card already in the cell (else at the end); the rest join the bottom of
// their new cell, also in board order — so the group never reshuffles itself.
export function applyGroupMove(
  prev: Containers,
  plan: Record<string, string> | null,
  activeId: string,
  overId: string | null
): Containers {
  if (!plan) return prev;
  const moving = new Set(Object.keys(plan).filter((id) => findContainerIn(prev, id) !== plan[id]));
  if (!moving.size) return prev;
  // Board order (container, then stack index) so relative stacking survives.
  const ordered: string[] = [];
  for (const k of Object.keys(prev)) for (const id of prev[k]) if (moving.has(id)) ordered.push(id);
  const next: Containers = {};
  for (const k of Object.keys(prev)) next[k] = prev[k].filter((id) => !moving.has(id));
  const activeDest = plan[activeId];
  const byDest: Record<string, string[]> = {};
  for (const id of ordered) (byDest[plan[id]] ||= []).push(id);
  for (const dest in byDest) {
    const arr = next[dest] ?? [];
    const at =
      dest === activeDest && overId && arr.includes(overId) ? arr.indexOf(overId) : arr.length;
    next[dest] = [...arr.slice(0, at), ...byDest[dest], ...arr.slice(at)];
  }
  return next;
}

// Which grid cell a dragged card targets. The cursor alone is wrong for wide
// cards (span > 1) and groups: grab a wide card by its right half and the
// cursor sits a column right of the card's left edge, so it lands a column
// off from where it visibly is. Anchor on the middle of the card's first
// column instead; the row still follows the cursor.
export function anchorPoint(
  rect: { left: number; top: number; width: number; height: number },
  pointer: { x: number; y: number } | null,
  colW: number
): { x: number; y: number } {
  return {
    x: rect.left + Math.min(rect.width, colW) / 2,
    y: pointer ? pointer.y : rect.top + rect.height / 2,
  };
}
