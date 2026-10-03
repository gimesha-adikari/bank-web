import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateCsrfToken } from "@/lib/api/http";
import { transactionsApi } from "@/lib/api/transactions";

const csrf = "a".repeat(43);

function successResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 });
}

describe("financial request contracts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateCsrfToken();
  });

  it("sends decimal text and the caller-owned idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: csrf }), { status: 200 })).mockResolvedValueOnce(successResponse({ journalReference: "JR-1", amount: "10.0000" }));
    vi.stubGlobal("fetch", fetchMock);
    await transactionsApi.deposit({ accountId: "a", amount: "10.0000" }, "operation-key");
    const [, options] = fetchMock.mock.calls[1] ?? [];
    expect(((options as RequestInit).headers as Headers).get("Idempotency-Key")).toBe("operation-key");
    expect(String((options as RequestInit).body)).toContain('"amount":"10.0000"');
  });

  it("sends reversal reason only and does not add an idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: csrf }), { status: 200 })).mockResolvedValueOnce(successResponse({ reversalJournalEntryId: "r-1", reversalOfEntryId: "o-1", amount: "10.00", currency: "LKR" }));
    vi.stubGlobal("fetch", fetchMock);
    await transactionsApi.reverse("o-1", { reason: "Duplicate teller posting" });
    const [, options] = fetchMock.mock.calls[1] ?? [];
    expect(((options as RequestInit).headers as Headers).get("Idempotency-Key")).toBeNull();
    expect(String((options as RequestInit).body)).toBe('{"reason":"Duplicate teller posting"}');
  });

  it.each([
    ["deposit", "transactions/deposit", { accountId: "a", amount: "10.00" }],
    ["withdraw", "transactions/withdraw", { accountId: "a", amount: "10.00" }],
    ["transfer", "transactions/transfer", { sourceAccountId: "a", destinationAccountId: "b", amount: "10.00" }]
  ] as const)("uses decimal text and the caller key for %s", async (operation, path, body) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: csrf }), { status: 200 })).mockResolvedValueOnce(successResponse({ operation, amount: "10.00" }));
    vi.stubGlobal("fetch", fetchMock);
    if (operation === "deposit") await transactionsApi.deposit(body, "same-logical-operation");
    if (operation === "withdraw") await transactionsApi.withdraw(body, "same-logical-operation");
    if (operation === "transfer") await transactionsApi.transfer(body, "same-logical-operation");
    const [url, options] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe(`/api/v1/${path}`);
    expect(((options as RequestInit).headers as Headers).get("Idempotency-Key")).toBe("same-logical-operation");
    expect(String((options as RequestInit).body)).toContain('"amount":"10.00"');
  });
});
