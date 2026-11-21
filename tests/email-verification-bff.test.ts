import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { proxyToBankingApi } from "@/lib/server/banking-upstream";

const registration = ["auth", "verify-email"];
const emailChange = ["users", "me", "email", "verify"];
const resend = ["auth", "resend-verification"];
const token = "synthetic+token&part";

function request(path: string[], init?: RequestInit, search = new URLSearchParams({ token }).toString()) {
  return new Request(`https://web.local/api/v1/${path.join("/")}${search ? `?${search}` : ""}`, init);
}

describe("public email verification BFF", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("BANKING_API_BASE_URL", "http://core.internal:8080/gateway/api/v1");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    { path: registration, flow: "registration", status: 200, outcome: "verified" },
    { path: registration, flow: "registration", status: 403, outcome: "invalid" },
    { path: emailChange, flow: "email-change", status: 200, outcome: "verified" },
    { path: emailChange, flow: "email-change", status: 404, outcome: "invalid" },
    { path: emailChange, flow: "email-change", status: 409, outcome: "conflict" },
    { path: registration, flow: "registration", status: 503, outcome: "unavailable" }
  ])("redirects $flow document navigation with core status $status to a safe result", async ({ path, flow, status, outcome }) => {
    fetchMock.mockResolvedValueOnce(new Response(token, { status, headers: { "Cache-Control": "public, max-age=600" } }));
    const response = await proxyToBankingApi(request(path, {
      headers: { "Sec-Fetch-Mode": "navigate", Accept: "text/html", Cookie: "bank-web-auth-dev=ignored", Referer: "https://mail.local/" }
    }), path);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/verification-result?flow=${flow}&status=${outcome}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [upstream, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(upstream.pathname).toBe(`/gateway/api/v1/${path.join("/")}`);
    expect(upstream.searchParams.get("token")).toBe(token);
    expect(options.method).toBe("GET");
    expect(options.cache).toBe("no-store");
    for (const header of ["authorization", "cookie", "referer"]) {
      expect(new Headers(options.headers).get(header)).toBeNull();
    }
  });

  it("retains the programmatic email-change response status and body", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: "ERR_NOT_FOUND", message: "Invalid or expired verification token" }, { status: 404 }));
    const response = await proxyToBankingApi(request(emailChange), emailChange);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "ERR_NOT_FOUND" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each([
    { method: "HEAD", headers: {}, status: 405 },
    { method: "POST", headers: {}, status: 405 },
    { method: "GET", headers: { "Sec-Purpose": "prefetch;prerender" }, status: 204 },
    { method: "GET", headers: { "Next-Router-Prefetch": "1" }, status: 204 },
    { method: "GET", headers: { RSC: "1" }, status: 204 }
  ])("does not consume the token for $method $headers", async ({ method, headers, status }) => {
    const response = await proxyToBankingApi(request(registration, { method, headers: new Headers(headers as Record<string, string>) }), registration);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["", "token=", "token=first&token=second"])("rejects missing or ambiguous tokens without contacting core (%s)", async (search) => {
    const response = await proxyToBankingApi(request(registration, { headers: { Accept: "text/html" } }, search), registration);
    expect(response.headers.get("location")).toBe("/verification-result?flow=registration&status=invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps transport failure to a token-free recoverable result", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error(token));
    const response = await proxyToBankingApi(request(registration, { headers: { Accept: "text/html" } }), registration);
    expect(response.headers.get("location")).toBe("/verification-result?flow=registration&status=unavailable");
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires POST and CSRF to resend without an authenticated session", async () => {
    expect((await proxyToBankingApi(request(resend, undefined, ""), resend)).status).toBe(405);
    const body = JSON.stringify({ email: "customer@example.test" });
    expect((await proxyToBankingApi(request(resend, { method: "POST", body }, ""), resend)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();

    const csrf = "c".repeat(43);
    fetchMock.mockResolvedValueOnce(new Response("If an account exists, a verification email has been sent"));
    const response = await proxyToBankingApi(request(resend, {
      method: "POST",
      headers: { Cookie: `bank-web-csrf-dev=${csrf}`, "X-CSRF-Token": csrf, Origin: "https://web.local", "Content-Type": "application/json" },
      body
    }, ""), resend);
    expect(response.status).toBe(200);
    const [upstream, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(upstream.pathname).toBe("/gateway/api/v1/auth/resend-verification");
    expect(new Headers(options.headers).get("authorization")).toBeNull();
    expect(new TextDecoder().decode(options.body as ArrayBuffer)).toBe(body);
  });
});
