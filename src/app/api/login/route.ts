import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  NAME_COOKIE,
  ROLE_COOKIE,
  isEditorName,
  isValidEditorPassword,
  isValidGuestPassword,
  tokenForRole,
  type Role,
} from "@/lib/auth";

// Whimsical interstellar/planet handles assigned to guests so each view-only
// visitor gets a recognizable name on the presence avatars and cursor.
const GUEST_NAMES = [
  "Gargantua", "Endurance", "Miller's Planet", "Mann's Planet", "Edmunds",
  "Kepler-22b", "TRAPPIST-1e", "Proxima b", "Tatooine", "Arrakis",
  "Pandora", "Europa", "Titan", "Kepler-452b", "Cooper Station",
  "Lazarus", "TARS", "CASE", "Wolf 1061c", "Osiris",
];
function randomGuestName(): string {
  return GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)];
}

const MONTH = 60 * 60 * 24 * 30;

export async function POST(req: NextRequest) {
  const { password, name } = await req
    .json()
    .catch(() => ({ password: "", name: "" }));
  const pw = String(password ?? "");
  const who = String(name ?? "").trim();

  let role: Role;
  let display: string;
  // An editor name requires the editor password; everyone else is a guest and
  // requires the guest password, then gets a random interstellar handle.
  if (isEditorName(who)) {
    if (!isValidEditorPassword(pw)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    role = "editor";
    display = who;
  } else {
    if (!isValidGuestPassword(pw)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    role = "guest";
    display = randomGuestName();
  }

  const res = NextResponse.json({ ok: true, role });
  const secure = process.env.NODE_ENV === "production";
  // Auth token (role-bound, unforgeable) — httpOnly.
  res.cookies.set(AUTH_COOKIE, tokenForRole(role), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: MONTH,
  });
  // Role + name are UI hints (readable by client JS). Tampering with them only
  // changes what UI renders — writes are still gated server-side on the token.
  res.cookies.set(ROLE_COOKIE, role, {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: MONTH,
  });
  res.cookies.set(NAME_COOKIE, display, {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: MONTH,
  });
  return res;
}
