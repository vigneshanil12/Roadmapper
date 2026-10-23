// Regression tests for the board's drag container math (src/lib/drag.ts).
// Run with: npm test   (Node strips the TypeScript types on import.)
//
// Two production crashes came out of this code, both from mixing a stale
// snapshot with a fresh one during a drag. The cases below pin the invariants
// that broke: never duplicate an id across containers, never act on indices
// that don't exist in the array being edited.

import test from "node:test";
import assert from "node:assert/strict";
import {
  moveBetween,
  reorderWithin,
  findContainerIn,
  resolveGridCollision,
  overflowReach,
  reserveFor,
  planGroupMove,
  applyGroupMove,
  anchorPoint,
} from "../src/lib/drag.ts";

const TRAY = "tray";
const A = "features|2026|8|0";
const B = "features|2026|9|0";

const ids = (containers) => Object.values(containers).flat();
const assertNoDuplicates = (containers) => {
  const all = ids(containers);
  assert.equal(all.length, new Set(all).size, "an id appears in two containers");
};

test("moveBetween: card into another container", () => {
  assert.deepEqual(moveBetween({ [A]: ["c1", "c2"], [B]: [] }, "c1", B), {
    [A]: ["c2"],
    [B]: ["c1"],
  });
});

test("moveBetween: over a sibling card inserts at that index", () => {
  assert.deepEqual(moveBetween({ [A]: ["c1"], [B]: ["x", "y"] }, "c1", "y"), {
    [A]: [],
    [B]: ["x", "c1", "y"],
  });
});

test("moveBetween: same container returns prev unchanged", () => {
  const prev = { [A]: ["c1", "c2"] };
  assert.equal(moveBetween(prev, "c1", "c2"), prev);
});

test("moveBetween: applying twice does not duplicate the id", () => {
  // onDragOver fires faster than React commits, so the same move can be queued
  // twice. A duplicate id across two SortableContexts crashes dnd-kit.
  const once = moveBetween({ [A]: ["c1"], [B]: [] }, "c1", B);
  const twice = moveBetween(once, "c1", B);
  assert.deepEqual(twice, { [A]: [], [B]: ["c1"] });
  assertNoDuplicates(twice);
});

test("moveBetween: unknown id is a no-op", () => {
  const prev = { [A]: ["c1"], [B]: [] };
  assert.equal(moveBetween(prev, "ghost", B), prev);
});

test("moveBetween: into the parking lot", () => {
  assert.deepEqual(moveBetween({ [A]: ["c1"], [TRAY]: [] }, "c1", TRAY), {
    [A]: [],
    [TRAY]: ["c1"],
  });
});

test("moveBetween: stays consistent after a poll snapshot clobbers items", () => {
  const serverSnapshot = { [A]: ["c1"], [B]: [] };
  const after = moveBetween(serverSnapshot, "c1", B);
  assert.deepEqual(after, { [A]: [], [B]: ["c1"] });
  assertNoDuplicates(after);
});

test("reorderWithin: moves a card down and up", () => {
  assert.deepEqual(reorderWithin({ [A]: ["c1", "c2", "c3"] }, "c1", "c3"), {
    [A]: ["c2", "c3", "c1"],
  });
  assert.deepEqual(reorderWithin({ [A]: ["c1", "c2", "c3"] }, "c3", "c1"), {
    [A]: ["c3", "c1", "c2"],
  });
});

test("reorderWithin: dropped on the container itself is a no-op", () => {
  const prev = { [A]: ["c1", "c2"] };
  assert.equal(reorderWithin(prev, "c1", A), prev);
});

test("reorderWithin: cross-container drop is left to moveBetween", () => {
  const prev = { [A]: ["c1"], [B]: ["x"] };
  assert.equal(reorderWithin(prev, "c1", "x"), prev);
});

test("reorderWithin: ids missing from the array are a no-op", () => {
  // Previously these indices came from a lagging ref and were applied to a
  // different array: index -1 spliced out the LAST card, or spliced `undefined`
  // into an empty container.
  const stale = { [A]: ["c2", "c3"] };
  assert.equal(reorderWithin(stale, "c1", "c3"), stale);
  const empty = { [A]: [] };
  assert.equal(reorderWithin(empty, "c1", "c2"), empty);
  assert.ok(!ids(reorderWithin(empty, "c1", "c2")).includes(undefined));
});

test("findContainerIn: card, container, and unknown ids", () => {
  assert.equal(findContainerIn({ [A]: ["c1"] }, "c1"), A);
  assert.equal(findContainerIn({ [A]: [] }, A), A);
  assert.equal(findContainerIn({ [A]: [] }, "nope"), undefined);
});

// Grid collision: a span=2 card in the left cell overhangs the right cell, so
// its droppable rect wins closestCorners inside the right column. The cell the
// pointer is in must decide the container, or the right cell is unreachable.
test("resolveGridCollision: wide card from another cell is ignored", () => {
  assert.equal(resolveGridCollision({ [A]: ["wide"], [B]: [] }, B, ["wide"]), B);
});

test("resolveGridCollision: card in the pointer's own cell wins (insertion index)", () => {
  assert.equal(
    resolveGridCollision({ [A]: ["wide"], [B]: ["x"] }, B, ["wide", "x"]),
    "x"
  );
});

