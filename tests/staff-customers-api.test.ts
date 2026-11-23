import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerRecordRequest } from "@/lib/api/contracts";
import { customersApi } from "@/lib/api/customers";
import { invalidateCsrfToken } from "@/lib/api/http";

const csrf = "s".repeat(43);
const customer = {
  customerId: "customer-record-1", userId: "customer-user-1", username: "existing-customer",
  firstName: "Ada", lastName: "Customer", gender: "OTHER", email: "ada@example.test", phone: "0712345678",
  address: "1 Main Road", dateOfBirth: "1990-04-03", status: "ACTIVE"
};
const request: CustomerRecordRequest = {
  userId: customer.userId, firstName: "Ada", lastName: "Customer", gender: "OTHER", email: "ada@example.test",
  phone: "0712345678", address: "1 Main Road", dateOfBirth: "1990-04-03", status: "ACTIVE"
};

describe("staff customer API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateCsrfToken();
  });

  it("lists all customer records from the unpaginated backend endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json([customer]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(customersApi.listStaffCustomers()).resolves.toEqual([customer]);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/customers", expect.objectContaining({ method: "GET", credentials: "same-origin" }));
  });

  it("looks up details by customerId and searches existing customer user identities", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(customer))
      .mockResolvedValueOnce(Response.json([{ userId: customer.userId, username: customer.username, firstName: "Ada", roleName: "CUSTOMER" }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(customersApi.getStaffCustomer(customer.customerId)).resolves.toEqual(customer);
    await customersApi.searchCustomerUsers("Ada & Co");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/customers/customer-record-1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/users/all?search=Ada+%26+Co");
  });

  it("sends a CSRF-protected customer DELETE and requires a 204 response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: csrf }))
      .mockResolvedValueOnce(Response.json({ message: "Unexpected success response" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(customersApi.deleteStaffCustomer(customer.customerId)).rejects.toMatchObject({ kind: "parse", status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/customers/customer-record-1");
    expect(options).toMatchObject({ method: "DELETE", redirect: "error", body: undefined });
    expect(new Headers(options.headers).get("x-csrf-token")).toBe(csrf);

    await expect(customersApi.deleteStaffCustomer(customer.customerId)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("creates and updates records with the exact required DTO and CSRF protection", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: csrf }))
      .mockResolvedValueOnce(Response.json(customer, { status: 201 }))
      .mockResolvedValueOnce(Response.json(customer));
    vi.stubGlobal("fetch", fetchMock);

    await customersApi.createStaffCustomer(request);
    await customersApi.updateStaffCustomer(request);

    const [, createOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    const [, updateOptions] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/customers");
    expect(createOptions.method).toBe("POST");
    expect(new Headers(createOptions.headers).get("x-csrf-token")).toBe(csrf);
    expect(JSON.parse(String(createOptions.body))).toEqual(request);
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/v1/customers");
    expect(updateOptions.method).toBe("PUT");
    expect(new Headers(updateOptions.headers).get("x-csrf-token")).toBe(csrf);
    expect(JSON.parse(String(updateOptions.body))).toEqual(request);
  });

  it.each([401, 403, 404, 503])("preserves backend status %i for staff operations", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ code: "ERR_BACKEND" }, { status })));
    await expect(customersApi.getStaffCustomer(customer.customerId)).rejects.toMatchObject({ status });
  });
});
