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
// Multi-select drag: dnd-kit only moves the card under the pointer. On drop,
// the rest of the selection ("followers") is shifted by the same row/column
// delta the dragged card travelled, so the group keeps its shape. The delta is
// clamped so no follower falls off the grid. Anything involving the parking
// lot has no geometry, so followers just land in the same container as the
// dragged card.
//
// Like the rest of this file, `prev` must be the fresh container map from
// inside a setItems updater — the dragged card's landing cell is read from it.
export function moveGroup(
  prev: Containers,
  activeId: string,
  originC: string,
  followerIds: string[],
  grid: { cats: string[]; cols: string[]; tray: string }
): Containers {
  const targetC = findContainerIn(prev, activeId);
  if (!targetC || targetC === originC) return prev;
  const want = new Set(followerIds.filter((id) => id !== activeId));
  // Followers in board order (container, then stack index) so their relative
  // stacking survives the move.
  const followers: Array<{ id: string; from: string }> = [];
  for (const k of Object.keys(prev))
    for (const id of prev[k]) if (want.has(id)) followers.push({ id, from: k });
  if (!followers.length) return prev;

  const pos = (cell: string) => {
    const bar = cell.indexOf("|");
    return {
      row: grid.cats.indexOf(cell.slice(0, bar)),
      col: grid.cols.indexOf(cell.slice(bar + 1)),
    };
  };
  const geometric = originC !== grid.tray && targetC !== grid.tray;
  let dRow = 0;
  let dCol = 0;
  if (geometric) {
    const a = pos(originC);
    const b = pos(targetC);
    if (a.row < 0 || a.col < 0 || b.row < 0 || b.col < 0) return prev;
    dRow = b.row - a.row;
    dCol = b.col - a.col;
    // Clamp so the whole group stays on the grid.
    for (const f of followers) {
      if (f.from === grid.tray) continue;
      const p = pos(f.from);
      if (p.row < 0 || p.col < 0) continue;
      dRow = Math.min(Math.max(dRow, -p.row), grid.cats.length - 1 - p.row);
      dCol = Math.min(Math.max(dCol, -p.col), grid.cols.length - 1 - p.col);
    }
  }
  const destOf = (from: string) => {
    if (!geometric || from === grid.tray) return targetC;
    const p = pos(from);
    if (p.row < 0 || p.col < 0) return from;
    return `${grid.cats[p.row + dRow]}|${grid.cols[p.col + dCol]}`;
  };

  const next: Containers = { ...prev };
  const moved = followers.filter((f) => destOf(f.from) !== f.from);
  if (!moved.length) return prev;
  const movedIds = new Set(moved.map((f) => f.id));
  for (const f of moved) next[f.from] = next[f.from].filter((id) => !movedIds.has(id));
  const byDest: Record<string, string[]> = {};
  for (const f of moved) (byDest[destOf(f.from)] ||= []).push(f.id);
  for (const dest in byDest) {
    const arr = next[dest] ?? [];
    // Followers sharing the dragged card's cell sit right below it; elsewhere
    // they join the bottom of the stack.
    const at = dest === targetC ? arr.indexOf(activeId) + 1 : arr.length;
    next[dest] = [...arr.slice(0, at), ...byDest[dest], ...arr.slice(at)];
  }
  return next;
}
