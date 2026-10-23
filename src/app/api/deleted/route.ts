import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { AUTH_COOKIE, roleForToken } from "@/lib/auth";
import { deletedSince } from "@/lib/safety";

// Editor-only: cards and comments soft-deleted in the last 30 days, newest
// first, for the "Recently deleted" panel. Older ones are still in the table
// and in row_history; restore those by SQL (see README → Data safety).
export async function GET(req: NextRequest) {
  const role = roleForToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (role !== "editor") {
    return NextResponse.json({ error: "Editors only" }, { status: 403 });
  }
  const since = deletedSince();
  const sb = getServiceClient();
  const [cardsRes, commentsRes] = await Promise.all([
    sb
      .from("cards")
      .select("id, title, category, status, tray, deleted_at, updated_by")
      .gte("deleted_at", since)
      .order("deleted_at", { ascending: false })
      .limit(200),
    sb
      .from("comments")
      .select("id, card_id, author_name, body, deleted_at, updated_by")
      .gte("deleted_at", since)
      .order("deleted_at", { ascending: false })
      .limit(200),
  ]);
  const error = cardsRes.error ?? commentsRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: cardsRes.data, comments: commentsRes.data });
}
