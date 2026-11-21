import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerRecordRequest } from "@/lib/api/contracts";
import { customersApi } from "@/lib/api/customers";
import { invalidateCsrfToken } from "@/lib/api/http";

const endpoint = "/api/v1/customers/me";

describe("customer self-service API", () => {
  beforeEach(invalidateCsrfToken);
  afterEach(() => vi.unstubAllGlobals());

  it("maps bank-core's missing customer record to null", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ code: "ERR_NOT_FOUND", message: "Customer not found" }, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(customersApi.me()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: "GET", credentials: "same-origin" }));
  });

  it.each([401, 403, 404, 503])("keeps unexpected HTTP %d distinct from no customer record", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ code: "OTHER_ERROR" }, { status })));
    await expect(customersApi.me()).rejects.toMatchObject({ status });
  });

  it("uses the exact customer DTO and CSRF for the self-service PUT", async () => {
    const csrf = "a".repeat(43);
    const body: CustomerRecordRequest = {
      userId: "c76ce64e-38d4-4ad2-ad09-ace5d2dc14ce", firstName: "New", lastName: "Customer", gender: "OTHER",
      email: "customer@example.test", phone: "0712345678", address: "", dateOfBirth: "1990-05-01", status: "ACTIVE"
    };
    const saved = { ...body, customerId: "record-1" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: csrf }))
      .mockResolvedValueOnce(Response.json(saved));
    vi.stubGlobal("fetch", fetchMock);

    await expect(customersApi.save(body)).resolves.toEqual(saved);
    const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(endpoint);
    expect(options.method).toBe("PUT");
    expect(new Headers(options.headers).get("x-csrf-token")).toBe(csrf);
    expect(JSON.parse(String(options.body))).toEqual(body);
  });
});
