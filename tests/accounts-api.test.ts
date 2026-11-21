import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateCsrfToken } from "@/lib/api/http";
import { accountsApi } from "@/lib/api/accounts";

const csrf = "c".repeat(43);
const account = {
  accountId: "account-1", accountNumber: "100001", accountType: "SAVINGS",
  accountStatus: "ACTIVE", balance: "1000.0500"
};

describe("customer account-opening API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateCsrfToken();
  });

  it("sends the exact Idempotency-Key header with the unchanged decimal-string request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: csrf }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(account), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await accountsApi.createCustomerAccount(
      { accountType: "SAVINGS", initialDeposit: "1000.05", branchId: 21 },
      "3ad1f234-1849-41f0-a2e0-5ac10cc818f2"
    );

    const [url, options] = fetchMock.mock.calls[1] ?? [];
    const headers = new Headers((options as RequestInit).headers);
    expect(url).toBe("/api/v1/accounts");
    expect(headers.get("Idempotency-Key")).toBe("3ad1f234-1849-41f0-a2e0-5ac10cc818f2");
    expect(headers.get("X-Idempotency-Key")).toBeNull();
    expect(String((options as RequestInit).body)).toBe(
      '{"accountType":"SAVINGS","initialDeposit":"1000.05","branchId":21}'
    );
    expect(headers.get("X-CSRF-Token")).toBe(csrf);
  });
});
