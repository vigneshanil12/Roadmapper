import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { AUTH_COOKIE, roleForToken } from "@/lib/auth";
import { actorFrom, restorePatch } from "@/lib/safety";

// Editor-only: bring a soft-deleted card back. Its comments were never touched
// by the card delete, so the thread comes back with it.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = roleForToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (role !== "editor") {
    return NextResponse.json({ error: "Editors only" }, { status: 403 });
  }
  const { id } = await params;
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("cards")
    .update(restorePatch(actorFrom(req)))
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not deleted" }, { status: 404 });
  return NextResponse.json({ card: data });
}
