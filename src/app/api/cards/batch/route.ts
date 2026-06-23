import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

// Persist a set of cell/position changes after a drag, in one round trip.
export async function POST(req: NextRequest) {
  const { updates } = await req.json();
  if (!Array.isArray(updates)) {
    return NextResponse.json({ error: "updates[] required" }, { status: 400 });
  }
  const sb = getServiceClient();
  const stamp = new Date().toISOString();
  await Promise.all(
    updates.map((u: Record<string, unknown>) =>
      sb
        .from("cards")
        .update({
          category: u.category,
          col_year: u.col_year,
          col_month: u.col_month,
          col_half: u.col_half,
          position: u.position,
          updated_at: stamp,
        })
        .eq("id", u.id as string)
    )
  );
  return NextResponse.json({ ok: true });
}
