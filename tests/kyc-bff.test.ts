import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET as getKyc, POST as postKyc } from "@/app/api/kyc/[...path]/route";
import { GET as getReview, OPTIONS as optionsReview, POST as postReview } from "@/app/api/admin/kyc/[[...path]]/route";
import { proxyToBankingApi } from "@/lib/server/banking-upstream";

const documentId = "85baf41c-42a5-4e47-ae18-bfbca3acf998";
const caseId = "case-1";
const csrf = "a".repeat(43);

function requestFor(path: string, method = "GET", options: {
  session?: string | null;
  csrfHeader?: boolean;
  headers?: HeadersInit;
  body?: BodyInit;
} = {}) {
  const headers = new Headers(options.headers);
  const session = options.session === undefined ? "customer-session" : options.session;
  if (session) headers.set("Cookie", `bank-web-auth-dev=${session}; bank-web-csrf-dev=${csrf}`);
  if (options.csrfHeader !== false) headers.set("X-CSRF-Token", csrf);
  headers.set("Origin", "http://web.local");
  const streamOptions = options.body instanceof ReadableStream ? { duplex: "half" } : {};
  return new Request(`http://web.local${path}`, { method, headers, body: options.body, ...streamOptions });
}

function context(...path: string[]) {
  return { params: Promise.resolve({ path }) };
}

