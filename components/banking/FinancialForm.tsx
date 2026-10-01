"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { accountsApi } from "@/lib/api/accounts";
import { transactionsApi } from "@/lib/api/transactions";
import { ApiError } from "@/lib/api/errors";
import { validateAmount } from "@/lib/finance/money";
import { beginSubmit, canSubmit, completeSuccess, confirmedFailure, newIdempotencyKey, operationPayloadChanged, startLogicalOperation, uncertainFailure, type IdempotencyState } from "@/lib/finance/idempotency";
import type { Account, FinancialReceipt } from "@/lib/api/contracts";

type Kind = "deposit" | "withdraw" | "transfer";

export function FinancialForm({ kind }: { kind: Kind }) {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [operation, setOperation] = useState<IdempotencyState>(() => ({ key: null, payloadFingerprint: null, status: "idle" }));
  const [pending, setPending] = useState(false); const [error, setError] = useState<ApiError | null>(null); const [receipt, setReceipt] = useState<FinancialReceipt | null>(null); const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  useEffect(() => { if (!token) return; void accountsApi.mine(token).then((items) => { setAccounts(items); if (!accountId && items[0]) setAccountId(items[0].accountId); }).catch((failure) => setError(failure instanceof ApiError ? failure : new ApiError({ kind: "network", message: "Accounts could not be loaded." }))); }, [accountId, token]);
  const payload = kind === "transfer" ? { sourceAccountId: accountId, destinationAccountId, amount } : { accountId, amount };
  async function refreshAuthoritative() { if (!token || !accountId) return; await accountsApi.byId(token, accountId); await accountsApi.history(token, accountId); if (kind === "transfer" && destinationAccountId) { await accountsApi.byId(token, destinationAccountId); await accountsApi.history(token, destinationAccountId); } setRefreshedAt(new Date().toISOString()); }
  async function submit(event: FormEvent) { event.preventDefault(); if (pending) return; setError(null); setReceipt(null); const amountError = validateAmount(amount); if (amountError) { setError(new ApiError({ kind: "backend", status: 422, message: amountError })); return; } if (!accountId || (kind === "transfer" && !destinationAccountId)) { setError(new ApiError({ kind: "backend", status: 422, message: "Choose the required account(s)." })); return; }
    let current = operation;
    if (!current.key || operationPayloadChanged(current, payload)) current = startLogicalOperation(payload);
    if (!canSubmit(current)) return;
    current = beginSubmit(current); setOperation(current); setPending(true);
    try {
      const key = current.key ?? newIdempotencyKey();
      const result = kind === "deposit"
        ? await transactionsApi.deposit(token ?? "", { accountId, amount }, key)
        : kind === "withdraw"
          ? await transactionsApi.withdraw(token ?? "", { accountId, amount }, key)
          : await transactionsApi.transfer(token ?? "", { sourceAccountId: accountId, destinationAccountId, amount }, key);
      setOperation(completeSuccess(current)); setReceipt(result); await refreshAuthoritative();
    }
    catch (failure) { const normalized = failure instanceof ApiError ? failure : new ApiError({ kind: "network", message: "The transaction outcome is unknown. You may retry the same operation when ready.", retryableTransport: true }); setError(normalized); setOperation(normalized.retryableTransport ? uncertainFailure(current) : confirmedFailure(current)); }
    finally { setPending(false); }
  }
  const title = kind === "deposit" ? "Deposit funds" : kind === "withdraw" ? "Withdraw funds" : "Transfer funds";
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.7fr)]"><form className="card grid gap-5" onSubmit={submit} data-testid={`${kind}-form`}><div><h2 className="text-2xl font-black">{title}</h2><p className="mt-2 muted">The server validates and commits the financial operation. This screen never updates balances optimistically.</p></div><div className="field"><label htmlFor={`${kind}-account`}>{kind === "transfer" ? "Source account" : "Account"}</label><select id={`${kind}-account`} value={accountId} onChange={(e) => setAccountId(e.target.value)} required><option value="">Choose an account</option>{accounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.accountNumber} · {account.accountType} · {account.balance} LKR</option>)}</select></div>{kind === "transfer" && <div className="field"><label htmlFor="transfer-destination">Destination account</label><select id="transfer-destination" value={destinationAccountId} onChange={(e) => setDestinationAccountId(e.target.value)} required><option value="">Choose a destination</option>{accounts.filter((account) => account.accountId !== accountId).map((account) => <option key={account.accountId} value={account.accountId}>{account.accountNumber} · {account.accountType}</option>)}</select></div>}<div className="field"><label htmlFor={`${kind}-amount`}>Amount (decimal text)</label><input id={`${kind}-amount`} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" required/><small>Enter the exact decimal amount accepted by BankingSystem. No client-side rounding is performed.</small></div>{error && <div className="error-box" role="alert">{error.message}{error.code && <span className="ml-2 text-xs">({error.code})</span>}{error.fieldErrors && <ul className="mt-2 list-disc pl-5">{Object.entries(error.fieldErrors).map(([field, text]) => <li key={field}>{field}: {text}</li>)}</ul>}{error.retryableTransport && <p className="mt-2 font-bold">The outcome may be uncertain. Retry this same form without changing its values to reuse the same key.</p>}</div>}<button className="button" type="submit" disabled={pending || operation.status === "succeeded"}>{pending ? "Submitting securely…" : operation.status === "succeeded" ? "Completed" : "Submit transaction"}</button>{operation.key && <p className="text-xs muted" data-testid="idempotency-state">Operation status: {operation.status}. A new key is created only for a new logical operation.</p>}</form><aside className="card"><h2 className="text-lg font-black">After submission</h2><ul className="mt-3 grid gap-3 text-sm muted"><li>• The same idempotency key is retained for an uncertain retry.</li><li>• Duplicate clicks while pending are ignored.</li><li>• Confirmed success triggers authoritative account and history refreshes.</li></ul>{receipt && <div className="success-box mt-5" role="status" data-testid="transaction-receipt"><strong>Transaction accepted.</strong><p className="mt-1">Reference: {receipt.journalReference ?? receipt.journalEntryId ?? "available in history"}</p></div>}{refreshedAt && <p className="mt-4 text-xs muted">Authoritative data refreshed after {refreshedAt}</p>}</aside></div>;
}
