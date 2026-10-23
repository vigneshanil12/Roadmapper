import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { safeEqual } from "@/lib/safety";

// Full read-only export for the nightly snapshot job (.github/workflows/
// snapshot.yml) and, later, agents reading the roadmap. Auth is a bearer
// EXPORT_TOKEN, not the board cookie; unset token = always 401 (fails closed).
// Includes soft-deleted rows so a snapshot is a complete restore point.
// Shape is a contract — see README → Data safety before changing it.

const PAGE = 1000; // PostgREST's default max rows per request

type Sb = ReturnType<typeof getServiceClient>;

async function all(sb: Sb, table: string, order: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select("*")
      .order(order, { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function GET(req: NextRequest) {
  const expected = process.env.EXPORT_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!expected || !token || !safeEqual(token, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sb = getServiceClient();
    const [cards, comments, settings] = await Promise.all([
      all(sb, "cards", "created_at"),
      all(sb, "comments", "created_at"),
      all(sb, "settings", "id"),
    ]);
    const deleted = (rows: unknown[]) =>
      rows.filter((r) => (r as { deleted_at?: string | null }).deleted_at).length;
    return NextResponse.json(
      {
        schema: "roadmapper-export/1",
        exported_at: new Date().toISOString(),
        counts: {
          cards: cards.length,
          cards_deleted: deleted(cards),
          comments: comments.length,
          comments_deleted: deleted(comments),
          settings: settings.length,
        },
        cards,
        comments,
        settings,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
