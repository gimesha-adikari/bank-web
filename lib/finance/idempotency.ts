export type IdempotencyStatus = "idle" | "pending" | "uncertain" | "confirmed-failure" | "succeeded";

export type IdempotencyState = {
  key: string | null;
  payloadFingerprint: string | null;
  status: IdempotencyStatus;
};

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function stableFingerprint(payload: unknown): string {
  return JSON.stringify(payload, Object.keys(payload as object).sort());
}

export function startLogicalOperation(payload: unknown): IdempotencyState {
  return { key: newIdempotencyKey(), payloadFingerprint: stableFingerprint(payload), status: "idle" };
}

export function canSubmit(state: IdempotencyState): boolean {
  return state.status !== "pending" && state.status !== "succeeded";
}

export function beginSubmit(state: IdempotencyState): IdempotencyState {
  return { ...state, status: "pending" };
}

export function uncertainFailure(state: IdempotencyState): IdempotencyState {
  return { ...state, status: "uncertain" };
}

export function confirmedFailure(state: IdempotencyState): IdempotencyState {
  return { ...state, status: "confirmed-failure" };
}

export function completeSuccess(state: IdempotencyState): IdempotencyState {
  return { ...state, status: "succeeded" };
}

export function operationPayloadChanged(state: IdempotencyState, payload: unknown): boolean {
  return state.payloadFingerprint !== stableFingerprint(payload);
}

export function resetForNewOperation(payload: unknown): IdempotencyState {
  return startLogicalOperation(payload);
}
