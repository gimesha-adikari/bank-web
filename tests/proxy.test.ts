import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isAllowedPath, proxyToBankingApi } from "@/lib/server/banking-upstream";

describe("same-origin banking proxy", () => {
  beforeEach(() => { process.env.BANKING_API_BASE_URL = "http://banking.internal:8080"; vi.restoreAllMocks(); });

  it("confines the path and rejects dot-segment escapes", () => {
    expect(isAllowedPath(["auth", "login"])).toBe(true);
    expect(isAllowedPath(["..", "users"])).toBe(false);
    expect(isAllowedPath(["%2e%2e", "users"])).toBe(false);
    expect(isAllowedPath(["%2fsecret"])).toBe(false);
    expect(isAllowedPath(["accounts/../../secret"])).toBe(false);
  });

  it("forwards method, query, selected headers, and body while preserving backend status/body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "ERR_AMOUNT", message: "Invalid" }), { status: 422, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("http://web.local/api/v1/transactions/deposit?tag=a&tag=b", { method: "POST", headers: { Authorization: "Bearer secret", "Content-Type": "application/json", "Idempotency-Key": "key" }, body: JSON.stringify({ accountId: "a", amount: "1.00" }) });
    const response = await proxyToBankingApi(request, ["transactions", "deposit"]);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ code: "ERR_AMOUNT", message: "Invalid" });
    const [url, rawOptions] = fetchMock.mock.calls[0] ?? [];
    expect((url as URL).toString()).toBe("http://banking.internal:8080/api/v1/transactions/deposit?tag=a&tag=b");
    const call = rawOptions as RequestInit;
    expect(call.method).toBe("POST");
    expect(call.body).toBeInstanceOf(ArrayBuffer);
    expect((call.headers as Headers).get("authorization")).toBe("Bearer secret");
    expect((call.headers as Headers).get("idempotency-key")).toBe("key");
  });

  it("returns sanitized transport errors without inventing a banking success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const response = await proxyToBankingApi(new Request("http://web.local/api/v1/accounts/my"), ["accounts", "my"]);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "BANKING_UPSTREAM_UNAVAILABLE" });
  });
});
