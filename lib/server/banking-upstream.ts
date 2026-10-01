import "server-only";

const FORWARDED_HEADERS = [
  "accept",
  "accept-language",
  "authorization",
  "cache-control",
  "content-type",
  "idempotency-key",
  "if-match",
  "if-none-match",
  "x-correlation-id"
];

const RESPONSE_HEADERS = ["content-type", "cache-control", "location", "retry-after"];

export class UpstreamConfigurationError extends Error {}

export function upstreamBaseUrl(): URL {
  const raw = process.env.BANKING_API_BASE_URL;
  if (!raw) throw new UpstreamConfigurationError("BANKING_API_BASE_URL is not configured");
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new UpstreamConfigurationError("BANKING_API_BASE_URL must use HTTP or HTTPS");
  return url;
}

export function isAllowedPath(segments: string[]): boolean {
  if (!segments.length) return false;
  return segments.every((segment) => {
    try {
      const decoded = decodeURIComponent(segment);
      return decoded !== "" && decoded !== "." && decoded !== ".." && !decoded.includes("/") && !decoded.includes("\\");
    } catch {
      return false;
    }
  });
}

function timeoutMilliseconds(): number {
  const configured = Number.parseInt(process.env.BANKING_API_TIMEOUT_MS ?? "15000", 10);
  return Number.isFinite(configured) && configured >= 500 && configured <= 60_000 ? configured : 15_000;
}

export async function proxyToBankingApi(request: Request, segments: string[]): Promise<Response> {
  const base = upstreamBaseUrl();
  const source = new URL(request.url);
  const destination = new URL(base.toString());
  const basePath = base.pathname.replace(/\/$/, "");
  const apiPrefix = basePath.endsWith("/api/v1") ? basePath : `${basePath}/api/v1`;
  destination.pathname = `${apiPrefix}/${segments.join("/")}`;
  destination.search = source.search;

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMilliseconds());
  try {
    const upstream = await fetch(destination, {
      method: request.method,
      headers,
      body,
      signal: controller.signal,
      redirect: "manual",
      cache: "no-store"
    });
    const responseHeaders = new Headers();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "AbortError";
    console.error("banking proxy transport failure", { path: source.pathname, timeout: isTimeout });
    return Response.json({ code: isTimeout ? "BANKING_UPSTREAM_TIMEOUT" : "BANKING_UPSTREAM_UNAVAILABLE", message: isTimeout ? "The banking service timed out." : "The banking service could not be reached." }, { status: isTimeout ? 504 : 502 });
  } finally {
    clearTimeout(timer);
  }
}