test("resolveGridCollision: empty cell falls back to the cell id", () => {
  assert.equal(resolveGridCollision({ [A]: ["wide"] }, B, ["wide"]), B);
});

// Wide cards (span > 2): each cell reports how deep its wide cards reach into
// every column they cover, and a cell reserves the deepest overhang from the left.
test("overflowReach: each card covers span-1 columns", () => {
  assert.deepEqual(overflowReach([]), []);
  assert.deepEqual(overflowReach([{ bottom: 50, span: 2 }]), [50]);
  assert.deepEqual(
    overflowReach([
      { bottom: 50, span: 4 },
      { bottom: 120, span: 2 },
    ]),
    [120, 50, 50]
  );
});

test("reserveFor: overhang from two and three cells away", () => {
  const row = ["c0", "c1", "c2", "c3", "c4"];
  const overflow = { c0: [80, 80, 80], c1: [40] };
  assert.equal(reserveFor(overflow, row, 0), 0);
  assert.equal(reserveFor(overflow, row, 1), 80);
  assert.equal(reserveFor(overflow, row, 2), 80);
  assert.equal(reserveFor(overflow, row, 3), 80);
  assert.equal(reserveFor(overflow, row, 4), 0);
  assert.equal(reserveFor({ c1: [40] }, row, 2), 40);
});

// Group move: followers shift by the dragged card's row/column delta.
const GRID = {
  cats: ["growth", "features"],
  cols: ["2026|8|0", "2026|8|1", "2026|9|0"],
  tray: TRAY,
};
const g = (cat, col) => `${GRID.cats[cat]}|${GRID.cols[col]}`;
const emptyGrid = () => {
  const m = { [TRAY]: [] };
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) m[g(r, c)] = [];
  return m;
};

const move = (prev, ids, originC, targetC, overId = null) =>
  applyGroupMove(prev, planGroupMove(prev, ids, originC, targetC, GRID), ids[0], overId);

test("group move: every card keeps its offset from the grabbed card", () => {
  const prev = { ...emptyGrid(), [g(0, 0)]: ["a"], [g(1, 0)]: ["b"] };
  const next = move(prev, ["a", "b"], g(0, 0), g(0, 1));
  assert.deepEqual(next[g(0, 1)], ["a"]);
  assert.deepEqual(next[g(1, 1)], ["b"]);
  assert.deepEqual(next[g(0, 0)], []);
  assertNoDuplicates(next);
});

test("group move: delta is clamped for the grabbed card too", () => {
  // a aims +2 columns but b in column 1 can only go +1: the whole group,
  // a included, moves +1 so the shape holds.
  const prev = { ...emptyGrid(), [g(0, 0)]: ["a"], [g(1, 1)]: ["b"] };
  const next = move(prev, ["a", "b"], g(0, 0), g(0, 2));
  assert.deepEqual(next[g(0, 1)], ["a"]);
  assert.deepEqual(next[g(1, 2)], ["b"]);
  assertNoDuplicates(next);
});

test("group move: dropping back in the origin cell changes nothing", () => {
  // Regression: the grabbed card used to be pulled out and re-appended,
  // scrambling the order of its cell.
  const prev = { ...emptyGrid(), [g(0, 0)]: ["a", "x", "b"] };
  assert.equal(planGroupMove(prev, ["a", "b"], g(0, 0), g(0, 0), GRID), null);
  assert.equal(move(prev, ["a", "b"], g(0, 0), g(0, 0)), prev);
});

test("group move: cards keep their own order, inserted as a block before overId", () => {
  // Grabbing the middle card must not pull it above the others.
  const prev = { ...emptyGrid(), [g(0, 0)]: ["b", "a", "c"], [g(0, 1)]: ["x", "y"] };
  const next = move(prev, ["a", "c", "b"], g(0, 0), g(0, 1), "y");
  assert.deepEqual(next[g(0, 1)], ["x", "b", "a", "c", "y"]);
  assert.deepEqual(next[g(0, 0)], []);
});

test("group move: parking lot takes the whole group", () => {
  const prev = { ...emptyGrid(), [g(0, 0)]: ["a"], [g(1, 2)]: ["b"] };
  const next = move(prev, ["a", "b"], g(0, 0), TRAY);
  assert.deepEqual(next[TRAY], ["a", "b"]);
  assertNoDuplicates(next);
});

test("group move: unknown ids are skipped", () => {
  const prev = { ...emptyGrid(), [g(0, 0)]: ["a"] };
  const next = move(prev, ["a", "deleted"], g(0, 0), g(0, 1));
  assert.deepEqual(next[g(0, 1)], ["a"]);
  assert.equal(planGroupMove(prev, ["ghost"], g(0, 0), g(0, 1), GRID), null);
});

test("anchorPoint: wide card anchors on its first column, not the cursor", () => {
  // span=2 card (448px) grabbed near its right edge.
  const rect = { left: 100, top: 50, width: 436, height: 80 };
  assert.deepEqual(anchorPoint(rect, { x: 500, y: 90 }, 224), { x: 212, y: 90 });
  // Narrow card: its own centre.
  assert.deepEqual(anchorPoint({ left: 100, top: 50, width: 212, height: 80 }, null, 224), {
    x: 206,
    y: 90,
  });
});
