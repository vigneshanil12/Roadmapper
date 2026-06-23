import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET() {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("cards")
    .select("*")
    .order("position", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("cards")
    .insert({
      title: body.title ?? "",
      body: body.body ?? "",
      category: body.category,
      col_year: body.col_year,
      col_month: body.col_month,
      col_half: body.col_half,
      position: body.position ?? 0,
      status: body.status ?? "normal",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}
