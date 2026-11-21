import { describe, expect, it } from "vitest";
import { beginSubmit, canSubmit, completeSuccess, confirmedFailure, operationPayloadChanged, startLogicalOperation, uncertainFailure } from "@/lib/finance/idempotency";

describe("financial idempotency lifecycle", () => {
  it("creates a stable key and blocks duplicate submission while pending", () => {
    const state = startLogicalOperation({ accountId: "a", amount: "10.00" });
    const pending = beginSubmit(state);
    expect(state.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(canSubmit(pending)).toBe(false);
    expect(pending.key).toBe(state.key);
  });

  it("retains a snapshot and the same key through uncertainty and confirmed success", () => {
    const draft = { accountId: "a", amount: "10.00" };
    const state = startLogicalOperation(draft);
    draft.amount = "20.00";
    const uncertain = uncertainFailure(beginSubmit(state));
    expect(uncertain.key).toBe(state.key);
    expect(uncertain.payload).toEqual({ accountId: "a", amount: "10.00" });
    expect(canSubmit(uncertain)).toBe(true);
    expect(completeSuccess(uncertain).status).toBe("succeeded");
    expect(canSubmit(completeSuccess(uncertain))).toBe(false);
  });

  it("retains a rejected operation key and detects changes to decimal text", () => {
    const state = confirmedFailure(beginSubmit(startLogicalOperation({ accountId: "a", amount: "0.10" })));
    expect(canSubmit(state)).toBe(true);
    expect(operationPayloadChanged(state, { accountId: "a", amount: "0.10" })).toBe(false);
    expect(operationPayloadChanged(state, { accountId: "a", amount: "0.100" })).toBe(true);
    expect(beginSubmit(state).key).toBe(state.key);
  });
});
