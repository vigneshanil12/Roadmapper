import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import { actorFrom } from "@/lib/safety";

const MAX_UPDATES = 500;

// Persist a set of cell/position changes after a drag, in one round trip.
// Every row's result is checked: a DB error on any row → 500 with the failed
// ids, so the client can tell the user. Soft-deleted cards are skipped (never
// revived by a move) and reported in `skipped`.
export async function POST(req: NextRequest) {
  const auth = requireRole(req, "editor");
  if (auth instanceof Response) return auth;
  const { updates } = await req.json().catch(() => ({}));
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "updates[] required", field: "updates" }, { status: 400 });
  }
  if (updates.length > MAX_UPDATES) {
    return NextResponse.json({ error: `max ${MAX_UPDATES} updates`, field: "updates" }, { status: 400 });
  }
  for (const u of updates) {
    if (!u || typeof u !== "object" || typeof u.id !== "string" || !u.id) {
      return NextResponse.json({ error: "each update needs an id", field: "id" }, { status: 400 });
    }
  }
  const sb = getServiceClient();
  const stamp = new Date().toISOString();
  const actor = actorFrom(req);
  const results = await Promise.all(
    updates.map((u: Record<string, unknown>) =>
      sb
        .from("cards")
        .update({
          category: u.category,
          col_year: u.col_year,
          col_month: u.col_month,
          col_half: u.col_half,
          position: u.position,
          tray: u.tray ?? false,
          updated_at: stamp,
          updated_by: actor,
        })
        .eq("id", u.id as string)
        .is("deleted_at", null)
        .select("id")
    )
  );
  const failed: string[] = [];
  const skipped: string[] = [];
  results.forEach((r, i) => {
    const id = updates[i].id as string;
    if (r.error) failed.push(id);
    else if (!r.data?.length) skipped.push(id);
  });
  if (failed.length) {
    return NextResponse.json(
      { ok: false, error: `${failed.length} of ${updates.length} cards not saved`, failed, skipped },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, updated: updates.length - skipped.length, skipped });
}
