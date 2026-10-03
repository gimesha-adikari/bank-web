import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiJson, ensureCsrfToken, invalidateCsrfToken, parseJsonLossless } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";

const csrf = "a".repeat(43);

function csrfResponse(token = csrf): Response {
  return new Response(JSON.stringify({ token }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("typed HTTP client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateCsrfToken();
  });

  it("preserves decimal response text without Number conversion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"balance":12345678901234567890.1234}', { status: 200, headers: { "content-type": "application/json" } })));
    const value = await apiGet<{ balance: string }>("/api/v1/accounts/my");
    expect(value.balance).toBe("12345678901234567890.1234");
    expect(fetch).toHaveBeenCalledWith("/api/v1/accounts/my", expect.objectContaining({ credentials: "same-origin", headers: expect.any(Headers) }));
    expect(((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit).headers).not.toHaveProperty("Authorization");
  });

  it("retains backend code, message, and field errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(csrfResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ code: "ERR_AMOUNT", message: "Amount is invalid", errors: { amount: "Use decimal text" } }), { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiJson("/api/v1/transactions/deposit", "POST", { amount: "x" }, { headers: { "Idempotency-Key": "key" } })).rejects.toMatchObject({ status: 422, code: "ERR_AMOUNT", message: "Amount is invalid", fieldErrors: { amount: "Use decimal text" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accepts the backend's plain-text success responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(csrfResponse()).mockResolvedValueOnce(new Response("Password changed successfully", { status: 200 })));
    await expect(apiJson<string>("/api/v1/auth/change-password", "PUT", { newPassword: "secret" })).resolves.toBe("Password changed successfully");
  });

  it("does not replay mutations after a 401", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(csrfResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ code: "AUTH", message: "No" }), { status: 401, headers: { "X-Bank-Auth-Expired": "1" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiJson("/api/v1/transactions/deposit", "POST", { amount: "1.00" }, { headers: { "Idempotency-Key": "key" } })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]?.[0] as string)).toBe("/api/v1/transactions/deposit");
  });

  it.each([400, 403, 409, 422, 429, 503])("does not replay a financial mutation after status %s", async (status) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(csrfResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ code: `ERR_${status}`, message: "No replay" }), { status }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiJson("/api/v1/transactions/withdraw", "POST", { amount: "1.00" }, { headers: { "Idempotency-Key": "key" } })).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an authenticated GET after a terminal 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "AUTH", message: "Expired" }), { status: 401, headers: { "X-Bank-Auth-Expired": "1" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiGet("/api/v1/accounts/my")).rejects.toMatchObject({ status: 401, authExpired: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("invalidates memory CSRF after a local CSRF rejection without replaying the mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(csrfResponse("b".repeat(43))).mockResolvedValueOnce(new Response(JSON.stringify({ code: "CSRF_VALIDATION_FAILED", message: "The request could not be verified." }), { status: 403 })).mockResolvedValueOnce(csrfResponse("c".repeat(43)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiJson("/api/v1/transactions/deposit", "POST", { amount: "1.00" })).rejects.toMatchObject({ status: 403, code: "CSRF_VALIDATION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await ensureCsrfToken();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([400, 403, 404, 409, 500, 503])("normalizes backend status %s without changing the status", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: `ERR_${status}`, message: `Backend ${status}` }), { status })));
    await expect(apiGet("/api/v1/accounts/my")).rejects.toMatchObject({ status, code: `ERR_${status}`, message: `Backend ${status}` });
  });

  it("parses lossless JSON recursively", () => {
    expect(parseJsonLossless('{"amount":99999999999999999999.9999,"items":[1]}')).toEqual({ amount: "99999999999999999999.9999", items: [1] });
  });
});
