import { accountsApi } from "./accounts";
import type { Account, AccountRequest, Branch, Customer } from "./contracts";

export const staffApi = {
  branches: (): Promise<Branch[]> => accountsApi.branches(),
  customers: (): Promise<Customer[]> => accountsApi.customers(),
  openAccount: (userId: string, body: AccountRequest): Promise<Account> => accountsApi.createStaffAccount(userId, body)
};
