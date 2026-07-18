// Server-side helpers for the AI planning assistant. Turns the raw card rows
// into a compact, signal-rich text snapshot the model can reason over, and
// frames the model as a product-planning advisor seeded with the team's own
// product context. Read-only: the assistant answers questions, never mutates.

import type { Card, CategoryId, Comment } from "./types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const CAT_LABEL: Record<CategoryId, string> = {
  growth: "Growth & User Delight",
  partner: "Partner Convenience",
  features: "New Features",
  bugs: "Bugs",
};

const CAT_ORDER: CategoryId[] = ["growth", "partner", "features", "bugs"];

function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

// One-line date like "Jul 12" for comment timestamps.
function shortDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function clip(s: string, max: number): string {
  const t = s.trim().replace(/\s*\n+\s*/g, "; ");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

// Render a card's discussion thread inline. Comments often carry the real
// signal (blockers, scope debates, QA findings), so the last few go to the
// model — clipped hard to keep the snapshot cheap.
function commentLines(cardId: string, byCard: Map<string, Comment[]>): string[] {
  const cs = byCard.get(cardId);
  if (!cs?.length) return [];
  const recent = cs.slice(-3);
  const omitted = cs.length - recent.length;
  const lines = recent.map(
    (c) =>
      `      ↳ ${c.author_name} (${c.author_role}, ${shortDate(c.created_at)}): "${clip(c.body, 140)}"`
  );
  if (omitted > 0) lines.unshift(`      ↳ (${omitted} earlier comment(s) omitted)`);
  return lines;
}

// Render the whole board as structured text: a summary header with load/risk
// signals, then a month-by-month breakdown grouped by category, then any parked
// (tray) cards. Designed so the model can answer both lookup and advisory
// questions without us pre-computing the judgement.
export function buildBoardSnapshot(
  cards: Card[],
  comments: Comment[] = [],
  now = new Date()
): string {
  const curIdx = monthIndex(now.getFullYear(), now.getMonth() + 1);
  const curCycle = now.getDate() <= 15 ? 1 : 2;
  const scheduled = cards.filter((c) => !c.tray);
  const tray = cards.filter((c) => c.tray);

  // card_id -> comments, oldest first (query already sorts ascending).
  const byCard = new Map<string, Comment[]>();
  for (const cm of comments) {
    const arr = byCard.get(cm.card_id);
    if (arr) arr.push(cm);
    else byCard.set(cm.card_id, [cm]);
  }

  const byMonth = new Map<number, Card[]>();
  for (const c of scheduled) {
    const k = monthIndex(c.col_year, c.col_month);
    const arr = byMonth.get(k);
    if (arr) arr.push(c);
    else byMonth.set(k, [c]);
  }
  const keys = [...byMonth.keys()].sort((a, b) => a - b);

  // Signals for the summary header.
  const tentative = scheduled.filter((c) => c.status === "tentative").length;
  const done = scheduled.filter((c) => c.status === "done").length;
  const slipping = scheduled.filter(
    (c) => monthIndex(c.col_year, c.col_month) < curIdx && c.status !== "done"
  );
  const future = keys.filter((k) => k >= curIdx);
  let busiest = "";
  let busiestN = 0;
  for (const k of future) {
    const n = byMonth.get(k)!.length;
    if (n > busiestN) {
      busiestN = n;
      busiest = `${MONTHS[k % 12]} ${Math.floor(k / 12)}`;
    }
  }

  // Quality signals: how much bug work is scheduled vs parked, and how much of
  // the upcoming load is still tentative.
  const bugsScheduled = scheduled.filter(
    (c) => c.category === "bugs" && monthIndex(c.col_year, c.col_month) >= curIdx && c.status !== "done"
  ).length;
  const bugsParked = tray.filter((c) => c.category === "bugs").length;
  const upcoming = scheduled.filter(
    (c) => monthIndex(c.col_year, c.col_month) >= curIdx && c.status !== "done"
  );
  const upcomingTentative = upcoming.filter((c) => c.status === "tentative").length;

  const catCounts = CAT_ORDER.map((cat) => {
    const n = scheduled.filter((c) => c.category === cat).length;
    return `${CAT_LABEL[cat]} ${n}`;
  }).join(", ");

  const out: string[] = [];
  out.push(
    `Today: ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()} (currently in Cycle ${curCycle}). ` +
      `Each month has two cycles (Cycle 1 = days 1–15, Cycle 2 = 16+). ` +
      `Card status: normal, tentative (not yet committed), done. ` +
      `Value = impact estimate 0–3 (higher = more impact). ` +
      `Lines starting with ↳ are team comments on the card above them.`
  );
  out.push("");
  out.push("SUMMARY");
  out.push(`- Scheduled cards: ${scheduled.length} (${done} done, ${tentative} tentative).`);
  out.push(`- By category (all scheduled): ${catCounts}.`);
  out.push(`- Parked/unscheduled in tray: ${tray.length}.`);
  out.push(
    `- Bug load: ${bugsScheduled} open bug card(s) scheduled current/future, ${bugsParked} parked in tray.`
  );
  if (upcoming.length) {
    out.push(
      `- Upcoming commitment: ${upcomingTentative} of ${upcoming.length} current/future open card(s) are tentative.`
    );
  }
  out.push(
    busiest
      ? `- Busiest upcoming month: ${busiest} with ${busiestN} cards.`
      : `- No cards scheduled in the current or future months.`
  );
  if (slipping.length) {
    out.push(
      `- ${slipping.length} card(s) sit in a past month and are not done (possible slip): ` +
        slipping.map((c) => `"${c.title || "untitled"}"`).join(", ") +
        "."
    );
  }
  out.push("");

  for (const k of keys) {
    const y = Math.floor(k / 12);
    const m = (k % 12) + 1;
    const rel = k < curIdx ? " (PAST)" : k === curIdx ? " (CURRENT MONTH)" : "";
    const monthCards = byMonth.get(k)!;
    out.push(`## ${MONTHS[m - 1]} ${y}${rel} — ${monthCards.length} card(s)`);
    for (const cat of CAT_ORDER) {
      const cc = monthCards
        .filter((c) => c.category === cat)
        .sort((a, b) => a.col_half - b.col_half || a.position - b.position);
      if (!cc.length) continue;
      out.push(`  ${CAT_LABEL[cat]}:`);
      for (const c of cc) {
        const tags = [`Cycle ${c.col_half + 1}`];
        if (c.status !== "normal") tags.push(c.status);
        if (c.value > 0) tags.push(`value ${c.value}`);
        const slip =
          k < curIdx && c.status !== "done" ? " [UNFINISHED & PAST]" : "";
        const body = c.body.trim() ? ` — ${clip(c.body, 220)}` : "";
        out.push(`    • ${c.title || "(untitled)"} [${tags.join(", ")}]${slip}${body}`);
        out.push(...commentLines(c.id, byCard));
      }
    }
    out.push("");
  }

  if (tray.length) {
    out.push(`## Parked / unscheduled (staging tray) — ${tray.length} card(s)`);
    for (const c of tray) {
      const tags: string[] = [CAT_LABEL[c.category]];
      if (c.status !== "normal") tags.push(c.status);
      if (c.value > 0) tags.push(`value ${c.value}`);
      const body = c.body.trim() ? ` — ${clip(c.body, 220)}` : "";
      out.push(`    • ${c.title || "(untitled)"} [${tags.join(", ")}]${body}`);
      out.push(...commentLines(c.id, byCard));
    }
    out.push("");
  }

  return out.join("\n");
}

// Frame the model as a planning advisor and splice in the team's product
// context. The context blob is the biggest lever on answer quality — without it
// the model only knows card titles, not the product or the goals behind them.
export function systemPrompt(productContext: string): string {
  const ctx = productContext.trim()
    ? `\n\nPRODUCT CONTEXT (provided by the team — treat as ground truth):\n${productContext.trim()}`
    : `\n\nNo product context has been set yet. You can still reason about load, balance, and slippage from the board, but if the user asks product-strategy questions, briefly note that adding product context (mission, target users, team size, current goals) via the "Product context" field would sharpen your advice.`;

  return (
    `You are an experienced product-planning and QA advisor embedded in a team's roadmap tool. ` +
    `The roadmap is a board with four category rows — Growth & User Delight, Partner Convenience, ` +
    `New Features, and Bugs — laid out across half-month columns (two cycles per month).\n\n` +
    `You advise through two lenses:\n` +
    `- PM lens: assess whether a month looks overloaded or thin, flag slipping work, neglected ` +
    `categories, or too much tentative work; suggest what to prioritise, propose new things worth ` +
    `adding, and give a candid product outlook.\n` +
    `- QA lens: watch quality risk — a growing or parked bug backlog, bug-fix work squeezed out ` +
    `by feature pushes, feature-heavy months with no follow-up bug/polish time, and comment ` +
    `threads that hint at unresolved problems on a card.\n\n` +
    `Reason from the roadmap snapshot below and the product context. Card comment lines (↳) show ` +
    `the team's own discussion — treat them as signal about blockers, scope, and quality.\n\n` +
    `Guidelines:\n` +
    `- Be concrete and reference actual cards, months, and categories by name.\n` +
    `- Quantify load when relevant (e.g. "Cycle 1 of March has 8 cards vs ~3 average").\n` +
    `- When you make a judgement call (feasibility, capacity), state the assumption it rests on ` +
    `and ask for the missing input (team size, velocity) rather than guessing silently.\n` +
    `- Be candid about risk; don't just affirm the plan.\n` +
    `- You can only read and advise — you cannot add, move, or edit cards. If asked to make a ` +
    `change, describe exactly what to do on the board instead.\n` +
    `- Keep answers tight and skimmable. Use short paragraphs and "-" bullets; **bold** for ` +
    `emphasis is fine. No markdown tables, headings, or nested lists — the chat panel renders ` +
    `only simple lists and bold.` +
    ctx
  );
}
