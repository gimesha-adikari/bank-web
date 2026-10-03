import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isAllowedPath, proxyToBankingApi } from "@/lib/server/banking-upstream";

const csrf = "a".repeat(43);

function cookie(auth = "cookie-jwt", csrfToken = csrf): string {
  return `bank-web-auth-dev=${auth}; bank-web-csrf-dev=${csrfToken}`;
}

function validHeaders(): Record<string, string> {
  return { Cookie: cookie(), "X-CSRF-Token": csrf, Origin: "http://web.local", "Sec-Fetch-Site": "same-origin" };
}

describe("same-origin banking proxy", () => {
  beforeEach(() => {
    process.env.BANKING_API_BASE_URL = "http://banking.internal:8080";
    vi.restoreAllMocks();
  });

  it("confines the path and rejects dot-segment escapes", () => {
    expect(isAllowedPath(["auth", "login"])).toBe(true);
    expect(isAllowedPath(["..", "users"])).toBe(false);
    expect(isAllowedPath(["%2e%2e", "users"])).toBe(false);
    expect(isAllowedPath(["%2fsecret"])).toBe(false);
    expect(isAllowedPath(["accounts/../../secret"])).toBe(false);
  });

  it("translates only the server cookie into upstream Bearer and preserves idempotency", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "ERR_AMOUNT", message: "Invalid" }), { status: 422, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("http://web.local/api/v1/transactions/deposit?tag=a&tag=b", { method: "POST", headers: { ...validHeaders(), Authorization: "Bearer attacker", "Content-Type": "application/json", "Idempotency-Key": "key" }, body: JSON.stringify({ accountId: "a", amount: "1.00" }) });
    const response = await proxyToBankingApi(request, ["transactions", "deposit"]);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ code: "ERR_AMOUNT", message: "Invalid" });
    const [url, rawOptions] = fetchMock.mock.calls[0] ?? [];
    expect((url as URL).toString()).toBe("http://banking.internal:8080/api/v1/transactions/deposit?tag=a&tag=b");
    const call = rawOptions as RequestInit;
    expect((call.headers as Headers).get("authorization")).toBe("Bearer cookie-jwt");
    expect((call.headers as Headers).get("cookie")).toBeNull();
    expect((call.headers as Headers).get("idempotency-key")).toBe("key");
    expect((call.headers as Headers).get("x-csrf-token")).toBeNull();
  });

  it("does not inject auth into a public route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("available", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await proxyToBankingApi(new Request("http://web.local/api/v1/auth/available?username=sam", { headers: { Cookie: "bank-web-auth-dev=secret" } }), ["auth", "available"]);
    expect(((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers).get("authorization")).toBeNull();
  });

  it("does not fabricate authorization when an authenticated route has no auth cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "AUTH", message: "Missing" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await proxyToBankingApi(new Request("http://web.local/api/v1/accounts/my"), ["accounts", "my"]);
    expect(response.status).toBe(401);
    expect(((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers).get("authorization")).toBeNull();
    expect(response.headers.get("X-Bank-Auth-Expired")).toBe("1");
  });

  it("rejects an unsafe request locally before contacting bank-core when CSRF is invalid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await proxyToBankingApi(new Request("http://web.local/api/v1/transactions/deposit", { method: "POST", headers: { Cookie: "bank-web-auth-dev=secret", "X-CSRF-Token": "wrong" }, body: "{}" }), ["transactions", "deposit"]);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "CSRF_VALIDATION_FAILED", message: "The request could not be verified." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears both browser cookies and marks a protected 401 without replay", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "AUTH", message: "Expired" }), { status: 401, headers: { "content-type": "application/json", "cache-control": "private", "retry-after": "1", "set-cookie": "bank-core=secret" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await proxyToBankingApi(new Request("http://web.local/api/v1/accounts/my", { headers: { Cookie: "bank-web-auth-dev=expired", Authorization: "Bearer attacker" } }), ["accounts", "my"]);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "AUTH", message: "Expired" });
    expect(response.headers.get("X-Bank-Auth-Expired")).toBe("1");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Retry-After")).toBe("1");
    expect(response.headers.get("set-cookie")).toContain("bank-web-auth-dev=");
    expect(response.headers.get("set-cookie")).toContain("bank-web-csrf-dev=");
    expect(response.headers.get("set-cookie")).not.toContain("bank-core");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([403, 429, 500, 502, 503, 504])("preserves browser authentication on status %s", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: `ERR_${status}`, message: "No clear" }), { status, headers: status === 429 ? { "retry-after": "2" } : undefined }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("http://web.local/api/v1/accounts/my", { headers: { Cookie: "bank-web-auth-dev=active" } });
    const response = await proxyToBankingApi(request, ["accounts", "my"]);
    expect(response.status).toBe(status);
    expect(response.headers.get("X-Bank-Auth-Expired")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    if (status === 429) expect(response.headers.get("Retry-After")).toBe("2");
  });

  it("blocks the browser refresh endpoint without an upstream request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await proxyToBankingApi(new Request("http://web.local/api/v1/auth/refresh-token", { method: "POST" }), ["auth", "refresh-token"]);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "NOT_FOUND", message: "The requested resource was not found." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns sanitized transport errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const response = await proxyToBankingApi(new Request("http://web.local/api/v1/accounts/my"), ["accounts", "my"]);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "BANKING_UPSTREAM_UNAVAILABLE" });
  });
});
