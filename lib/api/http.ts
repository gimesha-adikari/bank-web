import { isLosslessNumber, parse } from "lossless-json";
import { ApiError, errorMessageForStatus, normalizeFieldErrors, type BackendErrorBody } from "./errors";

export type RequestOptions = Omit<RequestInit, "body" | "credentials"> & {
  body?: unknown;
  timeoutMs?: number;
};

const DECIMAL_FIELDS = new Set(["amount", "balance", "balanceAfter", "totalAmount", "initialDeposit"]);
const DEFAULT_TIMEOUT_MS = 15_000;
const CSRF_ACQUISITION_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
let csrfToken: string | null = null;
let csrfInFlight: { epoch: number; promise: Promise<string> } | undefined;
let csrfEpoch = 0;
const authExpiredListeners = new Set<() => void>();

function requestTimeoutError(): ApiError {
  return new ApiError({ kind: "timeout", message: "The request timed out. Try again when you are ready.", retryableTransport: true });
}

function abortError(): DOMException {
  return new DOMException("The request timed out.", "AbortError");
}

function waitForSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        if (signal.aborted) {
          onAbort();
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }
    );
    if (signal.aborted) onAbort();
  });
}

function reviveLossless(value: unknown, field?: string): unknown {
  if (isLosslessNumber(value)) {
    if (field && DECIMAL_FIELDS.has(field)) return value.value;
    const numeric = Number(value.value);
    if (Number.isSafeInteger(numeric) && String(numeric) === value.value) return numeric;
    return value.value;
  }
  if (Array.isArray(value)) return value.map((item) => reviveLossless(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveLossless(item, key)]));
  return value;
}

export function parseJsonLossless(text: string): unknown {
  if (!text.trim()) return undefined;
  return reviveLossless(parse(text));
}

export function invalidateCsrfToken(): void {
  csrfToken = null;
  csrfEpoch += 1;
}

export function onAuthExpired(listener: () => void): () => void {
  authExpiredListeners.add(listener);
  return () => authExpiredListeners.delete(listener);
}

function emitAuthExpired(): void {
  for (const listener of authExpiredListeners) listener();
}

export function triggerAuthExpired(): void {
  invalidateCsrfToken();
  emitAuthExpired();
}

function requestBody(options: RequestOptions): BodyInit | undefined {
  if (options.body === undefined) return undefined;
  if (typeof options.body === "string" || options.body instanceof FormData || options.body instanceof Blob || options.body instanceof ArrayBuffer) return options.body;
  return JSON.stringify(options.body);
}

function backendError(status: number, parsed: unknown, authExpired = false): ApiError {
  const body = (parsed && typeof parsed === "object" ? parsed : {}) as BackendErrorBody;
  const message = typeof parsed === "string" ? parsed : typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : errorMessageForStatus(status);
  return new ApiError({
    kind: "backend",
    status,
    code: typeof body.code === "string" ? body.code : undefined,
    message,
    fieldErrors: normalizeFieldErrors(body.errors),
    authExpired
  });
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try { return parseJsonLossless(text); } catch { return text; }
}

async function fetchCsrfToken(epoch: number, signal: AbortSignal): Promise<string> {
  try {
    const response = await fetch("/api/auth/csrf", { method: "GET", credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store", signal });
    if (signal.aborted) throw requestTimeoutError();
    const parsed = await readResponse(response);
    if (signal.aborted) throw requestTimeoutError();
    if (!response.ok) throw backendError(response.status, parsed);
    const token = parsed && typeof parsed === "object" && typeof (parsed as { token?: unknown }).token === "string" ? (parsed as { token: string }).token : null;
    if (!token) throw new ApiError({ kind: "parse", status: response.status, message: "The CSRF token response was invalid." });
    if (epoch === csrfEpoch && !signal.aborted) csrfToken = token;
    return token;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal.aborted) throw requestTimeoutError();
    throw new ApiError({ kind: "network", message: "The CSRF service could not be reached.", retryableTransport: true });
  }
}

function startCsrfAcquisition(epoch: number): { epoch: number; promise: Promise<string> } {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const networkRequest = fetchCsrfToken(epoch, controller.signal);
  const timeoutRequest = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(requestTimeoutError());
    }, CSRF_ACQUISITION_TIMEOUT_MS);
  });
  const promise = Promise.race([networkRequest, timeoutRequest]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout);
    if (csrfInFlight?.promise === promise) csrfInFlight = undefined;
  });
  const flight = { epoch, promise };
  csrfInFlight = flight;
  return flight;
}

export function ensureCsrfToken(signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (csrfToken) return signal ? waitForSignal(Promise.resolve(csrfToken), signal) : Promise.resolve(csrfToken);
  let flight = csrfInFlight;
  if (!flight || flight.epoch !== csrfEpoch) flight = startCsrfAcquisition(csrfEpoch);
  return signal ? waitForSignal(flight.promise, signal) : flight.promise;
}

async function headersFor(options: RequestOptions, method: string, signal: AbortSignal): Promise<Headers> {
  const headers = new Headers(options.headers);
  headers.delete("authorization");
  headers.delete("cookie");
  headers.delete("x-csrf-token");
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) headers.set("X-CSRF-Token", await ensureCsrfToken(signal));
  return headers;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const method = (options.method ?? "GET").toUpperCase();
  try {
    const headers = await headersFor(options, method, controller.signal);
    if (controller.signal.aborted) throw abortError();
    const response = await fetch(path, { ...options, method, headers, body: requestBody(options), signal: controller.signal, credentials: "same-origin" });
    const authExpired = response.headers.get("X-Bank-Auth-Expired") === "1";
    const parsed = await readResponse(response);
    if (response.ok) return parsed as T;
    if (authExpired) {
      triggerAuthExpired();
    }
    if (response.status === 403 && parsed && typeof parsed === "object" && (parsed as { code?: unknown }).code === "CSRF_VALIDATION_FAILED") invalidateCsrfToken();
    throw backendError(response.status, parsed, authExpired);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw requestTimeoutError();
    throw new ApiError({ kind: "network", message: "The banking service could not be reached.", retryableTransport: true });
  } finally {
    clearTimeout(timeout);
  }
}

export function apiGet<T>(path: string, options: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
  return apiRequest<T>(path, { ...options, method: "GET" });
}

export function apiJson<T>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
  return apiRequest<T>(path, { ...options, method, body });
}
