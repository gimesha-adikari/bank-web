import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { isProductionCookies, readCookie, serializeDeletionCookie, serializeSessionCookie } from "./auth-cookie";

const PRODUCTION_COOKIE_NAME = "__Host-bank-web-csrf";
const DEVELOPMENT_COOKIE_NAME = "bank-web-csrf-dev";
const TOKEN_LENGTH = 43;
const FAILURE_BODY = JSON.stringify({ code: "CSRF_VALIDATION_FAILED", message: "The request could not be verified." });

export function csrfCookieName(): string {
  return isProductionCookies() ? PRODUCTION_COOKIE_NAME : DEVELOPMENT_COOKIE_NAME;
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isValidCsrfToken(value: string | null): value is string {
  return value !== null && value.length === TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(value);
}

export function csrfCookieValue(request: Request): string | null {
  return readCookie(request, csrfCookieName());
}

export function appendCsrfCookie(headers: Headers, value: string): void {
  headers.append("Set-Cookie", serializeSessionCookie(csrfCookieName(), value));
}

export function appendCsrfCookieDeletion(headers: Headers): void {
  headers.append("Set-Cookie", serializeDeletionCookie(csrfCookieName()));
}

function sameValue(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function validateCsrfRequest(request: Request): boolean {
  const cookie = csrfCookieValue(request);
  const header = request.headers.get("x-csrf-token");
  if (!isValidCsrfToken(cookie) || !isValidCsrfToken(header) || !sameValue(cookie, header)) return false;
  const origin = request.headers.get("origin");
  if (origin !== null) {
    try {
      const source = new URL(request.url);
      const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
      const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
      const host = forwardedHost ?? request.headers.get("host") ?? source.host;
      const protocol = forwardedProtocol ?? source.protocol.replace(":", "");
      if (origin !== `${protocol}://${host}`) return false;
    } catch {
      return false;
    }
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && !["same-origin", "same-site", "none"].includes(fetchSite.toLowerCase())) return false;
  return true;
}

export function csrfFailureResponse(): Response {
  return new Response(FAILURE_BODY, { status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
