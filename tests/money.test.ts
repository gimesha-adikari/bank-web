import { describe, expect, it } from "vitest";
import { formatMoney, isDecimalString, validateAmount } from "@/lib/finance/money";

describe("decimal money input", () => {
  it("accepts decimal strings and rejects unsafe forms", () => {
    expect(isDecimalString("100.00")).toBe(true);
    expect(isDecimalString("1e3")).toBe(false);
    expect(isDecimalString(" 100.00 ")).toBe(true);
    expect(validateAmount("0.00")).toBeTruthy();
    expect(validateAmount("12.50")).toBeUndefined();
  });
  it("formats without changing the server value", () => expect(formatMoney("100.0000", "LKR")).toBe("100.0000 LKR"));
});
