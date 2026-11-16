import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import { invalid, validateCard } from "@/lib/validate";
import { actorFrom, notDeleted, stampInsert, stampUpdate } from "@/lib/safety";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, "any");
  if (auth instanceof Response) return auth;
  const sb = getServiceClient();
  const { data, error } = await notDeleted(sb.from("cards").select("*")).order(
    "position",
    { ascending: true }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: data });
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, "editor");
  if (auth instanceof Response) return auth;
  const v = validateCard(await req.json().catch(() => null), "create");
  if (!v.ok) return NextResponse.json(invalid(v), { status: 400 });
  const { id, ...fields } = v.value;
  const actor = actorFrom(req);
  const sb = getServiceClient();

  // Undo of a delete re-posts the card with its old id. The row still exists
  // (soft-deleted), so revive it in place instead of inserting a duplicate id.
  if (id) {
    const { data: revived, error: reviveError } = await sb
      .from("cards")
      .update(
        stampUpdate(
          { ...fields, deleted_at: null, updated_at: new Date().toISOString() },
          actor
        )
      )
      .eq("id", id)
      .not("deleted_at", "is", null)
      .select()
      .maybeSingle();
    if (reviveError) {
      return NextResponse.json({ error: reviveError.message }, { status: 500 });
    }
    if (revived) return NextResponse.json({ card: revived });
  }

  const { data, error } = await sb
    .from("cards")
    .insert(stampInsert({ ...(id ? { id } : {}), ...fields }, actor))
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}
