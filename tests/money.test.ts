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

  it.each(["1", "0.1", "001.20", " 9007199254740993.01 "])("accepts positive core decimal input %s", (value) => {
    expect(validateAmount(value)).toBeUndefined();
  });

  it.each(["", "000.00", "0.001", "1.230", "0.0001", "-1.10", "1e3", ".50", "1,000"])("rejects invalid core decimal input %s", (value) => {
    expect(validateAmount(value)).toBeTruthy();
  });

  it("identifies excessive fractional precision", () => {
    expect(validateAmount("1.234")).toMatch(/two decimal places/i);
  });
});
