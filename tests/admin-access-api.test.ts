import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminAccessApi } from "@/lib/api/admin-access";
import type { AdminRoleUpdateRequest } from "@/lib/api/contracts";
import { invalidateCsrfToken } from "@/lib/api/http";

const csrf = "x".repeat(43);
const request: AdminRoleUpdateRequest = {
  firstName: "Alex", lastName: "Customer", email: "alex@example.test", phone: "0712345678",
  address: "1 Test Road", roleName: "MANAGER", department: "Operations", status: "ACTIVE",
  gender: "OTHER", dateOfBirth: "1991-05-06"
};

describe("Admin access API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateCsrfToken();
  });

  it("uses the actual role, employee, manager and user directory endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json({ userId: "user-1", username: "alex", email: "alex@example.test" }));
    vi.stubGlobal("fetch", fetchMock);

    await adminAccessApi.listRoles();
    await adminAccessApi.listEmployees();
    await adminAccessApi.listManagers();
    await adminAccessApi.listUsers();
    await adminAccessApi.getUserByUsername("alex+admin");

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/access-control/roles",
      "/api/v1/access-control/employees",
      "/api/v1/access-control/employees/managers",
      "/api/v1/access-control/users",
      "/api/v1/access-control/users/alex%2Badmin"
    ]);
  });

  it("updates a role through the exact user UUID endpoint with CSRF and without idempotency claims", async () => {
    const userId = "0ce3cd10-6395-4acd-9a40-000000000921";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: csrf }))
      .mockResolvedValueOnce(new Response("User role and employee status updated successfully", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(adminAccessApi.updateUserRole(userId, request)).resolves.toBe("User role and employee status updated successfully");
    const [path, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(path).toBe(`/api/v1/access-control/roles/${userId}`);
    expect(options.method).toBe("PUT");
    expect(new Headers(options.headers).get("x-csrf-token")).toBe(csrf);
    expect(new Headers(options.headers).get("idempotency-key")).toBeNull();
    expect(JSON.parse(String(options.body))).toEqual(request);
  });

  it.each([401, 403, 404, 409, 400, 503])("preserves backend status %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ code: "ERR_BACKEND" }, { status })));
    await expect(adminAccessApi.getUserByUsername("alex")).rejects.toMatchObject({ status });
  });
});
