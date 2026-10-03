import "server-only";

const PRODUCTION_COOKIE_NAME = "__Host-bank-web-auth";
const DEVELOPMENT_COOKIE_NAME = "bank-web-auth-dev";
const EPOCH = "Thu, 01 Jan 1970 00:00:00 GMT";

export function isProductionCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

export function authCookieName(): string {
  return isProductionCookies() ? PRODUCTION_COOKIE_NAME : DEVELOPMENT_COOKIE_NAME;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const entry of header.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const key = entry.slice(0, separator).trim();
    if (key !== name) continue;
    const value = entry.slice(separator + 1).trim();
    try { return decodeURIComponent(value); } catch { return value; }
  }
  return null;
}

export function authCookieValue(request: Request): string | null {
  return readCookie(request, authCookieName());
}

export function serializeSessionCookie(name: string, value: string, secure = isProductionCookies()): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

export function serializeDeletionCookie(name: string, secure = isProductionCookies()): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}; Max-Age=0; Expires=${EPOCH}`;
}

export function appendAuthCookie(headers: Headers, value: string): void {
  headers.append("Set-Cookie", serializeSessionCookie(authCookieName(), value));
}

export function appendAuthCookieDeletion(headers: Headers): void {
  headers.append("Set-Cookie", serializeDeletionCookie(authCookieName()));
}
