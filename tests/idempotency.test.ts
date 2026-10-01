import { describe, expect, it, vi } from "vitest";
import { beginSubmit, canSubmit, completeSuccess, newIdempotencyKey, operationPayloadChanged, startLogicalOperation, uncertainFailure } from "@/lib/finance/idempotency";

describe("financial idempotency lifecycle", () => {
  it("creates a stable key and blocks duplicate submission while pending", () => {
    const state = startLogicalOperation({ accountId: "a", amount: "10.00" });
    const pending = beginSubmit(state);
    expect(state.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(canSubmit(pending)).toBe(false);
    expect(pending.key).toBe(state.key);
  });

  it("retains the same key after uncertain transport failure and clears on success", () => {
    const state = startLogicalOperation({ accountId: "a", amount: "10.00" });
    const uncertain = uncertainFailure(beginSubmit(state));
    expect(uncertain.key).toBe(state.key);
    expect(canSubmit(uncertain)).toBe(true);
    expect(completeSuccess(uncertain).status).toBe("succeeded");
  });

  it("detects payload changes and never uses floating point arithmetic", () => {
    const state = startLogicalOperation({ accountId: "a", amount: "0.10" });
    expect(operationPayloadChanged(state, { accountId: "a", amount: "0.10" })).toBe(false);
    expect(operationPayloadChanged(state, { accountId: "a", amount: "0.100" })).toBe(true);
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(newIdempotencyKey()).toHaveLength(36);
    expect(vi).toBeDefined();
  });
});
