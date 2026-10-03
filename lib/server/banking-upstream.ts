import "server-only";

import { appendAuthCookieDeletion, authCookieValue } from "./auth-cookie";
import { appendCsrfCookieDeletion, csrfFailureResponse, validateCsrfRequest } from "./csrf";

const FORWARDED_HEADERS = [
  "accept",
  "accept-language",
  "cache-control",
  "content-type",
  "idempotency-key",
  "if-match",
  "if-none-match",
  "x-correlation-id"
];

const RESPONSE_HEADERS = ["content-type", "cache-control", "location", "retry-after"];
const PUBLIC_PATHS = new Set([
  "auth/available",
  "auth/register",
  "auth/login",
  "auth/verify-email",
  "auth/resend-verification",
  "auth/forgot-password",
  "auth/reset-password",
  "users/me/email/verify"
]);
const BLOCKED_BROWSER_PATHS = new Set(["auth/login", "auth/logout", "auth/change-password", "auth/refresh-token"]);
const DEDICATED_AUTH_ENDPOINTS = {
  login: ["auth", "login"],
  logout: ["auth", "logout"],
  "change-password": ["auth", "change-password"]
} as const;
type DedicatedAuthEndpoint = keyof typeof DEDICATED_AUTH_ENDPOINTS;

export class UpstreamConfigurationError extends Error {}

export type UpstreamResult = {
  upstream?: Response;
  response?: Response;
  responseHeaders?: Headers;
  authenticated: boolean;
};

export function upstreamBaseUrl(): URL {
  const raw = process.env.BANKING_API_BASE_URL;
  if (!raw) throw new UpstreamConfigurationError("BANKING_API_BASE_URL is not configured");
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new UpstreamConfigurationError("BANKING_API_BASE_URL must use HTTP or HTTPS");
  return url;
}

export function canonicalizePathSegments(segments: readonly string[]): string[] | null {
  if (!segments.length) return null;
  const canonical: string[] = [];
  for (const segment of segments) {
    if (!segment) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (!decoded || decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\") || /%[0-9A-Fa-f]{2}/.test(decoded)) return null;
    canonical.push(decoded);
  }
  return canonical;
}

export function isAllowedPath(segments: readonly string[]): boolean {
  return canonicalizePathSegments(segments) !== null;
}

function isPublicPath(segments: readonly string[]): boolean {
  const path = segments.join("/");
  return PUBLIC_PATHS.has(path) || path.startsWith("auth/reset-password/");
}

function isExternalCallbackPath(segments: readonly string[]): boolean {
  const path = segments.join("/");
  return path === "wallet/payhere" || path.startsWith("wallet/payhere/") || path === "wallet/webhook" || path.startsWith("wallet/webhook/");
}

function isBlockedBrowserPath(segments: readonly string[]): boolean {
  return BLOCKED_BROWSER_PATHS.has(segments.join("/"));
}

function isAuthenticatedPath(segments: readonly string[]): boolean {
  return !isPublicPath(segments) && !isExternalCallbackPath(segments) && !isBlockedBrowserPath(segments);
}

export function browserNotFoundResponse(): Response {
  return new Response(JSON.stringify({ code: "NOT_FOUND", message: "The requested resource was not found." }), { status: 404, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function timeoutMilliseconds(): number {
  const configured = Number.parseInt(process.env.BANKING_API_TIMEOUT_MS ?? "15000", 10);
  return Number.isFinite(configured) && configured >= 500 && configured <= 60_000 ? configured : 15_000;
}

function ensureNoStore(value: string | null): string {
  if (!value) return "no-store";
  return /(^|,)\s*no-store(?:\s*,|$)/i.test(value) ? value : `${value}, no-store`;
}

function responseHeadersFor(upstream: Response, authenticated: boolean): Headers {
  const headers = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (authenticated) headers.set("Cache-Control", ensureNoStore(headers.get("Cache-Control")));
  return headers;
}

function transportResponse(authenticated: boolean, isTimeout: boolean): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authenticated) headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ code: isTimeout ? "BANKING_UPSTREAM_TIMEOUT" : "BANKING_UPSTREAM_UNAVAILABLE", message: isTimeout ? "The banking service timed out." : "The banking service could not be reached." }), { status: isTimeout ? 504 : 502, headers });
}

type UpstreamOptions = { authenticated?: boolean; validateCsrf?: boolean };

function invalidPathResponse(): Response {
  return Response.json({ code: "INVALID_API_PATH", message: "The requested API path is not valid." }, { status: 400 });
}

async function fetchCanonicalBankingApi(request: Request, segments: readonly string[], options: UpstreamOptions = {}): Promise<UpstreamResult> {
  const method = request.method.toUpperCase();
  const external = isExternalCallbackPath(segments);
  const authenticated = options.authenticated ?? isAuthenticatedPath(segments);
  if (options.validateCsrf !== false && !external && ["POST", "PUT", "PATCH", "DELETE"].includes(method) && !validateCsrfRequest(request)) {
    return { response: csrfFailureResponse(), authenticated };
  }

  const base = upstreamBaseUrl();
  const source = new URL(request.url);
  const destination = new URL(base.toString());
  const basePath = base.pathname.replace(/\/$/, "");
  const apiPrefix = basePath.endsWith("/api/v1") ? basePath : `${basePath}/api/v1`;
  destination.pathname = `${apiPrefix}/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
  destination.search = source.search;

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (authenticated) {
    const token = authCookieValue(request);
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMilliseconds());
  try {
    const upstream = await fetch(destination, { method, headers, body, signal: controller.signal, redirect: "manual", cache: "no-store" });
    return { upstream, responseHeaders: responseHeadersFor(upstream, authenticated), authenticated };
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "AbortError";
    console.error("banking proxy transport failure", { path: source.pathname, timeout: isTimeout });
    return { response: transportResponse(authenticated, isTimeout), authenticated };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDedicatedAuthApi(request: Request, endpoint: DedicatedAuthEndpoint): Promise<UpstreamResult> {
  return fetchCanonicalBankingApi(request, DEDICATED_AUTH_ENDPOINTS[endpoint], { authenticated: endpoint !== "login", validateCsrf: false });
}

export function responseFromUpstream(result: UpstreamResult): Response {
  if (result.response) return result.response;
  if (!result.upstream || !result.responseHeaders) return transportResponse(result.authenticated, false);
  const headers = new Headers(result.responseHeaders);
  if (result.authenticated && result.upstream.status === 401) {
    appendAuthCookieDeletion(headers);
    appendCsrfCookieDeletion(headers);
    headers.set("X-Bank-Auth-Expired", "1");
  }
  return new Response(result.upstream.body, { status: result.upstream.status, headers });
}

export async function proxyToBankingApi(request: Request, segments: readonly string[]): Promise<Response> {
  const canonical = canonicalizePathSegments(segments);
  if (!canonical) return invalidPathResponse();
  if (isBlockedBrowserPath(canonical)) return browserNotFoundResponse();
  return responseFromUpstream(await fetchCanonicalBankingApi(request, canonical));
}
