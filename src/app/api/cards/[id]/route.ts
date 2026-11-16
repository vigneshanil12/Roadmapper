import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import { actorFrom, softDeletePatch, stampUpdate } from "@/lib/safety";

const FIELDS = [
  "title",
  "body",
  "category",
  "col_year",
  "col_month",
  "col_half",
  "span",
  "value",
  "position",
  "status",
  "tray",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(req, "editor");
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of FIELDS) if (f in body) patch[f] = body[f];

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("cards")
    .update(stampUpdate(patch, actorFrom(req)))
    .eq("id", id)
    // Never edit (or implicitly revive) a soft-deleted card.
    .is("deleted_at", null)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Card not found (deleted?)" }, { status: 404 });
  return NextResponse.json({ card: data });
}

// Soft delete: the card is hidden, not removed, so it (and its comment thread)
// can be restored from "Recently deleted".
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(req, "editor");
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const sb = getServiceClient();
  const { error } = await sb
    .from("cards")
    .update(softDeletePatch(actorFrom(req)))
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
