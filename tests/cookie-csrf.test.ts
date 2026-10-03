import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { authCookieName, serializeDeletionCookie, serializeSessionCookie } from "@/lib/server/auth-cookie";
import { csrfCookieName, generateCsrfToken, validateCsrfRequest } from "@/lib/server/csrf";

const token = "a".repeat(43);

describe("cookie policy", () => {
  beforeEach(() => vi.unstubAllEnvs());

  it("uses secure host-only production cookies", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(authCookieName()).toBe("__Host-bank-web-auth");
    expect(csrfCookieName()).toBe("__Host-bank-web-csrf");
    const value = serializeSessionCookie(authCookieName(), "sentinel");
    expect(value).toContain("HttpOnly");
    expect(value).toContain("Secure");
    expect(value).toContain("SameSite=Strict");
    expect(value).toContain("Path=/");
    expect(value).not.toContain("Domain=");
    expect(value).not.toContain("Max-Age");
    expect(value).not.toContain("Expires");
    expect(serializeSessionCookie(csrfCookieName(), "sentinel")).toContain("Secure");
  });

  it("uses localhost development names without Secure", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(authCookieName()).toBe("bank-web-auth-dev");
    expect(csrfCookieName()).toBe("bank-web-csrf-dev");
    expect(serializeSessionCookie(authCookieName(), "sentinel")).not.toContain("Secure");
  });

  it("deletes with matching session attributes and epoch expiry", () => {
    vi.stubEnv("NODE_ENV", "production");
    const value = serializeDeletionCookie(authCookieName());
    expect(value).toContain("Max-Age=0");
    expect(value).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(value).toContain("Secure");
    expect(value).toContain("HttpOnly");
    expect(value).toContain("SameSite=Strict");
    expect(value).toContain("Path=/");
    expect(value).not.toContain("Domain=");
  });
});

describe("CSRF primitives", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "test"));

  it("generates 32-byte base64url values from secure randomness", () => {
    const first = generateCsrfToken();
    const second = generateCsrfToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });

  it.each([
    ["missing cookie", { headers: { "X-CSRF-Token": token } }],
    ["missing header", { headers: { Cookie: `bank-web-csrf-dev=${token}` } }],
    ["mismatch", { headers: { Cookie: `bank-web-csrf-dev=${token}`, "X-CSRF-Token": "b".repeat(43) } }],
    ["origin mismatch", { headers: { Cookie: `bank-web-csrf-dev=${token}`, "X-CSRF-Token": token, Origin: "https://attacker.example" } }],
    ["cross-site fetch metadata", { headers: { Cookie: `bank-web-csrf-dev=${token}`, "X-CSRF-Token": token, "Sec-Fetch-Site": "cross-site" } }]
  ])("rejects %s", (_name, init) => {
    expect(validateCsrfRequest(new Request("http://web.local/api/v1/auth/login", { method: "POST", ...init }))).toBe(false);
  });

  it.each(["same-origin", "same-site", "none", undefined])("accepts valid pair with fetch metadata %s", (fetchSite) => {
    const headers: Record<string, string> = { Cookie: `bank-web-csrf-dev=${token}`, "X-CSRF-Token": token, Origin: "http://web.local" };
    if (fetchSite) headers["Sec-Fetch-Site"] = fetchSite;
    expect(validateCsrfRequest(new Request("http://web.local/api/v1/auth/login", { method: "POST", headers }))).toBe(true);
  });
});
