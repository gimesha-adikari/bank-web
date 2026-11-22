import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/errors";
import type { TellerEmployee, TellerUserDirectoryEntry } from "@/lib/api/contracts";

const mocks = vi.hoisted(() => ({ list: vi.fn(), users: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/api/tellers", () => ({ tellersApi: mocks }));

import { ManagerTellerDirectory } from "@/components/banking/ManagerTellerDirectory";

const candidate: TellerUserDirectoryEntry = {
  userId: "user-nina", username: "nina", firstName: "Nina", lastName: "Candidate", email: "nina@example.test",
  role: { roleId: "role-customer", roleName: "CUSTOMER", description: null }, isActive: true,
  address: "1 User Road", mobileNumber: "0711111111"
};
const teller: TellerEmployee = {
  firstName: "Sam", lastName: "Teller", email: "sam@example.test", roleName: "TELLER", status: "ACTIVE",
  department: "Operations", phone: "0722222222", address: "2 Teller Road", gender: "OTHER",
  dateOfBirth: "1990-01-02", hireDate: "2025-01-15T10:00:00", managerId: "employee-manager-id", userId: "user-sam"
};

async function completeAssignmentForm() {
  fireEvent.click(screen.getByRole("button", { name: "Assign existing customer as Teller" }));
  await screen.findByRole("option", { name: /Nina Candidate · nina@example\.test/ });
  fireEvent.change(screen.getByLabelText("Existing customer login"), { target: { value: candidate.userId } });
  fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "0712345678" } });
  fireEvent.change(screen.getByLabelText("Address"), { target: { value: "3 New Teller Road" } });
  fireEvent.change(screen.getByLabelText("Gender"), { target: { value: "OTHER" } });
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1991-05-06" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([]);
  mocks.users.mockResolvedValue([candidate]);
  mocks.create.mockResolvedValue("Teller assigned successfully");
  mocks.update.mockResolvedValue("Teller updated");
  mocks.remove.mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("Manager Teller directory", () => {
  it("filters the loaded employee records locally without repeated list requests", async () => {
    mocks.list.mockResolvedValue([teller, { ...teller, firstName: "Former", email: "former@example.test", status: "INACTIVE", userId: null }]);
    render(<ManagerTellerDirectory />);
    expect(await screen.findByText("Sam Teller")).toBeInTheDocument();
    expect(screen.getByText(/without pagination or server-side search/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search tellers"), { target: { value: "former" } });
    expect(screen.getByText("Former Teller")).toBeInTheDocument();
    expect(screen.queryByText("Sam Teller")).not.toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.users).not.toHaveBeenCalled();
  });

  it("creates from an existing active customer login and sends the exact request using its user UUID", async () => {
    const saved = { ...teller, firstName: "Nina", lastName: "Candidate", email: candidate.email, userId: candidate.userId };
    mocks.list.mockResolvedValueOnce([]).mockResolvedValueOnce([saved]);
    render(<ManagerTellerDirectory />);
    await screen.findByRole("button", { name: "Assign existing customer as Teller" });
    await completeAssignmentForm();
    fireEvent.change(screen.getByLabelText("Department (optional)"), { target: { value: "Branch Operations" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign Teller" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(candidate.userId, {
      email: candidate.email, firstName: candidate.firstName, lastName: candidate.lastName,
      phone: "0712345678", address: "3 New Teller Road", gender: "OTHER",
      dateOfBirth: "1991-05-06", department: "Branch Operations"
    }));
    expect(await screen.findByText("Teller assignment was confirmed by bank-core.")).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("blocks invalid dates before sending a Teller mutation", async () => {
    render(<ManagerTellerDirectory />);
    await screen.findByRole("button", { name: "Assign existing customer as Teller" });
    await completeAssignmentForm();
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2999-01-01" } });
    fireEvent.submit(screen.getByRole("button", { name: "Assign Teller" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(/date of birth must be before today/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("prevents duplicate submission while assignment is pending", async () => {
    let finish: ((result: string) => void) | undefined;
    mocks.create.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<ManagerTellerDirectory />);
    await screen.findByRole("button", { name: "Assign existing customer as Teller" });
    await completeAssignmentForm();
    const submit = screen.getByRole("button", { name: "Assign Teller" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => { finish?.("Teller assigned successfully"); });
    expect(await screen.findByText("Teller assignment was confirmed by bank-core.")).toBeInTheDocument();
  });

  it("updates with the linked user UUID rather than an employee identifier", async () => {
    mocks.list.mockResolvedValue([teller]);
    render(<ManagerTellerDirectory />);
    fireEvent.click(await screen.findByRole("button", { name: /view sam teller/i }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Teller profile" }));
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "0733333333" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Teller profile" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("user-sam", expect.objectContaining({ phone: "0733333333" })));
  });

  it("requires confirmation for the backend removal and explains the login role/session effects", async () => {
    mocks.list.mockResolvedValue([teller]);
    render(<ManagerTellerDirectory />);
    fireEvent.click(await screen.findByRole("button", { name: /view sam teller/i }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Teller assignment" }));
    expect(screen.getByText(/changes the linked login role to CUSTOMER/i)).toBeInTheDocument();
    expect(screen.getByText(/current Teller session may retain Teller authorization/i)).toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("user-sam"));
  });

  it("reconciles uncertain creation with a read and never automatically resends it", async () => {
    let persisted = false;
    mocks.list.mockImplementation(async () => persisted ? [{ ...teller, firstName: "Nina", lastName: "Candidate", email: candidate.email, userId: candidate.userId }] : []);
    mocks.create.mockImplementationOnce(async () => {
      persisted = true;
      throw new ApiError({ kind: "timeout", status: 0, message: "Timed out", retryableTransport: true });
    });
    render(<ManagerTellerDirectory />);
    await screen.findByRole("button", { name: "Assign existing customer as Teller" });
    await completeAssignmentForm();
    fireEvent.click(screen.getByRole("button", { name: "Assign Teller" }));

    expect(await screen.findByText(/previous response was interrupted/i)).toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("keeps an unresolved operation blocked when read-only reconciliation cannot find it", async () => {
    mocks.create.mockRejectedValueOnce(new ApiError({ kind: "timeout", status: 0, message: "Timed out", retryableTransport: true }));
    render(<ManagerTellerDirectory />);
    await screen.findByRole("button", { name: "Assign existing customer as Teller" });
    await completeAssignmentForm();
    fireEvent.click(screen.getByRole("button", { name: "Assign Teller" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/outcome remains unconfirmed/i);
    expect(screen.getByRole("button", { name: "Assign Teller" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Check current state" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.list).toHaveBeenCalledTimes(3);
  });

  it("shows a conflict as definitive and leaves the write un-retried", async () => {
    mocks.create.mockRejectedValueOnce(new ApiError({ kind: "backend", status: 409, code: "ERR_CONFLICT", message: "Conflict" }));
    render(<ManagerTellerDirectory />);
    await screen.findByRole("button", { name: "Assign existing customer as Teller" });
    await completeAssignmentForm();
    fireEvent.click(screen.getByRole("button", { name: "Assign Teller" }));
    expect(await screen.findByText(/email or user assignment conflicts/i)).toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
