import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { NAME_COOKIE, requireRole } from "@/lib/auth";
import { actorFrom, notDeleted, softDeletePatch, stampInsert } from "@/lib/safety";

// All comments, oldest first. The board groups them by card_id client-side and
// polls this on an interval so threads stay live across users.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, "any");
  if (auth instanceof Response) return auth;
  const sb = getServiceClient();
  const { data, error } = await notDeleted(sb.from("comments").select("*")).order(
    "created_at",
    { ascending: true }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data });
}

// Post a comment. Author role is derived from the auth token (unforgeable);
// display name + avatar color are client hints (same trust model as presence).
export async function POST(req: NextRequest) {
  const auth = requireRole(req, "any");
  if (auth instanceof Response) return auth;
  const { role } = auth;

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
    .insert(
      stampInsert(
        {
          card_id,
          author_name: author,
          author_role: role,
          author_color: String(color ?? "#64748b"),
          body: text,
        },
        actorFrom(req)
      )
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data });
}

// Resolve a thread: soft-delete every live comment on a card (restorable from
// "Recently deleted"). Editor-only — the action
// clears the thread for everyone, so guests can't wipe it.
export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, "editor");
  if (auth instanceof Response) return auth;
  const cardId = req.nextUrl.searchParams.get("card_id");
  if (!cardId) return NextResponse.json({ error: "card_id required" }, { status: 400 });

  const sb = getServiceClient();
  const { error } = await sb
    .from("comments")
    .update(softDeletePatch(actorFrom(req)))
    .eq("card_id", cardId)
    .is("deleted_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
