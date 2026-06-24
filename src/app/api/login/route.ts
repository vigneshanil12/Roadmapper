import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, isValidPassword, sessionToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password, name } = await req.json().catch(() => ({ password: "" }));
  if (!isValidPassword(password ?? "")) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  // Display name for presence avatars. Readable by client JS (not httpOnly) and
  // carries no auth weight — it only labels the "who's here" indicator.
  const display = String(name ?? "").trim().slice(0, 40);
  if (display) {
    res.cookies.set("rm_name", display, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}
