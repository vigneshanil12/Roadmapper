import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import { actorFrom } from "@/lib/safety";

// Shared app settings, currently just the AI assistant's product context. Single
// row (id = 1) so the context is set once and shared across all editors.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, "any");
  if (auth instanceof Response) return auth;

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("settings")
    .select("product_context")
    .eq("id", 1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product_context: data?.product_context ?? "" });
}

// Editor-only: the context steers everyone's assistant answers, so guests can't
// rewrite it.
export async function PUT(req: NextRequest) {
  const auth = requireRole(req, "editor");
  if (auth instanceof Response) return auth;
  const { product_context } = await req.json().catch(() => ({}));
  const sb = getServiceClient();
  const { error } = await sb.from("settings").upsert({
    id: 1,
    product_context: String(product_context ?? ""),
    updated_at: new Date().toISOString(),
    updated_by: actorFrom(req),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
