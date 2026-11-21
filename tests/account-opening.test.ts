import { describe, expect, it } from "vitest";
import { openingAccountTypes, type OpeningAccountType, validateOpeningDeposit } from "@/lib/finance/account-opening";
import { loginDestination } from "@/lib/auth/navigation";

describe("customer account opening", () => {
  it("offers the three account types supported by bank-core", () => {
    expect(openingAccountTypes).toEqual(["SAVINGS", "CHECKING", "FIXED_DEPOSIT"]);
  });

  it.each<[OpeningAccountType, string]>([
    ["CHECKING", "0.00"], ["CHECKING", "000.000"], ["CHECKING", "0.01"],
    ["SAVINGS", "1000"], ["SAVINGS", " 001000.01 "], ["FIXED_DEPOSIT", "5000.00"],
    ["FIXED_DEPOSIT", "90071992547409930000000000.01"]
  ])("accepts %s with %s", (type, value) => {
    expect(validateOpeningDeposit(value, type)).toBeUndefined();
  });

  it.each<[OpeningAccountType, string, string]>([
    ["SAVINGS", "999.99", "The minimum opening deposit is 1000.00 LKR."],
    ["FIXED_DEPOSIT", "4999.99", "The minimum opening deposit is 5000.00 LKR."],
    ["FIXED_DEPOSIT", "0.00", "The minimum opening deposit is 5000.00 LKR."],
    ["CHECKING", "0.001", "Use at most two decimal places."],
    ["SAVINGS", "1000.000", "Use at most two decimal places."],
    ["CHECKING", "", "Enter an opening deposit."],
    ["CHECKING", "-1.00", "Enter a non-negative decimal amount without a currency symbol."],
    ["SAVINGS", "1e3", "Enter a non-negative decimal amount without a currency symbol."],
    ["SAVINGS", "1,000.00", "Enter a non-negative decimal amount without a currency symbol."]
  ])("rejects %s with %s", (type, value, message) => {
    expect(validateOpeningDeposit(value, type)).toBe(message);
  });

  it("resumes the customer route only for a customer and preserves the Teller route", () => {
    expect(loginDestination("CUSTOMER", "/customer/accounts/new")).toBe("/customer/accounts/new");
    expect(loginDestination("TELLER", "/customer/accounts/new")).toBe("/staff");
    expect(loginDestination("TELLER", "/staff/accounts/new")).toBe("/staff/accounts/new");
    expect(loginDestination("CUSTOMER", "/staff/accounts/new")).toBe("/customer");
  });
});
