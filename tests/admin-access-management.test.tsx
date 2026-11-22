import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/errors";
import type {
  AdminAccessRole,
  AdminEmployeeRecord,
  AdminManagerDirectoryEntry,
  AdminRoleUpdateRequest,
  AdminUserDirectoryEntry
} from "@/lib/api/contracts";

const mocks = vi.hoisted(() => ({
  listRoles: vi.fn(), listEmployees: vi.fn(), listManagers: vi.fn(), listUsers: vi.fn(),
  getUserByUsername: vi.fn(), updateUserRole: vi.fn()
}));
vi.mock("@/lib/api/admin-access", () => ({ adminAccessApi: mocks }));
vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ username: "root.admin" }) }));

import { AdminAccessManagement } from "@/components/banking/AdminAccessManagement";

const roles: AdminAccessRole[] = [
  { roleId: "role-customer", roleName: "CUSTOMER", description: null },
  { roleId: "role-manager", roleName: "MANAGER", description: null },
  { roleId: "role-teller", roleName: "TELLER", description: null }
];
const managers: AdminManagerDirectoryEntry[] = [];
const customer: AdminUserDirectoryEntry = {
  userId: "user-ava", username: "ava.customer", email: "ava@example.test", firstName: "Ava", lastName: "Customer",
  role: { roleId: "role-customer", roleName: "CUSTOMER", description: null }, isActive: true,
  lastLoginAt: null, createdAt: null, address: "1 Test Road", city: null, state: null, country: null,
  postalCode: null, homeNumber: null, workNumber: null, officeNumber: null, mobileNumber: "0712345678", emailVerified: true
};
const inactive: AdminUserDirectoryEntry = { ...customer, userId: "user-inactive", username: "inactive.customer", isActive: false };

function employeeFromRequest(request: AdminRoleUpdateRequest): AdminEmployeeRecord {
  return {
    firstName: request.firstName, lastName: request.lastName, email: request.email, roleName: request.roleName,
    status: request.status, department: request.department || null, phone: request.phone, address: request.address,
    gender: request.gender, dateOfBirth: request.dateOfBirth, hireDate: "2026-01-01T00:00:00",
    managerId: request.managerId ?? null, userId: customer.userId
  };
}

let currentUser: AdminUserDirectoryEntry;
let currentEmployees: AdminEmployeeRecord[];

function mount() {
  render(<AdminAccessManagement />);
  return screen.findByRole("button", { name: "View ava.customer account" });
}

async function openEditorAndReview(targetRole = "MANAGER") {
  fireEvent.click(await screen.findByRole("button", { name: "View ava.customer account" }));
  fireEvent.click(await screen.findByRole("button", { name: "Change role and employee access" }));
  fireEvent.change(screen.getByLabelText("Target role"), { target: { value: targetRole } });
  fireEvent.change(screen.getByLabelText("Employee status"), { target: { value: "ACTIVE" } });
  fireEvent.change(screen.getByLabelText("Gender"), { target: { value: "OTHER" } });
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1991-05-06" } });
  fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "0712345678" } });
  fireEvent.change(screen.getByLabelText("Address"), { target: { value: "2 Staff Road" } });
  fireEvent.change(screen.getByLabelText("Department"), { target: { value: "Operations" } });
  fireEvent.click(screen.getByRole("button", { name: "Review role change" }));
  expect(await screen.findByRole("region", { name: "Confirm role change" })).toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = customer;
  currentEmployees = [];
  mocks.listUsers.mockImplementation(async () => [currentUser, inactive]);
  mocks.listEmployees.mockImplementation(async () => currentEmployees);
  mocks.listRoles.mockResolvedValue(roles);
  mocks.listManagers.mockResolvedValue(managers);
  mocks.getUserByUsername.mockImplementation(async (username: string) => username === "inactive.customer" ? inactive : currentUser);
  mocks.updateUserRole.mockResolvedValue("User role and employee status updated successfully");
});

afterEach(() => vi.restoreAllMocks());

