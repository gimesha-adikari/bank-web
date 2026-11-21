import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi } from "@/lib/api/auth";
import { invalidateCsrfToken } from "@/lib/api/http";

const csrf = "a".repeat(43);

describe("authentication contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateCsrfToken();
  });

  it("sends login credentials and returns identity without a token", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: csrf }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ username: "sam", role: "CUSTOMER" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(authApi.login({ username: "sam", password: "secret" })).resolves.toEqual({ username: "sam", role: "CUSTOMER" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/auth/login");
    expect(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)).toContain('"username":"sam"');
  });

  it("uses ambient cookie validation without refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "AUTH", message: "Expired" }), { status: 401, headers: { "X-Bank-Auth-Expired": "1" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(authApi.validateToken()).rejects.toMatchObject({ status: 401, authExpired: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the audited username availability GET contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Username available", { status: 200 })));
    await expect(authApi.usernameAvailable("new-user")).resolves.toBe("Username available");
    expect(fetch).toHaveBeenCalledWith("/api/v1/auth/available?username=new-user", expect.objectContaining({ method: "GET" }));
  });

  it("submits reset secrets only in a CSRF-protected form body", async () => {
    const fields = { token: "fixture+token&part", newPassword: "Fixture+Pass1&=" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: csrf }))
      .mockResolvedValueOnce(new Response("Password has been reset"));
    vi.stubGlobal("fetch", fetchMock);

    await authApi.resetPassword(fields.token, fields.newPassword);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/csrf", "/api/v1/auth/reset-password"]);
    const options = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = new Headers(options.headers);
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("same-origin");
    expect(headers.get("content-type")).toMatch(/^application\/x-www-form-urlencoded\b/);
    expect(headers.get("x-csrf-token")).toBe(csrf);
    expect(Object.fromEntries(new URLSearchParams(String(options.body)))).toEqual(fields);
  });
});
