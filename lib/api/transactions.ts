import { apiGet, apiJson } from "./http";
import type { ApiError } from "./errors";
import type { DepositRequest, FinancialReceipt, ReversalRequest, ReversalResponse, Transaction, TransferRequest, WithdrawalRequest } from "./contracts";

export const transactionsApi = {
  history: (accountId: string) => apiGet<Transaction[]>(`/api/v1/accounts/${encodeURIComponent(accountId)}/transactions`),
  deposit: (body: DepositRequest, idempotencyKey: string) => apiJson<FinancialReceipt>("/api/v1/transactions/deposit", "POST", body, { headers: { "Idempotency-Key": idempotencyKey } }),
  withdraw: (body: WithdrawalRequest, idempotencyKey: string) => apiJson<FinancialReceipt>("/api/v1/transactions/withdraw", "POST", body, { headers: { "Idempotency-Key": idempotencyKey } }),
  transfer: (body: TransferRequest, idempotencyKey: string) => apiJson<FinancialReceipt>("/api/v1/transactions/transfer", "POST", body, { headers: { "Idempotency-Key": idempotencyKey } }),
  reverse: (journalEntryId: string, body: ReversalRequest) => apiJson<ReversalResponse>(`/api/v1/transactions/${encodeURIComponent(journalEntryId)}/reversal`, "POST", body)
};

export function isUncertainTransactionOutcome(error: ApiError): boolean {
  if (error.authExpired || error.status === 401 || error.status === 403) return false;
  return error.retryableTransport
    || (error.status === 502 && error.code === "BANKING_UPSTREAM_UNAVAILABLE")
    || (error.status === 504 && error.code === "BANKING_UPSTREAM_TIMEOUT")
    || (error.status === 409 && error.code === "ERR_IDEMPOTENCY_IN_PROGRESS")
    || (error.status >= 500 && !error.code);
}
