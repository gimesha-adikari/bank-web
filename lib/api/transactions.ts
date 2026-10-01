import { apiGet, apiJson } from "./http";
import type { DepositRequest, FinancialReceipt, ReversalRequest, ReversalResponse, Transaction, TransferRequest, WithdrawalRequest } from "./contracts";

export const transactionsApi = {
  history: (token: string, accountId: string) => apiGet<Transaction[]>(`/api/v1/accounts/${encodeURIComponent(accountId)}/transactions`, token),
  deposit: (token: string, body: DepositRequest, idempotencyKey: string) => apiJson<FinancialReceipt>("/api/v1/transactions/deposit", "POST", body, { token, allowGetRefresh: false, headers: { "Idempotency-Key": idempotencyKey } }),
  withdraw: (token: string, body: WithdrawalRequest, idempotencyKey: string) => apiJson<FinancialReceipt>("/api/v1/transactions/withdraw", "POST", body, { token, allowGetRefresh: false, headers: { "Idempotency-Key": idempotencyKey } }),
  transfer: (token: string, body: TransferRequest, idempotencyKey: string) => apiJson<FinancialReceipt>("/api/v1/transactions/transfer", "POST", body, { token, allowGetRefresh: false, headers: { "Idempotency-Key": idempotencyKey } }),
  reverse: (token: string, journalEntryId: string, body: ReversalRequest) => apiJson<ReversalResponse>(`/api/v1/transactions/${encodeURIComponent(journalEntryId)}/reversal`, "POST", body, { token, allowGetRefresh: false })
};
