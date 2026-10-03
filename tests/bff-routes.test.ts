import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET as csrfGet } from "@/app/api/auth/csrf/route";
import { POST as loginPost } from "@/app/api/v1/auth/login/route";
import { POST as logoutPost } from "@/app/api/v1/auth/logout/route";
import { PUT as changePasswordPut } from "@/app/api/v1/auth/change-password/route";

const csrf = "a".repeat(43);

function browserHeaders(auth = "active", csrfToken = csrf): Record<string, string> {
  return { Cookie: `bank-web-auth-dev=${auth}; bank-web-csrf-dev=${csrfToken}`, "X-CSRF-Token": csrfToken, Origin: "http://web.local", "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" };
}

describe("BFF lifecycle routes", () => {
  beforeEach(() => {
    process.env.BANKING_API_BASE_URL = "http://banking.internal:8080";
    vi.restoreAllMocks();
  });

  it("issues and reuses the HttpOnly CSRF comparison cookie", async () => {
    const first = await csrfGet(new Request("http://web.local/api/auth/csrf"));
    const body = await first.json();
    expect(first.status).toBe(200);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.headers.get("set-cookie")).toContain("bank-web-csrf-dev=");
    expect(first.headers.get("set-cookie")).toContain("HttpOnly");
    expect(first.headers.get("cache-control")).toBe("no-store");
    const second = await csrfGet(new Request("http://web.local/api/auth/csrf", { headers: { Cookie: `bank-web-csrf-dev=${body.token}` } }));
    expect((await second.json()).token).toBe(body.token);
  });

  it("bridges login server-side and returns identity without the upstream JWT", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "sentinel-jwt", username: "sam", role: "CUSTOMER" }), { status: 200, headers: { "content-type": "application/json", "cache-control": "private", "set-cookie": "bank-core=secret" } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await loginPost(new Request("http://web.local/api/v1/auth/login", { method: "POST", headers: browserHeaders("", csrf), body: JSON.stringify({ username: "sam", password: "secret" }) }));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toBe(JSON.stringify({ username: "sam", role: "CUSTOMER" }));
    expect(text).not.toContain("sentinel-jwt");
    expect(response.headers.get("set-cookie")).toContain("bank-web-auth-dev=sentinel-jwt");
    expect(response.headers.get("set-cookie")).toContain("bank-web-csrf-dev=");
    expect(response.headers.get("set-cookie")).not.toContain("bank-core");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((requestOptions.headers as Headers).get("authorization")).toBeNull();
  });

  it("does not establish a cookie for malformed upstream login success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ username: "sam", role: "CUSTOMER" }), { status: 200 })));
    const response = await loginPost(new Request("http://web.local/api/v1/auth/login", { method: "POST", headers: browserHeaders("", csrf), body: "{}" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: "BANKING_UPSTREAM_PROTOCOL_ERROR", message: "The banking service returned an invalid response." });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("clears both cookies on terminal logout invalid-session status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "AUTH", message: "Already logged out" }), { status: 401, headers: { "content-type": "application/json" } })));
    const response = await logoutPost(new Request("http://web.local/api/v1/auth/logout", { method: "POST", headers: browserHeaders() }));
    expect(response.status).toBe(401);
    expect(response.headers.get("X-Bank-Auth-Expired")).toBe("1");
    expect(response.headers.get("set-cookie")).toContain("bank-web-auth-dev=");
    expect(response.headers.get("set-cookie")).toContain("bank-web-csrf-dev=");
  });

  it("clears both cookies after successful password change", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Password changed successfully", { status: 200 })));
    const response = await changePasswordPut(new Request("http://web.local/api/v1/auth/change-password", { method: "PUT", headers: browserHeaders(), body: "{}" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("bank-web-auth-dev=");
    expect(response.headers.get("set-cookie")).toContain("bank-web-csrf-dev=");
  });
});
