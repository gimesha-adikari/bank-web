export type FieldErrors = Record<string, string>;

export type ApiErrorKind = "backend" | "network" | "timeout" | "configuration" | "parse";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors?: FieldErrors;
  readonly retryableTransport: boolean;
  readonly authExpired: boolean;

  constructor(input: {
    kind: ApiErrorKind;
    status?: number;
    code?: string;
    message: string;
    fieldErrors?: FieldErrors;
    retryableTransport?: boolean;
    authExpired?: boolean;
  }) {
    super(input.message);
    this.name = "ApiError";
    this.kind = input.kind;
    this.status = input.status ?? 0;
    this.code = input.code;
    this.fieldErrors = input.fieldErrors;
    this.retryableTransport = input.retryableTransport ?? false;
    this.authExpired = input.authExpired ?? false;
  }
}

export type BackendErrorBody = {
  code?: unknown;
  message?: unknown;
  error?: unknown;
  errors?: unknown;
};

export function normalizeFieldErrors(value: unknown): FieldErrors | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: FieldErrors = {};
  for (const [key, message] of Object.entries(value)) {
    if (typeof message === "string") result[key] = message;
    else if (Array.isArray(message)) result[key] = message.filter((item): item is string => typeof item === "string").join(" ");
  }
  return Object.keys(result).length ? result : undefined;
}

export function errorMessageForStatus(status: number): string {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You are not allowed to perform this action.";
  if (status === 404) return "The requested banking record was not found.";
  if (status === 409) return "This request conflicts with a newer banking state.";
  if (status === 422) return "The banking service could not accept these values.";
  if (status === 503) return "The banking service is temporarily unavailable. Try again when you are ready.";
  if (status >= 500) return "The banking service could not complete the request.";
  return "The request could not be completed.";
}
