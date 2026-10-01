import { describe, expect, it, vi, beforeEach } from "vitest";
import { apiGet, apiJson, configureGetRefresh, parseJsonLossless } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";

describe("typed HTTP client", () => {
  beforeEach(() => { vi.restoreAllMocks(); configureGetRefresh(undefined); });

  it("preserves decimal response text without Number conversion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"balance":12345678901234567890.1234}', { status: 200, headers: { "content-type": "application/json" } })));
    const value = await apiGet<{ balance: string }>("/api/v1/accounts/my", "jwt");
    expect(value.balance).toBe("12345678901234567890.1234");
    expect(fetch).toHaveBeenCalledWith("/api/v1/accounts/my", expect.objectContaining({ headers: expect.any(Headers) }));
  });

  it("retains backend code, message, and field errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "ERR_AMOUNT", message: "Amount is invalid", errors: { amount: "Use decimal text" } }), { status: 422 })));
    await expect(apiJson("/api/v1/transactions/deposit", "POST", { amount: "x" }, { token: "jwt", headers: { "Idempotency-Key": "key" } })).rejects.toMatchObject({ status: 422, code: "ERR_AMOUNT", message: "Amount is invalid", fieldErrors: { amount: "Use decimal text" } });
  });

  it("accepts the backend's plain-text success responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Password changed successfully", { status: 200 })));
    await expect(apiJson<string>("/api/v1/auth/change-password", "PUT", { newPassword: "secret" })).resolves.toBe("Password changed successfully");
  });

  it("does not replay mutations after a 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "AUTH", message: "No" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiJson("/api/v1/transactions/deposit", "POST", { amount: "1.00" }, { token: "jwt", headers: { "Idempotency-Key": "key" } })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows one approved refresh/replay for an ordinary GET only", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "AUTH", message: "Expired" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "new-jwt" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    configureGetRefresh(async () => "new-jwt");
    await expect(apiGet("/api/v1/accounts/my", "old-jwt")).resolves.toEqual({ token: "new-jwt" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("parses lossless JSON recursively", () => {
    expect(parseJsonLossless('{"amount":99999999999999999999.9999,"items":[1]}')).toEqual({ amount: "99999999999999999999.9999", items: [1] });
  });
});
