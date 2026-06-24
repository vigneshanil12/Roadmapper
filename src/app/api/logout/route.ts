import { NextResponse } from "next/server";
import { AUTH_COOKIE, NAME_COOKIE, ROLE_COOKIE } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  for (const c of [AUTH_COOKIE, ROLE_COOKIE, NAME_COOKIE]) {
    res.cookies.set(c, "", { path: "/", maxAge: 0 });
  }
  return res;
}
