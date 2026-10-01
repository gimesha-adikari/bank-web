import { isLosslessNumber, parse } from "lossless-json";
import { ApiError, errorMessageForStatus, normalizeFieldErrors, type BackendErrorBody } from "./errors";

export type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
  allowGetRefresh?: boolean;
  skipAuth?: boolean;
};

type RefreshCallback = () => Promise<string | null>;
let refreshCallback: RefreshCallback | undefined;
let refreshInFlight: Promise<string | null> | undefined;

export function configureGetRefresh(callback: RefreshCallback | undefined): void {
  refreshCallback = callback;
}

function reviveLossless(value: unknown): unknown {
  if (isLosslessNumber(value)) return value.value;
  if (Array.isArray(value)) return value.map(reviveLossless);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveLossless(item)]));
  return value;
}

export function parseJsonLossless(text: string): unknown {
  if (!text.trim()) return undefined;
  return reviveLossless(parse(text));
}

function headersFor(options: RequestOptions): Headers {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (options.token && !options.skipAuth) headers.set("Authorization", `Bearer ${options.token}`);
  return headers;
}

function requestBody(options: RequestOptions): BodyInit | undefined {
  if (options.body === undefined) return undefined;
  if (typeof options.body === "string" || options.body instanceof FormData || options.body instanceof Blob) return options.body;
  return JSON.stringify(options.body);
}

function backendError(status: number, parsed: unknown): ApiError {
  const body = (parsed && typeof parsed === "object" ? parsed : {}) as BackendErrorBody;
  const message = typeof parsed === "string" ? parsed : typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : errorMessageForStatus(status);
  return new ApiError({
    kind: "backend",
    status,
    code: typeof body.code === "string" ? body.code : undefined,
    message,
    fieldErrors: normalizeFieldErrors(body.errors)
  });
}

async function refreshOnce(): Promise<string | null> {
  if (!refreshCallback) return null;
  if (!refreshInFlight) refreshInFlight = refreshCallback().finally(() => { refreshInFlight = undefined; });
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  const headers = headersFor(options);
  const method = (options.method ?? "GET").toUpperCase();
  try {
    const response = await fetch(path, { ...options, method, headers, body: requestBody(options), signal: controller.signal });
    const text = await response.text();
    let parsed: unknown;
    if (text) {
      try { parsed = parseJsonLossless(text); }
      catch { parsed = text; }
    }
    if (response.ok) return parsed as T;
    if (response.status === 401 && method === "GET" && options.allowGetRefresh !== false && !retried && refreshCallback) {
      const refreshed = await refreshOnce();
      if (refreshed) return apiRequest<T>(path, { ...options, token: refreshed, allowGetRefresh: false }, true);
    }
    throw backendError(response.status, parsed);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new ApiError({ kind: "timeout", message: "The request timed out. Try again when you are ready.", retryableTransport: true });
    throw new ApiError({ kind: "network", message: "The banking service could not be reached.", retryableTransport: true });
  } finally {
    clearTimeout(timeout);
  }
}

export function apiGet<T>(path: string, token?: string | null, options: Omit<RequestOptions, "method" | "token"> = {}): Promise<T> {
  return apiRequest<T>(path, { ...options, method: "GET", token });
}

export function apiJson<T>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body: unknown, options: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
  return apiRequest<T>(path, { ...options, method, body });
}
