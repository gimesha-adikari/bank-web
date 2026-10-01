import { apiGet, apiJson } from "./http";
import type { Account, AccountRequest, Branch, Customer } from "./contracts";

export const accountsApi = {
  mine: (token: string) => apiGet<Account[]>("/api/v1/accounts/my", token),
  byId: (token: string, accountId: string) => apiGet<Account>(`/api/v1/accounts/${encodeURIComponent(accountId)}`, token),
  history: (token: string, accountId: string) => apiGet<unknown[]>(`/api/v1/accounts/${encodeURIComponent(accountId)}/transactions`, token),
  branches: (token: string) => apiGet<Branch[]>("/api/v1/branches?page=1&limit=100", token),
  createCustomerAccount: (token: string, body: AccountRequest) => apiJson<Account>("/api/v1/accounts", "POST", body, { token, allowGetRefresh: false }),
  createStaffAccount: (token: string, userId: string, body: AccountRequest) => apiJson<Account>(`/api/v1/accounts/${encodeURIComponent(userId)}`, "POST", body, { token, allowGetRefresh: false }),
  customers: (token: string) => apiGet<Customer[]>("/api/v1/customers", token)
};
