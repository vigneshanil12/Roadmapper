import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { safeEqual, stampInsert, stampUpdate } from "@/lib/safety";
import {
  AGENT_LIMITS,
  AGENT_NAME,
  agentActor,
  checkRow,
  planRow,
  tierOf,
  uuid5,
  type AgentRow,
  type LiveCard,
  type Plan,
} from "@/lib/agent";

// Agent proposal lane (R3). Called only by the ops repo's roadmap-apply Action
// (scripts/roadmap_apply.py, no LLM). Auth = bearer AGENT_APPLY_TOKEN — its own
// secret, separate from the export token; unset = always 401 (fails closed). No
// board cookie, so the route scan exempts `agent/` like `export/`.
// Rules live in src/lib/agent.ts. Body:
//   { agent: "releases", dry_run?: boolean, rows: AgentRow[] }   (≤ 25 rows)
// Answer: { results: [{ id, tier, result: applied|noop|failed|would_apply, card_id?, comment_id?, error? }] }

const COMMENT_COLOR = "#64748b";

export async function POST(req: NextRequest) {
  const expected = process.env.AGENT_APPLY_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!expected || !token || !safeEqual(token, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { agent?: unknown; dry_run?: unknown; rows?: unknown }
    | null;
  const agent = typeof body?.agent === "string" ? body.agent : "";
  if (!AGENT_NAME.test(agent)) return NextResponse.json({ error: "agent name required (a-z, 0-9, -)" }, { status: 400 });
  if (!Array.isArray(body?.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "rows required" }, { status: 400 });
  }
  if (body.rows.length > AGENT_LIMITS.rowsPerCall) {
    return NextResponse.json({ error: `max ${AGENT_LIMITS.rowsPerCall} rows per call` }, { status: 400 });
  }
  const dry = body.dry_run === true;
  const actor = agentActor(agent);
  const sb = getServiceClient();
  const results: Record<string, unknown>[] = [];

  for (const raw of body.rows as AgentRow[]) {
    const id = typeof raw?.id === "string" ? raw.id : "?";
    const tier = tierOf(String(raw?.op), raw?.payload);
    const shapeErr = checkRow(raw);
    if (shapeErr) {
      results.push({ id, tier, result: "failed", error: shapeErr });
      continue;
    }
    try {
      // Load what the plan needs: the target card (or the would-be created
      // card, deleted rows included so a deleted card is never revived) and,
      // for a comment, the would-be comment.
      const cardId = raw.op === "create_card" ? uuid5(raw.id) : raw.card_id!;
      const { data: card, error: cErr } = await sb.from("cards").select("*").eq("id", cardId).maybeSingle();
      if (cErr) throw new Error(cErr.message);
      let comment = null;
      if (raw.op === "comment") {
        const { data, error } = await sb.from("comments").select("id, deleted_at").eq("id", uuid5(raw.id)).maybeSingle();
        if (error) throw new Error(error.message);
        comment = data;
      }
      const plan: Plan = planRow(raw, (card as LiveCard | null) ?? null, comment);
      results.push({ id, tier, ...(await run(sb, plan, actor, dry)) });
    } catch (e) {
      results.push({ id, tier, result: "failed", error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return NextResponse.json({ dry_run: dry, results }, { headers: { "Cache-Control": "no-store" } });
}

type Sb = ReturnType<typeof getServiceClient>;

async function run(sb: Sb, plan: Plan, actor: string, dry: boolean): Promise<Record<string, unknown>> {
  if (plan.kind === "fail") return { result: "failed", error: plan.error };
  if (plan.kind === "noop") return { result: "noop", card_id: plan.id, note: plan.why };
  if (dry) {
    return plan.kind === "insert_comment"
      ? { result: "would_apply", comment_id: plan.id, card_id: plan.card_id }
      : { result: "would_apply", card_id: plan.id, fields: plan.fields };
  }

  if (plan.kind === "insert_card") {
    // New cards go to the bottom of their cell (or the tray) so they never
    // push a person's card down.
    let q = sb.from("cards").select("position").is("deleted_at", null).eq("tray", !!plan.fields.tray);
    if (!plan.fields.tray) {
      q = q
        .eq("category", plan.fields.category!)
        .eq("col_year", plan.fields.col_year!)
        .eq("col_month", plan.fields.col_month!)
        .eq("col_half", plan.fields.col_half!);
    }
    const { data: top } = await q.order("position", { ascending: false }).limit(1);
    const position = Math.min(10000, ((top?.[0]?.position as number | undefined) ?? -1) + 1);
    const { error } = await sb.from("cards").insert(stampInsert({ id: plan.id, ...plan.fields, position }, actor));
    if (error) return { result: "failed", error: error.message };
    return { result: "applied", card_id: plan.id };
  }

  if (plan.kind === "insert_comment") {
    const { error } = await sb.from("comments").insert(
      stampInsert(
        {
          id: plan.id,
          card_id: plan.card_id,
          author_name: actor,
          author_role: "editor",
          author_color: COMMENT_COLOR,
          body: plan.body,
        },
        actor
      )
    );
    if (error) return { result: "failed", error: error.message };
    return { result: "applied", comment_id: plan.id, card_id: plan.card_id };
  }

  // update_card: only a live card is ever updated.
  const { data, error } = await sb
    .from("cards")
    .update(stampUpdate({ ...plan.fields }, actor))
    .eq("id", plan.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { result: "failed", error: error.message };
  if (!data) return { result: "failed", error: "card was deleted meanwhile" };
  return { result: "applied", card_id: plan.id, fields: plan.fields };
}
