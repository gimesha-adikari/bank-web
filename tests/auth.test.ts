import { describe, expect, it, vi } from "vitest";
import { authApi } from "@/lib/api/auth";

describe("authentication contract", () => {
  it("sends login credentials and returns the backend identity shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "jwt", username: "sam", role: "CUSTOMER" }), { status: 200 })));
    await expect(authApi.login({ username: "sam", password: "secret" })).resolves.toEqual({ token: "jwt", username: "sam", role: "CUSTOMER" });
    expect(fetch).toHaveBeenCalledWith("/api/v1/auth/login", expect.objectContaining({ method: "POST" }));
  });

  it("does not permit the bootstrap validation call to refresh itself", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "AUTH", message: "Expired" }), { status: 401 })));
    await expect(authApi.validateToken("expired")).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses the audited username availability GET contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Username available", { status: 200 })));
    await expect(authApi.usernameAvailable("new-user")).resolves.toBe("Username available");
    expect(fetch).toHaveBeenCalledWith("/api/v1/auth/available?username=new-user", expect.objectContaining({ method: "GET" }));
  });
});
