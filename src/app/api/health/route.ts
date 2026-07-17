import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

// Unauthenticated liveness probe. Runs a tiny DB query so scheduled pings
// (see .github/workflows/keepalive.yml) count as Supabase activity and keep
// the free-tier project from auto-pausing after 7 idle days.
export async function GET() {
  try {
    const sb = getServiceClient();
    const { error } = await sb
      .from("cards")
      .select("id", { count: "exact", head: true });
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
