import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { NAME_COOKIE, requireRole } from "@/lib/auth";
import { actorFrom, softDeletePatch } from "@/lib/safety";

// Soft-delete a single comment. Editors can delete any; guests can delete only their
// own (matched on the display name carried in the rm_name cookie).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(req, "any");
  if (auth instanceof Response) return auth;
  const { role } = auth;
  const { id } = await params;
  const sb = getServiceClient();

  if (role !== "editor") {
    const name = req.cookies.get(NAME_COOKIE)?.value ?? "";
    const { data: row } = await sb
      .from("comments")
      .select("author_name")
      .eq("id", id)
      .single();
    if (!row || row.author_name !== name) {
      return NextResponse.json({ error: "Not your comment" }, { status: 403 });
    }
  }

  const { error } = await sb
    .from("comments")
    .update(softDeletePatch(actorFrom(req)))
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
