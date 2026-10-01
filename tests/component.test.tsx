import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransactionTable } from "@/components/banking/TransactionTable";

describe("banking components", () => {
  it("renders an accessible empty history state", () => {
    render(<TransactionTable transactions={[]} />);
    expect(screen.getByText("No transactions have been recorded for this account.")).toBeInTheDocument();
  });
  it("renders server-provided transaction values", () => {
    render(<TransactionTable transactions={[{ type: "DEPOSIT", amount: "100.0000", balanceAfter: "100.0000", description: "Initial deposit" }]} />);
    expect(screen.getAllByText("100.0000 LKR")).toHaveLength(2);
    expect(screen.getByText("Initial deposit")).toBeInTheDocument();
  });
});
