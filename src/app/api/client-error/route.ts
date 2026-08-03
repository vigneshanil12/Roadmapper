import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { AUTH_COOKIE, roleForToken } from "@/lib/auth";

// Crash sink for the client. The board posts here from its error boundary /
// global handlers; GET lists the recent reports for an editor to read.

function clamp(v: unknown, max: number): string | null {
  if (typeof v !== "string" || !v) return null;
  return v.length > max ? v.slice(0, max) : v;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.message !== "string") {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  // Role comes from the cookie, never from the payload.
  const role = roleForToken(req.cookies.get(AUTH_COOKIE)?.value);
  // Cap the breadcrumb array so a runaway client can't write huge rows.
  const breadcrumbs = Array.isArray(body.breadcrumbs)
    ? body.breadcrumbs.slice(-50)
    : [];

  const sb = getServiceClient();
  const { error } = await sb.from("client_errors").insert({
    message: clamp(body.message, 1000),
    stack: clamp(body.stack, 8000),
    component_stack: clamp(body.component_stack, 8000),
    breadcrumbs,
    url: clamp(body.url, 500),
    user_agent: clamp(body.user_agent, 500),
    user_name: clamp(body.user_name, 100),
    role: role ?? "unknown",
    session_id: clamp(body.session_id, 100),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Recent crashes, newest first. Editors only — the payload carries stacks and
// session ids.
export async function GET(req: NextRequest) {
  const role = roleForToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (role !== "editor") {
    return NextResponse.json({ error: "Editors only" }, { status: 403 });
  }
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") ?? 20) || 20,
    100
  );
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("client_errors")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ errors: data });
}
