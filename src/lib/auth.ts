export const AUTH_COOKIE = "rm_auth";

// The cookie value clients must present. Equals the server session secret.
export function sessionToken(): string {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) throw new Error("Missing APP_SESSION_SECRET");
  return secret;
}

export function isValidPassword(input: string): boolean {
  const pw = process.env.APP_PASSWORD;
  return !!pw && input === pw;
}
