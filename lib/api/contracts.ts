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
export type AccountTransactionType = "DEPOSIT" | "WITHDRAWAL" | "TRANSFER_IN" | "TRANSFER_OUT";
export type AccountTransaction = {
  transactionId: string;
  accountId: string;
  type: AccountTransactionType;
  amount: string;
  balanceAfter: string;
  description: string | null;
  createdAt: string;
};

export type Branch = {
  branchId: number;
  branchName: string;
  address?: string;
  contactNumber?: string | null;
  [key: string]: unknown;
};
export type CustomerGender = "MALE" | "FEMALE" | "OTHER";
export type CustomerStatus = "ACTIVE" | "INACTIVE" | "PENDING" | "RESIGNED";
export type Customer = {
  customerId: string;
  firstName: string;
  lastName: string;
  gender?: CustomerGender;
  email?: string;
  phone?: string;
  address?: string;
  dateOfBirth?: string;
  status?: CustomerStatus;
  createdAt?: string;
  updatedAt?: string;
  username?: string;
  userId?: string;
};
export type CustomerRecordRequest = {
  userId: string;
  firstName: string;
  lastName: string;
  gender: CustomerGender;
  email: string;
  phone: string;
  address: string;
  dateOfBirth: string;
  status: CustomerStatus;
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

export type KycDocumentType = "DOC_FRONT" | "DOC_BACK" | "SELFIE" | "ADDRESS_PROOF";
export type KycStatus = "PENDING" | "AUTO_REVIEW" | "UNDER_REVIEW" | "NEEDS_MORE_INFO" | "APPROVED" | "REJECTED" | "SUPERSEDED";

export type KycUploadResponse = { id: string };
export type KycDocument = { blob: Blob; contentDisposition: string | null };
export type KycSubmitRequest = {
  docFrontId: string;
  docBackId: string;
  selfieId: string;
  addressId: string;
  consent: boolean;
};
export type KycSubmitResponse = { caseId: string; status: KycStatus };
export type KycCase = KycSubmitResponse & {
  docFrontId: string;
  docBackId: string;
  selfieId: string;
  addressId: string;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
  reviewerId: string | null;
  decidedAt: string | null;
  reviewerNotes: string | null;
};
export type KycCheck = { type: string; score: number | null; passed: boolean | null };
export type KycAdminCheck = KycCheck & {
  id: string;
  caseId: string;
  detailsJson: string | null;
  createdAt: string;
};
export type KycReviewQuery = { status?: KycStatus; page?: number; size?: number };
export type KycReviewPage = { page: number; size: number; total: number | string; content: KycCase[] };
export type KycDecisionRequest = {
  decision: Extract<KycStatus, "APPROVED" | "REJECTED" | "NEEDS_MORE_INFO">;
  reason?: string | null;
};
