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
const zeroAccount = { ...account, balance: "0.0000" };

async function openCloseConfirmation() {
  render(<StaffAccountDetail accountId={account.accountId} />);
  fireEvent.click(await screen.findByRole("button", { name: "Close account" }));
  return screen.getByRole("button", { name: "Confirm close account" });
}

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

  it.each(["1250.1234", "-0.0001"])("blocks closure and preserves the exact balance text for %s", async (balance) => {
    mocks.byId.mockResolvedValue({ ...account, balance });
    render(<StaffAccountDetail accountId={account.accountId} />);
    const close = await screen.findByRole("button", { name: "Close account" });
    expect(close).toBeDisabled();
    expect(screen.getByText(`${balance} LKR`)).toBeInTheDocument();
    expect(screen.getByText(/bring the account balance to zero through authorized banking operations/i)).toBeInTheDocument();
    fireEvent.click(close);
    expect(screen.queryByRole("region", { name: "Close account confirmation" })).not.toBeInTheDocument();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it.each(["0", "0.00", "0.0000", "-0.0000"])("confirms closure for exact decimal zero %s with authoritative read-back", async (balance) => {
    const active = { ...account, balance };
    mocks.byId.mockResolvedValueOnce(active).mockResolvedValueOnce(active)
      .mockResolvedValueOnce({ ...active, accountStatus: "CLOSED" });
    const confirm = await openCloseConfirmation();
    expect(confirm).toBeEnabled();
    expect(screen.getByText(/bank-core checks the current account and ledger balances/i)).toBeInTheDocument();
    expect(mocks.close).not.toHaveBeenCalled();
    fireEvent.click(confirm);

    expect(await screen.findByText(/account closed by bank-core/i)).toBeInTheDocument();
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close account" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /transaction history/i })).toBeInTheDocument();
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(account.accountId);
    expect(mocks.byId).toHaveBeenCalledTimes(3);
  });

  it("keeps a frozen account ineligible even at zero", async () => {
    mocks.byId.mockResolvedValue({ ...zeroAccount, accountStatus: "FROZEN" });
    render(<StaffAccountDetail accountId={account.accountId} />);
    expect(await screen.findByRole("button", { name: "Close account" })).toBeDisabled();
    expect(screen.getByText(/only active accounts can be closed/i)).toBeInTheDocument();
  });

  it("stops closure when the fresh read reports that funds arrived", async () => {
    mocks.byId.mockResolvedValueOnce(zeroAccount).mockResolvedValueOnce({ ...zeroAccount, balance: "0.0001" });
    fireEvent.click(await openCloseConfirmation());

    expect(await screen.findByRole("alert")).toHaveTextContent(/account changed since this page loaded/i);
    expect(screen.getByText("0.0001 LKR")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close account" })).toBeDisabled();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it("shows a nonzero ledger balance rejection despite displayed zero and refreshes the active record", async () => {
    mocks.byId.mockResolvedValue(zeroAccount);
    mocks.close.mockRejectedValueOnce(new ApiError({
      kind: "backend", status: 422, code: "ERR_ACCOUNT_BALANCE_NONZERO", message: "Account and ledger balances must both be zero to close"
    }));
    fireEvent.click(await openCloseConfirmation());

    expect(await screen.findByRole("alert")).toHaveTextContent(/rejected closure because the account balance or the ledger balance is nonzero/i);
    expect(mocks.byId).toHaveBeenCalledTimes(3);
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("0.0000 LKR")).toBeInTheDocument();
    expect(screen.queryByText(/account closed by bank-core/i)).not.toBeInTheDocument();
  });

  it("stops when the preflight read fails, before any DELETE is submitted", async () => {
    mocks.byId.mockResolvedValueOnce(zeroAccount).mockRejectedValueOnce(new ApiError({ kind: "timeout", message: "Request timed out" }));
    fireEvent.click(await openCloseConfirmation());

    expect(await screen.findByRole("alert")).toHaveTextContent(/closure was not submitted.*request timed out/i);
    expect(mocks.byId).toHaveBeenCalledTimes(2);
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it("keeps closure disabled after 204 until a fresh read confirms the current state", async () => {
    mocks.byId.mockResolvedValueOnce(zeroAccount).mockResolvedValueOnce(zeroAccount)
      .mockRejectedValueOnce(new ApiError({ kind: "timeout", message: "Request timed out" }))
      .mockResolvedValueOnce({ ...zeroAccount, accountStatus: "CLOSED" });
    fireEvent.click(await openCloseConfirmation());

    expect(await screen.findByText(/confirmed closure, but the current account status could not be verified/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close account" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh account details" }));
    expect(await screen.findByText("CLOSED")).toBeInTheDocument();
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("keeps an uncertain close unresolved when read-back fails, then rechecks without a second DELETE", async () => {
    const timedOut = new ApiError({ kind: "timeout", message: "Request timed out" });
    mocks.byId.mockResolvedValueOnce(zeroAccount).mockResolvedValueOnce(zeroAccount)
      .mockRejectedValueOnce(timedOut).mockResolvedValueOnce({ ...zeroAccount, accountStatus: "CLOSED" });
    mocks.close.mockRejectedValueOnce(timedOut);
    fireEvent.click(await openCloseConfirmation());

    expect(await screen.findByText(/close result is uncertain and bank-core could not confirm the current status/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close account" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh account details" }));
    expect(await screen.findByText(/a read-back confirms that bank-core closed this account/i)).toBeInTheDocument();
    expect(mocks.close).toHaveBeenCalledTimes(1);
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
