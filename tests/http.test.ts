import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiJson, ensureCsrfToken, invalidateCsrfToken, parseJsonLossless } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";

const csrf = "a".repeat(43);

function csrfResponse(token = csrf): Response {
  return new Response(JSON.stringify({ token }), { status: 200, headers: { "content-type": "application/json" } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

describe("typed HTTP client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateCsrfToken();
  });

  it("preserves decimal response text without Number conversion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"balance":12345678901234567890.1234}', { status: 200, headers: { "content-type": "application/json" } })));
    const value = await apiGet<{ balance: string }>("/api/v1/accounts/my");
    expect(value.balance).toBe("12345678901234567890.1234");
    expect(fetch).toHaveBeenCalledWith("/api/v1/accounts/my", expect.objectContaining({ credentials: "same-origin", headers: expect.any(Headers) }));
    expect(((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit).headers).not.toHaveProperty("Authorization");
  });

  it("retains backend code, message, and field errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(csrfResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ code: "ERR_AMOUNT", message: "Amount is invalid", errors: { amount: "Use decimal text" } }), { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiJson("/api/v1/transactions/deposit", "POST", { amount: "x" }, { headers: { "Idempotency-Key": "key" } })).rejects.toMatchObject({ status: 422, code: "ERR_AMOUNT", message: "Amount is invalid", fieldErrors: { amount: "Use decimal text" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accepts the backend's plain-text success responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(csrfResponse()).mockResolvedValueOnce(new Response("Password changed successfully", { status: 200 })));
    await expect(apiJson<string>("/api/v1/auth/change-password", "PUT", { newPassword: "secret" })).resolves.toBe("Password changed successfully");
  });

  it("does not replay mutations after a 401", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(csrfResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ code: "AUTH", message: "No" }), { status: 401, headers: { "X-Bank-Auth-Expired": "1" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiJson("/api/v1/transactions/deposit", "POST", { amount: "1.00" }, { headers: { "Idempotency-Key": "key" } })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]?.[0] as string)).toBe("/api/v1/transactions/deposit");
  });

  it.each([400, 403, 409, 422, 429, 503])("does not replay a financial mutation after status %s", async (status) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(csrfResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ code: `ERR_${status}`, message: "No replay" }), { status }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiJson("/api/v1/transactions/withdraw", "POST", { amount: "1.00" }, { headers: { "Idempotency-Key": "key" } })).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an authenticated GET after a terminal 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "AUTH", message: "Expired" }), { status: 401, headers: { "X-Bank-Auth-Expired": "1" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiGet("/api/v1/accounts/my")).rejects.toMatchObject({ status: 401, authExpired: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("invalidates memory CSRF after a local CSRF rejection without replaying the mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(csrfResponse("b".repeat(43))).mockResolvedValueOnce(new Response(JSON.stringify({ code: "CSRF_VALIDATION_FAILED", message: "The request could not be verified." }), { status: 403 })).mockResolvedValueOnce(csrfResponse("c".repeat(43)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiJson("/api/v1/transactions/deposit", "POST", { amount: "1.00" })).rejects.toMatchObject({ status: 403, code: "CSRF_VALIDATION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await ensureCsrfToken();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("times out stalled CSRF acquisition and never dispatches its mutation later", async () => {
    vi.useFakeTimers();
    let resolveCsrf!: (response: Response) => void;
    const stalledCsrf = new Promise<Response>((resolve) => { resolveCsrf = resolve; });
    const targetRequests: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url === "/api/auth/csrf") return stalledCsrf;
      targetRequests.push(url);
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const operation = apiJson("/api/v1/transactions/deposit", "POST", { amount: "10.00" }, { timeoutMs: 1000 }).then(
      (value) => ({ value }),
      (error: unknown) => ({ error })
    );
    let settled = false;
    void operation.then(() => { settled = true; });

    try {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
      const settledByDeadline = settled;
      resolveCsrf(csrfResponse());
      const result = await operation;
      expect(settledByDeadline).toBe(true);
      expect(result).toHaveProperty("error", expect.objectContaining({ kind: "timeout", retryableTransport: true }));
      expect(targetRequests).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      resolveCsrf(csrfResponse());
      await operation;
      vi.useRealTimers();
    }
  });

  it.each(["PUT", "PATCH", "DELETE"] as const)("bounds stalled CSRF acquisition for %s and prevents late dispatch", async (method) => {
    vi.useFakeTimers();
    const stalledCsrf = deferred<Response>();
    const targetRequests: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url === "/api/auth/csrf") return stalledCsrf.promise;
      targetRequests.push(url);
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const operation = apiJson("/api/v1/accounts/test", method, {}, { timeoutMs: 500 }).then(
      (value) => ({ value }),
      (error: unknown) => ({ error })
    );

    try {
      await vi.advanceTimersByTimeAsync(500);
      stalledCsrf.resolve(csrfResponse());
      const result = await operation;
      expect(result).toHaveProperty("error", expect.objectContaining({ kind: "timeout", retryableTransport: true }));
      expect(targetRequests).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      stalledCsrf.resolve(csrfResponse());
      await operation;
      vi.useRealTimers();
    }
  });

  it("shares CSRF acquisition while keeping each caller deadline independent", async () => {
    vi.useFakeTimers();
    const stalledCsrf = deferred<Response>();
    const targetRequests: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url === "/api/auth/csrf") return stalledCsrf.promise;
      targetRequests.push(url);
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const shortRequest = apiJson("/api/v1/transactions/deposit", "POST", { amount: "10.00" }, { timeoutMs: 100 });
    const longRequest = apiJson("/api/v1/transactions/withdraw", "POST", { amount: "5.00" }, { timeoutMs: 1000 });
    const shortResult = shortRequest.then((value) => ({ value }), (error: unknown) => ({ error }));
    const longResult = longRequest.then((value) => ({ value }), (error: unknown) => ({ error }));

    try {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(100);
      const short = await shortResult;
      expect(short).toHaveProperty("error", expect.objectContaining({ kind: "timeout", retryableTransport: true }));
      expect(targetRequests).toEqual([]);
      stalledCsrf.resolve(csrfResponse("b".repeat(43)));
      await expect(longResult).resolves.toHaveProperty("value", {});
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(targetRequests).toEqual(["/api/v1/transactions/withdraw"]);
    } finally {
      stalledCsrf.resolve(csrfResponse("b".repeat(43)));
      await Promise.all([shortResult, longResult]);
      vi.useRealTimers();
    }
  });

  it("bounds the shared CSRF fetch and permits a later acquisition", async () => {
    vi.useFakeTimers();
    let csrfSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (String(input) === "/api/auth/csrf" && fetchMock.mock.calls.length === 1) {
        csrfSignal = init?.signal as AbortSignal;
        return new Promise<Response>(() => {});
      }
      if (String(input) === "/api/auth/csrf") return Promise.resolve(csrfResponse("c".repeat(43)));
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const resultPromise = ensureCsrfToken().then((value) => ({ value }), (error: unknown) => ({ error }));

    try {
      await vi.advanceTimersByTimeAsync(15_000);
      const result = await resultPromise;
      expect(result).toHaveProperty("error", expect.objectContaining({ kind: "timeout", retryableTransport: true }));
      expect(csrfSignal?.aborted).toBe(true);
      await expect(ensureCsrfToken()).resolves.toBe("c".repeat(43));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      await resultPromise;
      vi.useRealTimers();
    }
  });

  it("does not let an acquisition from an invalidated CSRF epoch replace the newer token", async () => {
    const oldCsrf = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      if (String(input) !== "/api/auth/csrf") return Promise.resolve(new Response("{}", { status: 200 }));
      return fetchMock.mock.calls.length === 1 ? oldCsrf.promise : Promise.resolve(csrfResponse("d".repeat(43)));
    });
    vi.stubGlobal("fetch", fetchMock);
    const oldAcquisition = ensureCsrfToken();
    invalidateCsrfToken();
    await expect(ensureCsrfToken()).resolves.toBe("d".repeat(43));
    oldCsrf.resolve(csrfResponse("e".repeat(43)));
    await expect(oldAcquisition).resolves.toBe("e".repeat(43));
    await expect(ensureCsrfToken()).resolves.toBe("d".repeat(43));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 403, 503])("preserves real CSRF HTTP status %s and allows a later unsafe request to reacquire", async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: `CSRF_HTTP_${status}`, message: "Try again later" }), { status }))
      .mockResolvedValueOnce(csrfResponse("f".repeat(43)))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiJson("/api/v1/transactions/deposit", "POST", { amount: "10.00" }, { headers: { "Idempotency-Key": "deposit-1" } }))
      .rejects.toMatchObject({ kind: "backend", status, code: `CSRF_HTTP_${status}` });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(apiJson("/api/v1/transactions/deposit", "POST", { amount: "10.00" }, { headers: { "Idempotency-Key": "deposit-1" } })).resolves.toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/auth/csrf");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("/api/auth/csrf");
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe("/api/v1/transactions/deposit");
  });

  it("uses a cached CSRF token without another CSRF GET", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(csrfResponse()).mockResolvedValueOnce(new Response("{}", { status: 200 })).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await apiJson("/api/v1/transactions/deposit", "POST", { amount: "10.00" });
    await apiJson("/api/v1/transactions/withdraw", "POST", { amount: "5.00" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/auth/csrf")).toHaveLength(1);
  });

  it("keeps the target-request timeout on the cached CSRF fast path", async () => {
    let targetSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (String(input) === "/api/auth/csrf") return Promise.resolve(csrfResponse());
      targetSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_, reject) => {
        targetSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await ensureCsrfToken();
    vi.useFakeTimers();
    const resultPromise = apiJson("/api/v1/transactions/deposit", "POST", { amount: "10.00" }, { timeoutMs: 250 }).then(
      (value) => ({ value }),
      (error: unknown) => ({ error })
    );

    try {
      await vi.advanceTimersByTimeAsync(250);
      const result = await resultPromise;
      expect(result).toHaveProperty("error", expect.objectContaining({ kind: "timeout", retryableTransport: true }));
      expect(targetSignal?.aborted).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/auth/csrf")).toHaveLength(1);
    } finally {
      await resultPromise;
      vi.useRealTimers();
    }
  });

  it.each([400, 403, 404, 409, 500, 503])("normalizes backend status %s without changing the status", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: `ERR_${status}`, message: `Backend ${status}` }), { status })));
    await expect(apiGet("/api/v1/accounts/my")).rejects.toMatchObject({ status, code: `ERR_${status}`, message: `Backend ${status}` });
  });

  it("parses lossless JSON recursively", () => {
    expect(parseJsonLossless('{"amount":99999999999999999999.9999,"items":[1]}')).toEqual({ amount: "99999999999999999999.9999", items: [1] });
  });
});
