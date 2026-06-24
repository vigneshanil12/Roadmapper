"use client";

// Client-side identity for presence. There is no real per-user auth yet (single
// shared password), so a "user" = one browser session: a stable random id in
// localStorage, a display name (from the rm_name cookie set at login, else a
// generated Guest name), and a color derived from the id. This is the stepping
// stone to the real 3-editor identity model later.

export interface Identity {
  id: string;
  name: string;
  color: string;
}

const ID_KEY = "rm_session_id";

// Distinct, legible avatar colors.
const PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed",
  "#db2777", "#0891b2", "#ca8a04", "#4f46e5", "#059669",
];

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function getIdentity(): Identity {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
  }
  const name = readCookie("rm_name") || `Guest-${id.slice(0, 4)}`;
  return { id, name, color: colorFor(id) };
}

// Role hint from the rm_role cookie (UI only; writes are gated server-side).
export function getRole(): "editor" | "guest" {
  return readCookie("rm_role") === "editor" ? "editor" : "guest";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
