import { apiGet, apiJson } from "./http";
import type { DepositRequest, FinancialReceipt, ReversalRequest, ReversalResponse, Transaction, TransferRequest, WithdrawalRequest } from "./contracts";

export const transactionsApi = {
  history: (accountId: string) => apiGet<Transaction[]>(`/api/v1/accounts/${encodeURIComponent(accountId)}/transactions`),
  deposit: (body: DepositRequest, idempotencyKey: string) => apiJson<FinancialReceipt>("/api/v1/transactions/deposit", "POST", body, { headers: { "Idempotency-Key": idempotencyKey } }),
  withdraw: (body: WithdrawalRequest, idempotencyKey: string) => apiJson<FinancialReceipt>("/api/v1/transactions/withdraw", "POST", body, { headers: { "Idempotency-Key": idempotencyKey } }),
  transfer: (body: TransferRequest, idempotencyKey: string) => apiJson<FinancialReceipt>("/api/v1/transactions/transfer", "POST", body, { headers: { "Idempotency-Key": idempotencyKey } }),
  reverse: (journalEntryId: string, body: ReversalRequest) => apiJson<ReversalResponse>(`/api/v1/transactions/${encodeURIComponent(journalEntryId)}/reversal`, "POST", body)
};
