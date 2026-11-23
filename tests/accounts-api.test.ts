import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateCsrfToken } from "@/lib/api/http";
import { accountsApi } from "@/lib/api/accounts";

const csrf = "c".repeat(43);
const account = {
  accountId: "account-1", accountNumber: "100001", accountType: "SAVINGS",
  accountStatus: "ACTIVE", balance: "1000.0500"
};

describe("accounts API", () => {
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

  it("loads the unpaginated staff directory and account-scoped history from their exact endpoints", async () => {
    const transactions = [{
      transactionId: "50000000-0000-4000-8000-000000000001", accountId: account.accountId,
      type: "TRANSFER_OUT", amount: "15.2300", balanceAfter: "984.8200", description: "Transfer", createdAt: "2026-01-02T03:04:05"
    }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json([account]))
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValueOnce(Response.json(transactions));
    vi.stubGlobal("fetch", fetchMock);

    await expect(accountsApi.listStaffAccounts()).resolves.toEqual([account]);
    await expect(accountsApi.byId(account.accountId)).resolves.toEqual(account);
    await expect(accountsApi.history(account.accountId)).resolves.toEqual(transactions);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/accounts",
      "/api/v1/accounts/account-1",
      "/api/v1/accounts/account-1/transactions"
    ]);
  });

  it("updates accounts with the exact DTO and CSRF, then closes with a CSRF-protected DELETE", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: csrf }))
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const update = { accountType: "FIXED_DEPOSIT", initialDeposit: "1000.0500", branchId: 22 } as const;

    await expect(accountsApi.update(account.accountId, update)).resolves.toEqual(account);
    await expect(accountsApi.close(account.accountId)).resolves.toBeUndefined();

    const [, putOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    const [, deleteOptions] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/accounts/account-1");
    expect(putOptions.method).toBe("PUT");
    expect(JSON.parse(String(putOptions.body))).toEqual(update);
    expect(new Headers(putOptions.headers).get("X-CSRF-Token")).toBe(csrf);
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/v1/accounts/account-1");
    expect(deleteOptions.method).toBe("DELETE");
    expect(deleteOptions.redirect).toBe("error");
    expect(new Headers(deleteOptions.headers).get("X-CSRF-Token")).toBe(csrf);
    expect(deleteOptions.body).toBeUndefined();
  });

  it("requires the documented 204 for closure and preserves its structured rejection code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ token: csrf }))
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValueOnce(Response.json({ code: "ERR_ACCOUNT_BALANCE_NONZERO" }, { status: 422 })));

    await expect(accountsApi.close(account.accountId)).rejects.toMatchObject({ kind: "parse", status: 200 });
    await expect(accountsApi.close(account.accountId)).rejects.toMatchObject({ status: 422, code: "ERR_ACCOUNT_BALANCE_NONZERO" });
  });

  it.each([401, 403, 404, 409, 422, 502, 504])("preserves backend status %i for account management", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ code: "ERR_BACKEND" }, { status })));
    await expect(accountsApi.byId(account.accountId)).rejects.toMatchObject({ status });
  });
});
