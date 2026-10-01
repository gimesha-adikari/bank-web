import { beforeEach, describe, expect, it, vi } from "vitest";
import { transactionsApi } from "@/lib/api/transactions";

describe("financial request contracts", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sends decimal text and the caller-owned idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ journalReference: "JR-1", amount: "10.0000" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await transactionsApi.deposit("jwt", { accountId: "a", amount: "10.0000" }, "operation-key");
    const [, options] = fetchMock.mock.calls[0] ?? [];
    expect(((options as RequestInit).headers as Headers).get("Idempotency-Key")).toBe("operation-key");
    expect(String((options as RequestInit).body)).toContain('"amount":"10.0000"');
  });

  it("sends reversal reason only and does not add an idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ reversalJournalEntryId: "r-1", reversalOfEntryId: "o-1", amount: "10.00", currency: "LKR" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await transactionsApi.reverse("jwt", "o-1", { reason: "Duplicate teller posting" });
    const [, options] = fetchMock.mock.calls[0] ?? [];
    expect(((options as RequestInit).headers as Headers).get("Idempotency-Key")).toBeNull();
    expect(String((options as RequestInit).body)).toBe('{"reason":"Duplicate teller posting"}');
  });
});
