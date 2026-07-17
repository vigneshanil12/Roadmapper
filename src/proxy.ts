import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "rm_auth";

// Derive role from which secret the cookie matches (not a tamperable field).
function roleForToken(token: string | undefined): "editor" | "guest" | null {
  if (!token) return null;
  if (token === process.env.APP_SESSION_SECRET) return "editor";
  if (token === process.env.APP_GUEST_SESSION_SECRET) return "guest";
  return null;
}

// Gate everything except the login page, the login API, and static assets.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const role = roleForToken(req.cookies.get(AUTH_COOKIE)?.value);
  if (!role) {
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
