import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, roleForToken } from "@/lib/auth";

// First auth layer. Every API route also calls requireRole() itself
// (src/lib/auth.ts), so nothing depends on this proxy alone.
// Gate everything except the login page, the login API, and static assets.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/health") ||
    // Bearer-token export for the nightly snapshot job; the route checks the
    // token itself and fails closed when EXPORT_TOKEN is unset.
    pathname === "/api/export" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const role = roleForToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (!role) {
    // API callers get JSON, never a redirect: fetch() follows a redirect to the
    // login page, gets HTML with a 200, and a write would look saved.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Signed out" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Guests are view-only: block any mutation of cards server-side, regardless of
  // what the client UI lets them attempt.
  if (
    role === "guest" &&
    pathname.startsWith("/api/cards") &&
    req.method !== "GET"
  ) {
    return NextResponse.json({ error: "View-only access" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
