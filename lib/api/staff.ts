import { accountsApi } from "./accounts";
import type { Account, AccountRequest, Branch, Customer } from "./contracts";

export const staffApi = {
  branches: (token: string): Promise<Branch[]> => accountsApi.branches(token),
  customers: (token: string): Promise<Customer[]> => accountsApi.customers(token),
  openAccount: (token: string, userId: string, body: AccountRequest): Promise<Account> => accountsApi.createStaffAccount(token, userId, body)
};
