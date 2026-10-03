export type Role = "ADMIN" | "EMPLOYEE" | "CUSTOMER" | "TELLER" | "MANAGER" | "BANNED";

export type LoginRequest = { username: string; password: string };
export type LoginResponse = { username: string; role: Role };
export type TokenIdentity = { username: string; role: Role };
export type RegisterRequest = {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
};
export type ForgotPasswordRequest = { email: string };
export type ChangePasswordRequest = { currentPassword: string; newPassword: string; confirmNewPassword: string };
export type EmailChangeRequest = { newEmail: string };

export type UserProfile = {
  userId: string;
  username: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  homeNumber?: string;
  workNumber?: string;
  officeNumber?: string;
  mobileNumber?: string;
  email?: string;
  roleName: Role;
};

export type AccountType = "SAVINGS" | "CHECKING" | "FIXED_DEPOSIT" | string;
export type AccountStatus = "ACTIVE" | "FROZEN" | "CLOSED" | string;
export type Account = {
  accountId: string;
  accountNumber: string;
  accountType: AccountType;
  accountStatus: AccountStatus;
  balance: string;
  createdAt?: string;
  updatedAt?: string;
};
export type AccountRequest = { accountType: AccountType; initialDeposit: string; branchId: number };

export type Branch = { branchId: number; branchName: string; [key: string]: unknown };
export type Customer = {
  customerId: string;
  firstName: string;
  lastName: string;
  gender?: string;
  email?: string;
  phone?: string;
  address?: string;
  dateOfBirth?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  username?: string;
  userId?: string;
};

export type TransactionType = "DEPOSIT" | "WITHDRAWAL" | "TRANSFER_IN" | "TRANSFER_OUT" | string;
export type Transaction = {
  transactionId?: string;
  journalEntryId?: string;
  accountId?: string;
  type: TransactionType;
  amount: string;
  balanceAfter?: string;
  description?: string;
  counterpartyAccountId?: string;
  createdAt?: string;
  timestamp?: string;
  [key: string]: unknown;
};
export type DepositRequest = { accountId: string; amount: string };
export type WithdrawalRequest = { accountId: string; amount: string };
export type TransferRequest = { sourceAccountId: string; destinationAccountId: string; amount: string };
export type ReversalRequest = { reason: string };
export type AffectedBalance = { accountId: string; balance: string };
export type ReversalResponse = {
  operation?: string;
  reversalJournalEntryId: string;
  journalReference?: string;
  reversalOfEntryId: string;
  amount: string;
  currency: string;
  affectedAccountBalances?: AffectedBalance[];
  postedAt?: string;
  replayed?: boolean;
};
export type FinancialReceipt = {
  operation?: string;
  journalEntryId?: string;
  journalReference?: string;
  amount?: string;
  currency?: string;
  replayed?: boolean;
  [key: string]: unknown;
};
