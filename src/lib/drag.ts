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
