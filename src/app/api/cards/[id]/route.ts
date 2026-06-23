import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

const FIELDS = [
  "title",
  "body",
  "category",
  "col_year",
  "col_month",
  "col_half",
  "span",
  "position",
  "status",
  "tray",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of FIELDS) if (f in body) patch[f] = body[f];

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("cards")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getServiceClient();
  const { error } = await sb.from("cards").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
