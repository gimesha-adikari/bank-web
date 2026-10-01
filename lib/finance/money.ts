export type DecimalString = string & { readonly __decimalString: unique symbol };

const DECIMAL_TEXT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL_TEXT.test(value.trim());
}

export function validateAmount(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Amount is required.";
  if (!isDecimalString(trimmed)) return "Enter a positive decimal amount without a currency symbol.";
  if (/^0(?:\.0+)?$/.test(trimmed)) return "Amount must be greater than zero.";
  return undefined;
}

export function asDecimalString(value: string): DecimalString {
  if (!isDecimalString(value)) throw new Error("Expected a decimal string");
  return value.trim() as DecimalString;
}

export function formatMoney(value: string | undefined, currency = "LKR"): string {
  if (!value) return `— ${currency}`;
  return `${value} ${currency}`;
}
