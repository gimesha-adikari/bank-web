export type IdempotencyStatus = "idle" | "pending" | "uncertain" | "confirmed-failure" | "succeeded";

export type IdempotencyState<Payload extends object = object> = {
  key: string;
  payloadFingerprint: string;
  payload: Readonly<Payload>;
  status: IdempotencyStatus;
};

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function stableFingerprint(payload: object): string {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

export function startLogicalOperation<Payload extends object>(payload: Payload): IdempotencyState<Payload> {
  return { key: newIdempotencyKey(), payloadFingerprint: stableFingerprint(payload), payload: { ...payload }, status: "idle" };
}

export function canSubmit(state: IdempotencyState): boolean {
  return state.status !== "pending" && state.status !== "succeeded";
}

export function beginSubmit<Payload extends object>(state: IdempotencyState<Payload>): IdempotencyState<Payload> {
  return { ...state, status: "pending" };
}

export function uncertainFailure<Payload extends object>(state: IdempotencyState<Payload>): IdempotencyState<Payload> {
  return { ...state, status: "uncertain" };
}

export function confirmedFailure<Payload extends object>(state: IdempotencyState<Payload>): IdempotencyState<Payload> {
  return { ...state, status: "confirmed-failure" };
}

export function completeSuccess<Payload extends object>(state: IdempotencyState<Payload>): IdempotencyState<Payload> {
  return { ...state, status: "succeeded" };
}

export function operationPayloadChanged(state: IdempotencyState, payload: object): boolean {
  return state.payloadFingerprint !== stableFingerprint(payload);
}

export function resetForNewOperation<Payload extends object>(payload: Payload): IdempotencyState<Payload> {
  return startLogicalOperation(payload);
}
