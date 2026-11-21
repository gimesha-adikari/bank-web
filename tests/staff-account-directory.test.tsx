import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/errors";

const mocks = vi.hoisted(() => ({ listStaffAccounts: vi.fn() }));

vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", role: "TELLER" }) }));
vi.mock("@/lib/api/accounts", () => ({ accountsApi: { listStaffAccounts: mocks.listStaffAccounts } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>
}));

import { StaffAccountDirectory } from "@/components/banking/StaffAccountDirectory";

const accounts = [
  {
    accountId: "40000000-0000-4000-8000-000000000001", accountNumber: "1000000001", accountType: "SAVINGS",
    accountStatus: "ACTIVE", balance: "1000.0500", createdAt: "2026-01-02T03:04:05", updatedAt: "2026-01-03T04:05:06"
  },
  {
    accountId: "40000000-0000-4000-8000-000000000002", accountNumber: "1000000002", accountType: "CHECKING",
    accountStatus: "CLOSED", balance: "0.0000"
  }
] as const;

beforeEach(() => mocks.listStaffAccounts.mockResolvedValue(accounts));
afterEach(() => vi.clearAllMocks());

describe("staff account directory", () => {
  it("lists server-returned accounts without inventing customer or branch details", async () => {
    render(<StaffAccountDirectory />);

    expect(await screen.findByRole("link", { name: "1000000001" })).toHaveAttribute("href", `/staff/accounts/${accounts[0].accountId}`);
    expect(screen.getByText("SAVINGS")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("1000.0500 LKR")).toBeInTheDocument();
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
    expect(screen.queryByText(/Ava|Customer record|Central Branch/)).not.toBeInTheDocument();
    expect(mocks.listStaffAccounts).toHaveBeenCalledTimes(1);
  });

  it("shows loading and empty states", async () => {
    mocks.listStaffAccounts.mockReturnValueOnce(new Promise<never>(() => undefined));
    const view = render(<StaffAccountDirectory />);
    expect(screen.getByRole("status")).toHaveTextContent(/Loading accounts/);
    view.unmount();

    mocks.listStaffAccounts.mockResolvedValueOnce([]);
    render(<StaffAccountDirectory />);
    expect(await screen.findByText(/No accounts were returned by bank-core/)).toBeInTheDocument();
  });

  it("reports forbidden access and supports an explicit reload", async () => {
    mocks.listStaffAccounts
      .mockRejectedValueOnce(new ApiError({ kind: "backend", status: 403, code: "ERR_FORBIDDEN", message: "Access denied" }))
      .mockResolvedValueOnce(accounts);
    render(<StaffAccountDirectory />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/not permitted to view account records/i);
    fireEvent.click(screen.getByRole("button", { name: /reload accounts/i }));
    await waitFor(() => expect(mocks.listStaffAccounts).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("link", { name: "1000000001" })).toBeInTheDocument();
  });
});
