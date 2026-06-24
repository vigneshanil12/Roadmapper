import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

// A session is "here" if it sent a heartbeat in the last 15s.
const ACTIVE_WINDOW_MS = 15_000;
// Rows older than this are dead sessions; cleaned up lazily on each heartbeat.
const STALE_MS = 60_000;

// List sessions currently present.
export async function GET() {
  const sb = getServiceClient();
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
  const { data, error } = await sb
    .from("presence")
    .select("id, name, color, last_seen")
    .gte("last_seen", since)
    .order("last_seen", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}

// Heartbeat: upsert this session's row with a fresh timestamp.
export async function POST(req: NextRequest) {
  const { id, name, color } = await req.json().catch(() => ({}));
  if (!id || !name || !color) {
    return NextResponse.json({ error: "id, name, color required" }, { status: 400 });
  }
  const sb = getServiceClient();
  const now = new Date().toISOString();
  const { error } = await sb
    .from("presence")
    .upsert({ id, name, color, last_seen: now }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Lazy cleanup of long-dead rows so the table stays small.
  const stale = new Date(Date.now() - STALE_MS).toISOString();
  await sb.from("presence").delete().lt("last_seen", stale);

  return NextResponse.json({ ok: true });
}

// Explicit leave (sent on tab close via sendBeacon / logout).
export async function DELETE(req: NextRequest) {
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sb = getServiceClient();
  await sb.from("presence").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
