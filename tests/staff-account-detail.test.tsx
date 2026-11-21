import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/errors";

const mocks = vi.hoisted(() => ({ byId: vi.fn(), branches: vi.fn(), update: vi.fn(), close: vi.fn() }));

vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", role: "TELLER" }) }));
vi.mock("@/lib/api/accounts", () => ({
  accountsApi: { byId: mocks.byId, branches: mocks.branches, update: mocks.update, close: mocks.close }
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>
}));

import { StaffAccountDetail } from "@/components/banking/StaffAccountDetail";

const account = {
  accountId: "40000000-0000-4000-8000-000000000001", accountNumber: "1000000001", accountType: "SAVINGS",
  accountStatus: "ACTIVE", balance: "1250.1234", createdAt: "2026-01-02T03:04:05", updatedAt: "2026-01-03T04:05:06"
} as const;
const branch = { branchId: 22, branchName: "Harbour Branch", address: "12 Harbour Road" };
const updatedAccount = { ...account, accountType: "FIXED_DEPOSIT", updatedAt: "2026-02-01T00:00:00" };

beforeEach(() => {
  mocks.byId.mockResolvedValue(account);
  mocks.branches.mockResolvedValue([branch]);
  mocks.update.mockResolvedValue(updatedAccount);
  mocks.close.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("staff account detail and management", () => {
  it("shows authoritative account fields, keeps identifiers distinct and links to account-scoped history", async () => {
    render(<StaffAccountDetail accountId={account.accountId} />);

    expect(await screen.findByRole("heading", { name: "1000000001" })).toBeInTheDocument();
    expect(screen.getByText(account.accountId)).toBeInTheDocument();
    expect(screen.getByText("1250.1234 LKR")).toBeInTheDocument();
    expect(screen.getByText(/does not return a customer record UUID, linked user UUID, or branch/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /transaction history/i })).toHaveAttribute("href", `/staff/accounts/${account.accountId}/transactions`);
    expect(screen.queryByRole("link", { name: /customer details/i })).not.toBeInTheDocument();
  });

  it("requires review, sends the exact update DTO, and refreshes account details", async () => {
    mocks.byId
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce(updatedAccount);
    render(<StaffAccountDetail accountId={account.accountId} />);
    await screen.findByRole("heading", { name: "1000000001" });
    fireEvent.click(screen.getByRole("button", { name: /edit account type or branch/i }));
    await screen.findByRole("option", { name: /Harbour Branch/ });
    fireEvent.change(screen.getByLabelText("Account type"), { target: { value: "FIXED_DEPOSIT" } });
    fireEvent.change(screen.getByLabelText("Branch to set"), { target: { value: "22" } });
    fireEvent.click(screen.getByRole("button", { name: /review account changes/i }));

    expect(screen.getByRole("region", { name: /review account changes/i })).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /confirm account changes/i }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(account.accountId, {
      accountType: "FIXED_DEPOSIT", initialDeposit: "1250.1234", branchId: 22
    }));
    expect(await screen.findByText(/account update confirmed/i)).toBeInTheDocument();
    expect(mocks.byId).toHaveBeenCalledTimes(3);
  });

  it("requires explicit acknowledgment before closing a nonzero-balance account and refreshes status", async () => {
    const closed = { ...account, accountStatus: "CLOSED" };
    mocks.byId.mockResolvedValueOnce(account).mockResolvedValueOnce(account).mockResolvedValueOnce(closed);
    render(<StaffAccountDetail accountId={account.accountId} />);
    await screen.findByRole("heading", { name: "1000000001" });
    fireEvent.click(screen.getByRole("button", { name: /close account/i }));

    expect(screen.getByText(/does not check the balance, transfer funds, or create a ledger posting/i)).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: /confirm close account/i });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /i understand the remaining balance will stay in this account/i }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(mocks.close).toHaveBeenCalledWith(account.accountId));
    expect(await screen.findByText(/account closed by bank-core/i)).toBeInTheDocument();
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
  });

  it("does not offer closure again for a closed account but preserves the supported update action", async () => {
    mocks.byId.mockResolvedValue({ ...account, accountStatus: "CLOSED", balance: "0.0000" });
    render(<StaffAccountDetail accountId={account.accountId} />);

    expect(await screen.findByText(/already closed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close account/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit account type or branch/i })).toBeEnabled();
  });

  it("stops an update when the account has changed since it was loaded", async () => {
    mocks.byId.mockResolvedValueOnce(account).mockResolvedValueOnce({ ...account, accountStatus: "CLOSED", updatedAt: "2026-02-01T00:00:00" });
    render(<StaffAccountDetail accountId={account.accountId} />);
    await screen.findByRole("heading", { name: "1000000001" });
    fireEvent.click(screen.getByRole("button", { name: /edit account type or branch/i }));
    await screen.findByRole("option", { name: /Harbour Branch/ });
    fireEvent.change(screen.getByLabelText("Branch to set"), { target: { value: "22" } });
    fireEvent.click(screen.getByRole("button", { name: /review account changes/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm account changes/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/changed since this page loaded/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps a backend permission rejection definitive", async () => {
    mocks.update.mockRejectedValueOnce(new ApiError({ kind: "backend", status: 403, code: "ERR_FORBIDDEN", message: "Access denied" }));
    mocks.byId.mockResolvedValue(account);
    render(<StaffAccountDetail accountId={account.accountId} />);
    await screen.findByRole("heading", { name: "1000000001" });
    fireEvent.click(screen.getByRole("button", { name: /edit account type or branch/i }));
    await screen.findByRole("option", { name: /Harbour Branch/ });
    fireEvent.change(screen.getByLabelText("Branch to set"), { target: { value: "22" } });
    fireEvent.click(screen.getByRole("button", { name: /review account changes/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm account changes/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not permitted to update accounts/i);
    expect(screen.queryByText(/outcome is uncertain/i)).not.toBeInTheDocument();
  });
});
