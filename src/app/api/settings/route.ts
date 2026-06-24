import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { AUTH_COOKIE, roleForToken } from "@/lib/auth";

// Shared app settings, currently just the AI assistant's product context. Single
// row (id = 1) so the context is set once and shared across all editors.
export async function GET(req: NextRequest) {
  const role = roleForToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const role = roleForToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (role !== "editor") {
    return NextResponse.json({ error: "Editors only" }, { status: 403 });
  }
  const { product_context } = await req.json().catch(() => ({}));
  const sb = getServiceClient();
  const { error } = await sb.from("settings").upsert({
    id: 1,
    product_context: String(product_context ?? ""),
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
