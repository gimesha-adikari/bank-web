import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/errors";

const mocks = vi.hoisted(() => ({
  customers: vi.fn(),
  branches: vi.fn(),
  openAccount: vi.fn(),
  byId: vi.fn()
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", role: "TELLER" })
}));
vi.mock("@/lib/api/staff", () => ({
  staffApi: { customers: mocks.customers, branches: mocks.branches, openAccount: mocks.openAccount }
}));
vi.mock("@/lib/api/accounts", () => ({ accountsApi: { byId: mocks.byId } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>
}));

import { StaffAccountForm } from "@/components/banking/StaffAccountForm";

const customer = {
  customerId: "30000000-0000-4000-8000-000000000001",
  userId: "0ce3cd10-6395-4acd-9a40-000000000001",
  username: "ava.martin",
  firstName: "Ava",
  lastName: "Martin",
  email: "ava.martin@example.test",
  status: "ACTIVE"
} as const;
const branch = { branchId: 21, branchName: "Central Branch", address: "5 Main Street", contactNumber: "0112234567" };
const openedAccount = {
  accountId: "90000000-0000-4000-8000-000000000001",
  accountNumber: "8000000001",
  accountType: "SAVINGS",
  accountStatus: "ACTIVE",
  balance: "1000.1000"
} as const;

function renderForm(search = `?customerUserId=${customer.userId}`) {
  window.history.replaceState({}, "", `/staff/accounts/new${search}`);
  return render(<StaffAccountForm />);
}

async function fillValidDeposit(value: string, accountType = "SAVINGS") {
  await screen.findByRole("option", { name: /Ava Martin/ });
  fireEvent.change(screen.getByLabelText("Account type"), { target: { value: accountType } });
  fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "21" } });
  fireEvent.change(screen.getByLabelText(/Initial deposit/), { target: { value } });
}

beforeEach(() => {
  mocks.customers.mockResolvedValue([customer]);
  mocks.branches.mockResolvedValue([branch]);
  mocks.openAccount.mockResolvedValue(openedAccount);
  mocks.byId.mockResolvedValue(openedAccount);
});
afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("Teller-assisted account opening", () => {
  it("uses the linked user UUID and integer branch, then refreshes and shows the backend receipt", async () => {
    renderForm();
    await fillValidDeposit("1000.10");
    fireEvent.click(screen.getByRole("button", { name: "Open account" }));

    expect(await screen.findByText("Account opened")).toBeInTheDocument();
    expect(mocks.openAccount).toHaveBeenCalledWith(customer.userId, {
      accountType: "SAVINGS", initialDeposit: "1000.10", branchId: 21
    });
    expect(mocks.byId).toHaveBeenCalledWith(openedAccount.accountId);
    expect(screen.getByText("8000000001")).toBeInTheDocument();
    expect(screen.getByText("SAVINGS")).toBeInTheDocument();
    expect(screen.getAllByText("ACTIVE", { exact: true })).toHaveLength(2);
    expect(screen.getAllByText("1000.1000 LKR", { exact: true })).toHaveLength(2);
    expect(screen.getByText(/Ava Martin/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /transaction history/i })).toHaveAttribute("href", "/staff/accounts/90000000-0000-4000-8000-000000000001/transactions");
    expect(screen.getByRole("link", { name: /customer details/i })).toHaveAttribute("href", `/staff/customers/${customer.customerId}`);
  });

  it("accepts a zero checking deposit as the exact decimal string", async () => {
    renderForm();
    await fillValidDeposit("0", "CHECKING");
    fireEvent.click(screen.getByRole("button", { name: "Open account" }));

    await waitFor(() => expect(mocks.openAccount).toHaveBeenCalledWith(customer.userId, {
      accountType: "CHECKING", initialDeposit: "0", branchId: 21
    }));
  });

  it("blocks a savings deposit below the backend minimum before submission", async () => {
    renderForm();
    await fillValidDeposit("999.99");
    fireEvent.click(screen.getByRole("button", { name: "Open account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("minimum opening deposit is 1000.00 LKR");
    expect(mocks.openAccount).not.toHaveBeenCalled();
  });

  it("prevents duplicate clicks from sending two opening requests while one is pending", async () => {
    let finishOpening!: (account: typeof openedAccount) => void;
    mocks.openAccount.mockImplementationOnce(() => new Promise((resolve) => { finishOpening = resolve; }));
    renderForm();
    await fillValidDeposit("1000.00");
    const button = screen.getByRole("button", { name: "Open account" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.openAccount).toHaveBeenCalledTimes(1);
    finishOpening(openedAccount);
    expect(await screen.findByText("Account opened")).toBeInTheDocument();
  });

  it("rejects a customer record UUID passed as the user UUID", async () => {
    renderForm(`?customerUserId=${customer.customerId}`);

    expect(await screen.findByRole("alert")).toHaveTextContent(/does not match an existing customer login/i);
    expect(mocks.openAccount).not.toHaveBeenCalled();
  });

  it("does not offer a retry after an uncertain Teller opening result", async () => {
    mocks.openAccount.mockRejectedValueOnce(new ApiError({ kind: "network", message: "The banking service could not be reached.", retryableTransport: true }));
    renderForm();
    await fillValidDeposit("1000.00");
    fireEvent.click(screen.getByRole("button", { name: "Open account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/may already have been created/i);
    expect(screen.queryByRole("button", { name: /open account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(mocks.openAccount).toHaveBeenCalledTimes(1);
  });

  it("keeps backend authorization failures definitive", async () => {
    mocks.openAccount.mockRejectedValueOnce(new ApiError({ kind: "backend", status: 403, code: "ERR_FORBIDDEN", message: "Access denied" }));
    renderForm();
    await fillValidDeposit("1000.00");
    fireEvent.click(screen.getByRole("button", { name: "Open account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Teller role is not permitted/i);
    expect(screen.queryByText(/may already have been created/i)).not.toBeInTheDocument();
  });

  it("surfaces an explicit backend deposit rejection as recoverable validation feedback", async () => {
    mocks.openAccount.mockRejectedValueOnce(new ApiError({
      kind: "backend", status: 422, code: "ERR_MIN_DEPOSIT", message: "Minimum initial deposit for SAVINGS is 1000.00"
    }));
    renderForm();
    await fillValidDeposit("1000.00");
    fireEvent.click(screen.getByRole("button", { name: "Open account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Bank-core rejected the account-opening details/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/1000.00/);
    expect(screen.getByRole("button", { name: "Open account" })).toBeInTheDocument();
    expect(screen.queryByText(/may already have been created/i)).not.toBeInTheDocument();
  });
});
