import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { actorFrom, notDeleted, stampInsert, stampUpdate } from "@/lib/safety";

export async function GET() {
  const sb = getServiceClient();
  const { data, error } = await notDeleted(sb.from("cards").select("*")).order(
    "position",
    { ascending: true }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const actor = actorFrom(req);
  const sb = getServiceClient();
  const fields = {
    title: body.title ?? "",
    body: body.body ?? "",
    category: body.category,
    col_year: body.col_year,
    col_month: body.col_month,
    col_half: body.col_half,
    span: body.span ?? 1,
    value: body.value ?? 0,
    position: body.position ?? 0,
    status: body.status ?? "normal",
    tray: body.tray ?? false,
  };

  // Undo of a delete re-posts the card with its old id. The row still exists
  // (soft-deleted), so revive it in place instead of inserting a duplicate id.
  if (body.id) {
    const { data: revived, error: reviveError } = await sb
      .from("cards")
      .update(
        stampUpdate(
          { ...fields, deleted_at: null, updated_at: new Date().toISOString() },
          actor
        )
      )
      .eq("id", body.id)
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
    .insert(stampInsert({ ...(body.id ? { id: body.id } : {}), ...fields }, actor))
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}
