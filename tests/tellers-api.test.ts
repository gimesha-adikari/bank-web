import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TellerRequest } from "@/lib/api/contracts";
import { tellersApi } from "@/lib/api/tellers";
import { invalidateCsrfToken } from "@/lib/api/http";

const csrf = "t".repeat(43);
const tellerRequest: TellerRequest = {
  email: "teller@example.test", firstName: "Casey", lastName: "Teller", phone: "0712345678",
  address: "1 Test Street", gender: "OTHER", dateOfBirth: "1990-01-02", department: "Operations"
};

describe("Manager Teller API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateCsrfToken();
  });

  it("uses the implemented unpaginated teller and user directories", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(tellersApi.list()).resolves.toEqual([]);
    await expect(tellersApi.users()).resolves.toEqual([]);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/tellers", "/api/v1/tellers/users"
    ]);
  });

  it("creates and updates through the exact userId contracts with CSRF and no idempotency header", async () => {
    const userId = "0ce3cd10-6395-4acd-9a40-000000000901";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: csrf }))
      .mockResolvedValueOnce(new Response("Teller assigned successfully", { status: 201 }))
      .mockResolvedValueOnce(new Response("Teller updated", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(tellersApi.create(userId, tellerRequest)).resolves.toBe("Teller assigned successfully");
    await expect(tellersApi.update(userId, tellerRequest)).resolves.toBe("Teller updated");

    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/v1/tellers?userId=${userId}`);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`/api/v1/tellers/${userId}`);
    for (const [, options] of fetchMock.mock.calls.slice(1) as [string, RequestInit][]) {
      expect(options.method).toMatch(/^(POST|PUT)$/);
      expect(new Headers(options.headers).get("x-csrf-token")).toBe(csrf);
      expect(new Headers(options.headers).get("idempotency-key")).toBeNull();
      expect(JSON.parse(String(options.body))).toEqual(tellerRequest);
    }
  });

  it("removes by linked user UUID and preserves authorization errors", async () => {
    const userId = "0ce3cd10-6395-4acd-9a40-000000000901";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: csrf }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(tellersApi.remove(userId)).resolves.toBeUndefined();
    const options = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/v1/tellers/${userId}`);
    expect(options.method).toBe("DELETE");
    expect(new Headers(options.headers).get("x-csrf-token")).toBe(csrf);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "Denied" }, { status: 403 })));
    await expect(tellersApi.list()).rejects.toMatchObject({ status: 403 });
  });
});
