import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { AUTH_COOKIE, NAME_COOKIE, roleForToken } from "@/lib/auth";

// All comments, oldest first. The board groups them by card_id client-side and
// polls this on an interval so threads stay live across users.
export async function GET() {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("comments")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data });
}

// Post a comment. Author role is derived from the auth token (unforgeable);
// display name + avatar color are client hints (same trust model as presence).
export async function POST(req: NextRequest) {
  const role = roleForToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { card_id, body, name, color } = await req.json().catch(() => ({}));
  const text = String(body ?? "").trim();
  if (!card_id || !text) {
    return NextResponse.json({ error: "card_id and body required" }, { status: 400 });
  }
  const author =
    String(name ?? "").trim() ||
    req.cookies.get(NAME_COOKIE)?.value ||
    "Anonymous";

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("comments")
    .insert({
      card_id,
      author_name: author,
      author_role: role,
      author_color: String(color ?? "#64748b"),
      body: text,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data });
}

// Resolve a thread: delete every comment on a card. Editor-only — the action
// clears the thread for everyone, so guests can't wipe it.
export async function DELETE(req: NextRequest) {
  const role = roleForToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (role !== "editor") {
    return NextResponse.json({ error: "Editors only" }, { status: 403 });
  }
  const cardId = req.nextUrl.searchParams.get("card_id");
  if (!cardId) return NextResponse.json({ error: "card_id required" }, { status: 400 });

  const sb = getServiceClient();
  const { error } = await sb.from("comments").delete().eq("card_id", cardId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