describe("KYC BFF", () => {
  beforeEach(() => vi.stubEnv("BANKING_API_BASE_URL", "http://core.internal:8080/gateway/api/v1/"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    { handler: postKyc, base: "/kyc", path: ["upload"], method: "POST" },
    { handler: getKyc, base: "/kyc", path: ["file", documentId], method: "GET" },
    { handler: postKyc, base: "/kyc", path: ["submit"], method: "POST" },
    { handler: getKyc, base: "/kyc", path: ["me"], method: "GET" },
    { handler: getKyc, base: "/kyc", path: [caseId, "checks"], method: "GET" },
    { handler: getReview, base: "/admin/kyc", path: [], method: "GET", query: "?status=UNDER_REVIEW&page=2&size=10" },
    { handler: getReview, base: "/admin/kyc", path: [caseId, "checks"], method: "GET" },
    { handler: postReview, base: "/admin/kyc", path: [caseId, "decision"], method: "POST" }
  ])("maps $method $base $path outside the upstream API version prefix", async ({ handler, base, path, method, query = "" }) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    const suffix = path.length ? `/${path.join("/")}` : "";
    const session = base === "/kyc" ? "customer-session" : "admin-session";
    const response = await handler(requestFor(`/api${base}${suffix}${query}`, method, { session, headers: { Authorization: "Bearer ignored-browser-header" } }), context(...path));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe(`http://core.internal:8080/gateway${base}${suffix}${query}`);
    expect(init.method).toBe(method);
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${session}`);
    expect(new Headers(init.headers).get("cookie")).toBeNull();
    expect(init.redirect).toBe("manual");
  });

  it.each([
    { handler: getKyc, path: ["upload"], method: "GET", status: 405, allow: "POST" },
    { handler: postKyc, path: ["me"], method: "POST", status: 405, allow: "GET" },
    { handler: getKyc, path: ["me"], method: "HEAD", status: 405, allow: "GET" },
    { handler: optionsReview, path: [], method: "OPTIONS", status: 405, allow: "GET" },
    { handler: postReview, path: [], method: "POST", status: 405, allow: "GET" },
    { handler: getReview, path: [caseId, "decision"], method: "GET", status: 405, allow: "POST" },
    { handler: postKyc, path: [caseId, "decision"], method: "POST", status: 404 },
    { handler: postReview, path: ["upload"], method: "POST", status: 404 },
    { handler: getKyc, path: ["file", "%252Fme"], method: "GET", status: 404 },
    { handler: getKyc, path: ["me", "extra"], method: "GET", status: 404 }
  ])("rejects $method $path without forwarding", async ({ handler, path, method, status, allow }) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handler(requestFor("/api/kyc", method), context(...path));
    expect(response.status).toBe(status);
    expect(response.headers.get("allow")).toBe(allow ?? null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires the HttpOnly session before fetching a protected file", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await getKyc(requestFor(`/api/kyc/file/${documentId}`, "GET", {
      session: null, headers: { Authorization: "Bearer ignored" }
    }), context("file", documentId));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { handler: postKyc, path: ["upload"] },
    { handler: postKyc, path: ["submit"] },
    { handler: postReview, path: [caseId, "decision"] }
  ])("requires CSRF on $path", async ({ handler, path }) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handler(requestFor("/api/kyc", "POST", { csrfHeader: false }), context(...path));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "CSRF_VALIDATION_FAILED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the original multipart boundary and bytes", async () => {
    const encoder = new TextEncoder();
    const contentType = 'multipart/form-data; boundary="test-boundary"';
    const prefix = encoder.encode('--test-boundary\r\nContent-Disposition: form-data; name="file"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n');
    const suffix = encoder.encode('\r\n--test-boundary\r\nContent-Disposition: form-data; name="type"\r\n\r\nDOC_FRONT\r\n--test-boundary--\r\n');
    const bytes = new Uint8Array([...prefix, 0, 128, 255, ...suffix]);
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: documentId }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await postKyc(requestFor("/api/kyc/upload", "POST", { headers: { "Content-Type": contentType }, body: bytes }), context("upload"));
    expect(await response.json()).toEqual({ id: documentId });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("content-type")).toBe(contentType);
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(bytes);
  });

  it.each([true, false])("bounds KYC bodies with content length present=%s", async (withContentLength) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const size = 11 * 1024 * 1024 + 1;
    const request = requestFor("/api/kyc/upload", "POST", {
      headers: withContentLength ? { "Content-Length": String(size) } : undefined,
      body: withContentLength ? "oversized" : new Uint8Array(size)
    });
    const response = await postKyc(request, context("upload"));
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("scopes the KYC idempotency header to submit and retains the financial header", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({})));
    vi.stubGlobal("fetch", fetchMock);
    const headers = { "X-Idempotency-Key": "case-key", "Idempotency-Key": "financial-key" };
    await postKyc(requestFor("/api/kyc/submit", "POST", { headers }), context("submit"));
    await postKyc(requestFor("/api/kyc/submit", "POST"), context("submit"));
    await postReview(requestFor(`/api/admin/kyc/${caseId}/decision`, "POST", { headers }), context(caseId, "decision"));
    await proxyToBankingApi(requestFor("/api/v1/transactions/deposit", "POST", { headers }), ["transactions", "deposit"]);

    const forwarded = fetchMock.mock.calls.map(([, init]) => new Headers(init.headers));
    expect(forwarded.map((value) => value.get("x-idempotency-key"))).toEqual(["case-key", null, null, null]);
    expect(forwarded.map((value) => value.get("idempotency-key"))).toEqual([null, null, null, "financial-key"]);
  });

  it("streams protected document bytes with safe, noncacheable response headers", async () => {
    const bytes = Uint8Array.of(0, 128, 255);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes, { headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'inline; filename="case.png"',
      "Cache-Control": "public, max-age=3600",
      "Set-Cookie": "upstream=private"
    } })));
    const response = await getKyc(requestFor(`/api/kyc/file/${documentId}`), context("file", documentId));
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="case.png"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it.each([401, 403, 404, 503])("relays upstream %s and expires the session on 401 only", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "Upstream response" }, { status })));
    const response = await getReview(requestFor("/api/admin/kyc"), context());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ message: "Upstream response" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-bank-auth-expired")).toBe(status === 401 ? "1" : null);
    expect(response.headers.has("set-cookie")).toBe(status === 401);
  });

  it("reports an unavailable upstream without exposing connection details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private connection details")));
    const response = await getKyc(requestFor("/api/kyc/me"), context("me"));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: "BANKING_UPSTREAM_UNAVAILABLE", message: "The banking service could not be reached." });
  });

  it("returns a noncacheable configuration error when the upstream is unset", async () => {
    vi.stubEnv("BANKING_API_BASE_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await getKyc(requestFor("/api/kyc/me"), context("me"));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ code: "BANKING_PROXY_MISCONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a 504 when the upstream exceeds the configured deadline", async () => {
    vi.stubEnv("BANKING_API_TIMEOUT_MS", "500");
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));
    const response = await getKyc(requestFor("/api/kyc/me"), context("me"));
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ code: "BANKING_UPSTREAM_TIMEOUT" });
  });

  it("includes reading multipart bytes in the KYC deadline", async () => {
    vi.stubEnv("BANKING_API_TIMEOUT_MS", "500");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const response = await postKyc(requestFor("/api/kyc/upload", "POST", { body }), context("upload"));
    expect(response.status).toBe(504);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
