export const AUTH_COOKIE = "rm_auth";
export const ROLE_COOKIE = "rm_role";
export const NAME_COOKIE = "rm_name";

export type Role = "editor" | "guest";

// The three people with edit access. Anyone else logs in as a view-only guest.
export const EDITORS = ["Vignesh", "Mrunal", "Samyukta"] as const;
export function isEditorName(name: string): boolean {
  return (EDITORS as readonly string[]).includes(name);
}

// Cookie value clients present. A distinct secret per role so the role is
// derived from which secret the cookie matches — not from a tamperable field.
export function tokenForRole(role: Role): string {
  const secret =
    role === "editor"
      ? process.env.APP_SESSION_SECRET
      : process.env.APP_GUEST_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      role === "editor"
        ? "Missing APP_SESSION_SECRET"
        : "Missing APP_GUEST_SESSION_SECRET"
    );
  }
  return secret;
}

// Map a presented token back to its role (or null if it matches neither).
export function roleForToken(token: string | undefined): Role | null {
  if (!token) return null;
  if (token === process.env.APP_SESSION_SECRET) return "editor";
  if (token === process.env.APP_GUEST_SESSION_SECRET) return "guest";
  return null;
}

export function isValidEditorPassword(input: string): boolean {
  const pw = process.env.APP_PASSWORD;
  return !!pw && input === pw;
}

export function isValidGuestPassword(input: string): boolean {
  const pw = process.env.APP_GUEST_PASSWORD;
  return !!pw && input === pw;
}
