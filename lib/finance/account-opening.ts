import { isDecimalString, validateAmount } from "./money";
import { ApiError } from "@/lib/api/errors";

export const accountOpeningTerms = {
  SAVINGS: { label: "Savings", minimum: "1000" },
  CHECKING: { label: "Checking", minimum: "0" },
  FIXED_DEPOSIT: { label: "Fixed deposit", minimum: "5000" }
} as const;

export type OpeningAccountType = keyof typeof accountOpeningTerms;
export const openingAccountTypes = Object.keys(accountOpeningTerms) as OpeningAccountType[];

export function validateOpeningDeposit(value: string, type: OpeningAccountType): string | undefined {
  const amount = value.trim();
  if (!amount) return "Enter an opening deposit.";
  if (!isDecimalString(amount)) return "Enter a non-negative decimal amount without a currency symbol.";
  // A zero checking deposit does not pass through MonetaryAmount in bank-core.
  if (!/^0+(?:\.0+)?$/.test(amount)) {
    const amountError = validateAmount(amount);
    if (amountError) return amountError;
  }
  const { minimum } = accountOpeningTerms[type];
  // The backend minimums are whole LKR amounts, so only the whole part is needed here.
  if (BigInt(amount.split(".")[0]) < BigInt(minimum)) return `The minimum opening deposit is ${minimum}.00 LKR.`;
}

export function isUncertainStaffAccountOpening(error: unknown): error is ApiError {
  if (!(error instanceof ApiError) || error.authExpired || error.status === 401 || error.status === 403) return false;
  if (error.kind === "network" || error.kind === "timeout" || error.retryableTransport) return true;
  if (error.status === 502 && error.code === "BANKING_UPSTREAM_UNAVAILABLE") return true;
  if (error.status === 504 && error.code === "BANKING_UPSTREAM_TIMEOUT") return true;
  return error.status >= 500 && !error.code;
}
