import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import { invalid, validateCard } from "@/lib/validate";
import { actorFrom, softDeletePatch, stampUpdate } from "@/lib/safety";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(req, "editor");
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const v = validateCard(await req.json().catch(() => null), "patch");
  if (!v.ok) return NextResponse.json(invalid(v), { status: 400 });
  const patch: Record<string, unknown> = { ...v.value, updated_at: new Date().toISOString() };

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
