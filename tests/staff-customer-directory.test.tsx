import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { customersApi } from "@/lib/api/customers";
import { StaffCustomerDirectory } from "@/components/banking/StaffCustomerDirectory";
import type { Customer } from "@/lib/api/contracts";
import { ApiError } from "@/lib/api/errors";

const records: Customer[] = [
  { customerId: "customer-1", userId: "user-1", firstName: "Ava", lastName: "Martin", email: "ava@example.test", phone: "0711111111", status: "ACTIVE" },
  { customerId: "customer-2", userId: "user-2", firstName: "Morgan", lastName: "Reed", email: "morgan@example.test", phone: "0722222222", status: "PENDING" }
];

afterEach(() => vi.restoreAllMocks());

describe("staff customer directory", () => {
  it("loads the authoritative list once and filters locally without requesting unsupported pagination", async () => {
    const list = vi.spyOn(customersApi, "listStaffCustomers").mockResolvedValue(records);
    render(<StaffCustomerDirectory />);

    expect(await screen.findByText("Ava Martin")).toBeInTheDocument();
    expect(screen.getByText("Morgan Reed")).toBeInTheDocument();
    expect(screen.getByText(/complete list without pagination/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search customer records"), { target: { value: "morgan@" } });

    expect(await screen.findByText("Morgan Reed")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Ava Martin")).not.toBeInTheDocument());
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("shows a recoverable forbidden state", async () => {
    vi.spyOn(customersApi, "listStaffCustomers").mockRejectedValue(new ApiError({ kind: "backend", status: 403, message: "Denied" }));
    render(<StaffCustomerDirectory />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/not permitted/i);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
