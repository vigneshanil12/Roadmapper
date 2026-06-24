import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { AUTH_COOKIE, NAME_COOKIE, roleForToken } from "@/lib/auth";

// Delete a single comment. Editors can delete any; guests can delete only their
// own (matched on the display name carried in the rm_name cookie).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = roleForToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const { error } = await sb.from("comments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
