import { apiDeleteNoContent, apiGet, apiJson } from "./http";
import type { Account, AccountRequest, AccountTransaction, Branch, Customer } from "./contracts";

export const accountsApi = {
  mine: () => apiGet<Account[]>("/api/v1/accounts/my"),
  listStaffAccounts: () => apiGet<Account[]>("/api/v1/accounts"),
  byId: (accountId: string) => apiGet<Account>(`/api/v1/accounts/${encodeURIComponent(accountId)}`),
  history: (accountId: string) => apiGet<AccountTransaction[]>(`/api/v1/accounts/${encodeURIComponent(accountId)}/transactions`),
  branches: () => apiGet<Branch[]>("/api/v1/branches?page=1&limit=100"),
  update: (accountId: string, body: AccountRequest) => apiJson<Account>(`/api/v1/accounts/${encodeURIComponent(accountId)}`, "PUT", body),
  close: (accountId: string) => apiDeleteNoContent(`/api/v1/accounts/${encodeURIComponent(accountId)}`),
  createCustomerAccount: (body: AccountRequest, idempotencyKey: string) => apiJson<Account>("/api/v1/accounts", "POST", body, {
    headers: { "Idempotency-Key": idempotencyKey }
  }),
  createStaffAccount: (userId: string, body: AccountRequest) => apiJson<Account>(`/api/v1/accounts/${encodeURIComponent(userId)}`, "POST", body),
  customers: () => apiGet<Customer[]>("/api/v1/customers")
};