describe("Admin access management", () => {
  it("loads and locally filters users, then identifies linked user and employee IDs separately", async () => {
    currentEmployees = [employeeFromRequest({
      firstName: "Ava", lastName: "Customer", email: "ava@example.test", phone: "0712345678", address: "1 Test Road",
      roleName: "MANAGER", department: "Operations", status: "ACTIVE", gender: "OTHER", dateOfBirth: "1991-05-06"
    })];
    await mount();
    expect(screen.getByText(/searches below filter the loaded records locally/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "inactive" } });
    expect(screen.getByRole("button", { name: "View inactive.customer account" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View ava.customer account" })).not.toBeInTheDocument();
    expect(mocks.listUsers).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "ava.customer" } });
    fireEvent.click(screen.getByRole("button", { name: "View ava.customer account" }));
    expect(await screen.findByText("User UUID")).toBeInTheDocument();
    expect(await screen.findByText("user-ava")).toBeInTheDocument();
    expect(screen.getByText(/Customer record UUID is not returned/i)).toBeInTheDocument();
  });

  it("requires confirmation, prevents duplicate writes, and refreshes the authoritative role", async () => {
    let release: ((value: string) => void) | undefined;
    mocks.updateUserRole.mockImplementationOnce((_id: string, request: AdminRoleUpdateRequest) => new Promise<string>((resolve) => {
      release = resolve;
      currentUser = { ...currentUser, role: { roleId: "role-manager", roleName: "MANAGER", description: null } };
      currentEmployees = [employeeFromRequest(request)];
    }));
    await mount();
    await openEditorAndReview();
    const confirm = screen.getByRole("button", { name: "Confirm role change" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mocks.updateUserRole).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    await act(async () => { release?.("User role and employee status updated successfully"); });
    expect(await screen.findByRole("status")).toHaveTextContent(/bank-core confirmed the role change/i);
    expect(screen.getAllByText("MANAGER", { exact: true }).length).toBeGreaterThanOrEqual(1);
    expect(mocks.listUsers).toHaveBeenCalledTimes(2);
  });

  it("reconciles a persisted timeout by reads without resending the mutation", async () => {
    mocks.updateUserRole.mockImplementationOnce(async (_id: string, request: AdminRoleUpdateRequest) => {
      currentUser = { ...currentUser, role: { roleId: "role-manager", roleName: "MANAGER", description: null } };
      currentEmployees = [employeeFromRequest(request)];
      throw new ApiError({ kind: "timeout", status: 0, message: "Timed out", retryableTransport: true });
    });
    await mount();
    await openEditorAndReview();
    fireEvent.click(screen.getByRole("button", { name: "Confirm role change" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/response was interrupted.*authoritative user record now reports manager/i);
    expect(mocks.updateUserRole).toHaveBeenCalledTimes(1);
    expect(mocks.getUserByUsername).toHaveBeenCalledTimes(2);
  });

  it("does not let a generic detail refresh clear an unresolved role change", async () => {
    mocks.updateUserRole.mockRejectedValueOnce(new ApiError({ kind: "timeout", status: 0, message: "Timed out", retryableTransport: true }));
    await mount();
    await openEditorAndReview();
    fireEvent.click(screen.getByRole("button", { name: "Confirm role change" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/outcome remains unconfirmed/i);
    fireEvent.click(screen.getByRole("button", { name: "Refresh user" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/outcome remains unconfirmed/i);
    expect(screen.getByRole("button", { name: "Change role and employee access" })).toBeDisabled();
    expect(mocks.updateUserRole).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 400, message: /review the form and correct the returned fields/i, fields: { phone: "Invalid phone" } },
    { status: 401, message: /session has expired/i, fields: undefined },
    { status: 403, message: /does not permit this role change/i, fields: undefined }
  ])("keeps definitive HTTP $status role-change failures separate from transport uncertainty", async ({ status, message, fields }) => {
    mocks.updateUserRole.mockRejectedValueOnce(new ApiError({
      kind: "backend", status, code: status === 400 ? "ERR_VALIDATION" : "ERR_ACCESS", message: "Rejected", fieldErrors: fields
    }));
    await mount();
    await openEditorAndReview();
    fireEvent.click(screen.getByRole("button", { name: "Confirm role change" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((alert) => message.test(alert.textContent ?? ""))).toBe(true);
    if (fields) expect(screen.getByText("phone: Invalid phone")).toBeInTheDocument();
    expect(mocks.updateUserRole).toHaveBeenCalledTimes(1);
    expect(mocks.getUserByUsername).toHaveBeenCalledTimes(1);
  });

  it("keeps a write blocked if bank-core acknowledged it but authoritative refresh fails", async () => {
    mocks.updateUserRole.mockImplementationOnce(async (_id: string, request: AdminRoleUpdateRequest) => {
      currentUser = { ...currentUser, role: { roleId: "role-manager", roleName: "MANAGER", description: null } };
      currentEmployees = [employeeFromRequest(request)];
      return "User role and employee status updated successfully";
    });
    await mount();
    await openEditorAndReview();
    mocks.listUsers.mockRejectedValueOnce(new Error("refresh failed"));
    mocks.getUserByUsername.mockRejectedValueOnce(new Error("read failed")).mockRejectedValueOnce(new Error("read failed"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm role change" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/bank-core acknowledged the role change.*authoritative state could not be retrieved/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/outcome remains unconfirmed/i);
    expect(screen.getByRole("button", { name: "Confirm role change" })).toBeDisabled();
    expect(mocks.updateUserRole).toHaveBeenCalledTimes(1);
  });

  it("shows an inactive login without inventing a login activation action", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "View inactive.customer account" }));
    expect(await screen.findByText("Login active", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/no Admin endpoint here to activate or deactivate the user login/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /activate user/i })).not.toBeInTheDocument();
  });

  it("blocks role updates that could reassign an employee linked to a different user UUID", async () => {
    currentEmployees = [{
      ...employeeFromRequest({
        firstName: "Another", lastName: "Employee", email: customer.email, phone: "0711112222", address: "9 Other Road",
        roleName: "TELLER", department: "Operations", status: "ACTIVE", gender: "OTHER", dateOfBirth: "1989-02-01"
      }),
      userId: "different-user-uuid"
    }];
    await mount();
    fireEvent.click(await screen.findByRole("button", { name: "View ava.customer account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/linked to a different user UUID/i);
    expect(screen.getByRole("button", { name: "Change role and employee access" })).toBeDisabled();
    expect(mocks.updateUserRole).not.toHaveBeenCalled();
  });
});
