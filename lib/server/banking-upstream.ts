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
const MAX_KYC_BODY_BYTES = 11 * 1024 * 1024;
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

type KycOperation = "upload" | "submit" | "document" | "json";
type KycScope = "kyc" | "admin/kyc";
type UpstreamOptions = { authenticated?: boolean; validateCsrf?: boolean; kyc?: KycOperation };

function invalidPathResponse(): Response {
  return Response.json({ code: "INVALID_API_PATH", message: "The requested API path is not valid." }, { status: 400 });
}

async function readKycBody(request: Request, signal: AbortSignal): Promise<ArrayBuffer | null> {
  if (Number(request.headers.get("content-length")) > MAX_KYC_BODY_BYTES) return null;
  if (!request.body) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const chunks: Uint8Array[] = [];
  let length = 0;
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_KYC_BODY_BYTES) {
        cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

async function fetchCanonicalBankingApi(request: Request, segments: readonly string[], options: UpstreamOptions = {}): Promise<UpstreamResult> {
  const method = request.method.toUpperCase();
  const external = isExternalCallbackPath(segments);
  const authenticated = options.authenticated ?? isAuthenticatedPath(segments);
  if (options.validateCsrf !== false && !external && ["POST", "PUT", "PATCH", "DELETE"].includes(method) && !validateCsrfRequest(request)) {
    return { response: csrfFailureResponse(), authenticated };
  }

  const source = new URL(request.url);
  if (method === "POST" && segments.join("/") === "auth/reset-password" && source.search) {
    return {
      response: Response.json(
        { code: "INVALID_RESET_REQUEST", message: "Send password reset fields in the form body." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      ),
      authenticated
    };
  }

  const base = upstreamBaseUrl();
  const destination = new URL(base.toString());
  const basePath = base.pathname.replace(/\/$/, "");
  const versioned = basePath.endsWith("/api/v1");
  const apiPrefix = options.kyc
    ? (versioned ? basePath.slice(0, -"/api/v1".length) : basePath)
    : (versioned ? basePath : `${basePath}/api/v1`);
  destination.pathname = `${apiPrefix}/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
  destination.search = source.search;

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    if (options.kyc && name === "idempotency-key") continue;
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (options.kyc === "submit") {
    const key = request.headers.get("x-idempotency-key");
    if (key !== null) headers.set("X-Idempotency-Key", key);
  }
  if (authenticated) {
    const token = authCookieValue(request);
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const hasBody = method !== "GET" && method !== "HEAD";
  const unboundedBody = !options.kyc && hasBody ? await request.arrayBuffer() : undefined;
  const controller = new AbortController();
  const deadline = options.kyc ? AbortSignal.timeout(timeoutMilliseconds()) : undefined;
  const signal = deadline ? AbortSignal.any([deadline, request.signal]) : controller.signal;
  const timer = deadline ? undefined : setTimeout(() => controller.abort(), timeoutMilliseconds());
  try {
    const body = options.kyc && hasBody ? await readKycBody(request, signal) : unboundedBody;
    if (body === null) {
      return { response: kycError(413, "KYC_BODY_TOO_LARGE", "The KYC request exceeds the web upload limit."), authenticated };
    }
    const upstream = await fetch(destination, { method, headers, body, signal, redirect: "manual", cache: "no-store" });
    const responseHeaders = responseHeadersFor(upstream, authenticated);
    if (options.kyc) responseHeaders.set("Cache-Control", "no-store");
    if (options.kyc === "document") {
      const disposition = upstream.headers.get("content-disposition");
      if (upstream.ok && disposition) responseHeaders.set("Content-Disposition", disposition);
      responseHeaders.set("X-Content-Type-Options", "nosniff");
      responseHeaders.set("Content-Security-Policy", "sandbox");
    }
    return { upstream, responseHeaders, authenticated };
  } catch (error) {
    const isTimeout = deadline?.aborted ?? (error instanceof DOMException && error.name === "AbortError");
    console.error("banking proxy transport failure", { path: options.kyc ? "kyc" : source.pathname, timeout: isTimeout });
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
    expireSession(headers);
  }
  return new Response(result.upstream.body, { status: result.upstream.status, headers });
}

export async function proxyToBankingApi(request: Request, segments: readonly string[]): Promise<Response> {
  const canonical = canonicalizePathSegments(segments);
  if (!canonical) return invalidPathResponse();
  if (isBlockedBrowserPath(canonical)) return browserNotFoundResponse();
  return responseFromUpstream(await fetchCanonicalBankingApi(request, canonical));
}

function expireSession(headers: Headers): void {
  appendAuthCookieDeletion(headers);
  appendCsrfCookieDeletion(headers);
  headers.set("X-Bank-Auth-Expired", "1");
}

function kycError(status: number, code: string, message: string, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Cache-Control", "no-store");
  return Response.json({ code, message }, { status, headers });
}

function kycRoute(scope: KycScope, path: readonly string[]): { method: "GET" | "POST"; operation: KycOperation } | null {
  const [first, second] = path;
  if (scope === "kyc" && path.length === 1) {
    if (first === "upload") return { method: "POST", operation: "upload" };
    if (first === "submit") return { method: "POST", operation: "submit" };
    if (first === "me") return { method: "GET", operation: "json" };
  }
  if (scope === "admin/kyc" && path.length === 0) return { method: "GET", operation: "json" };
  if (path.length !== 2 || !/^[\w-]{1,36}$/.test(first)) return null;
  if (scope === "kyc" && first === "file" && /^[\w-]{1,36}$/.test(second)) return { method: "GET", operation: "document" };
  if (second === "checks") return { method: "GET", operation: "json" };
  if (scope === "admin/kyc" && second === "decision") return { method: "POST", operation: "json" };
  return null;
}

export async function proxyToKycApi(request: Request, scope: KycScope, segments: readonly string[]): Promise<Response> {
  const path = segments.length ? canonicalizePathSegments(segments) : [];
  if (!path) return browserNotFoundResponse();
  const route = kycRoute(scope, path);
  if (!route) return browserNotFoundResponse();
  if (request.method !== route.method) {
    return kycError(405, "METHOD_NOT_ALLOWED", "This method is not allowed for the requested KYC operation.", { Allow: route.method });
  }
  if (!authCookieValue(request)) {
    const headers = new Headers();
    expireSession(headers);
    return kycError(401, "AUTH_REQUIRED", "Sign in to access KYC.", headers);
  }
  try {
    const result = await fetchCanonicalBankingApi(request, [...scope.split("/"), ...path], { authenticated: true, kyc: route.operation });
    return responseFromUpstream(result);
  } catch (error) {
    if (error instanceof UpstreamConfigurationError) {
      return kycError(500, "BANKING_PROXY_MISCONFIGURED", "The banking API is not configured.");
    }
    throw error;
  }
}
