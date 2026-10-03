import { apiGet, apiJson } from "./http";
import type { Account, AccountRequest, Branch, Customer } from "./contracts";

export const accountsApi = {
  mine: () => apiGet<Account[]>("/api/v1/accounts/my"),
  byId: (accountId: string) => apiGet<Account>(`/api/v1/accounts/${encodeURIComponent(accountId)}`),
  history: (accountId: string) => apiGet<unknown[]>(`/api/v1/accounts/${encodeURIComponent(accountId)}/transactions`),
  branches: () => apiGet<Branch[]>("/api/v1/branches?page=1&limit=100"),
  createCustomerAccount: (body: AccountRequest) => apiJson<Account>("/api/v1/accounts", "POST", body),
  createStaffAccount: (userId: string, body: AccountRequest) => apiJson<Account>(`/api/v1/accounts/${encodeURIComponent(userId)}`, "POST", body),
  customers: () => apiGet<Customer[]>("/api/v1/customers")
};
