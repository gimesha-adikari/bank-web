"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { accountsApi } from "@/lib/api/accounts";
import { transactionsApi } from "@/lib/api/transactions";
import { ApiError } from "@/lib/api/errors";
import { validateAmount } from "@/lib/finance/money";
import {
  beginSubmit,
  canSubmit,
  completeSuccess,
  confirmedFailure,
  operationPayloadChanged,
  startLogicalOperation,
  uncertainFailure,
  type IdempotencyState
} from "@/lib/finance/idempotency";
import type { Account, FinancialReceipt, Transaction } from "@/lib/api/contracts";

type Kind = "deposit" | "withdraw" | "transfer";
const EMPTY_OPERATION: IdempotencyState = { key: null, payloadFingerprint: null, status: "idle" };

export function FinancialForm({ kind }: { kind: Kind }) {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [operation, setOperation] = useState<IdempotencyState>(EMPTY_OPERATION);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<FinancialReceipt | null>(null);
  const [recentHistory, setRecentHistory] = useState<Transaction[]>([]);
  const [refreshedBalances, setRefreshedBalances] = useState<Account[]>([]);

  useEffect(() => {
    if (!token) return;
    void accountsApi.mine(token)
      .then((items) => { setAccounts(items); if (!accountId && items[0]) setAccountId(items[0].accountId); })
      .catch((failure) => setError(failure instanceof ApiError ? failure : new ApiError({ kind: "network", message: "Accounts could not be loaded." })));
  }, [accountId, token]);

  const payload = kind === "transfer" ? { sourceAccountId: accountId, destinationAccountId, amount } : { accountId, amount };

  async function refreshAuthoritative(): Promise<void> {
    if (!token || !accountId) return;
    setRefreshWarning(null);
    try {
      const [source, history] = await Promise.all([accountsApi.byId(token, accountId), accountsApi.history(token, accountId)]);
      setAccounts((current) => current.map((account) => account.accountId === source.accountId ? source : account));
      setRefreshedBalances([source]);
      setRecentHistory(history as Transaction[]);
      if (kind === "transfer" && destinationAccountId) {
        try {
          const destination = await accountsApi.byId(token, destinationAccountId);
          setRefreshedBalances((current) => [...current.filter((account) => account.accountId !== destination.accountId), destination]);
        } catch {
          // A valid destination may belong to another customer and therefore be unreadable by this caller.
        }
      }
    } catch {
      setRefreshWarning("The transaction succeeded. Latest account/history data could not be refreshed; reload the account view before relying on displayed balances.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setRefreshWarning(null);
    setReceipt(null);
    const amountError = validateAmount(amount);
    if (amountError) { setError(new ApiError({ kind: "backend", status: 422, message: amountError })); return; }
    if (!accountId || (kind === "transfer" && !destinationAccountId.trim())) {
      setError(new ApiError({ kind: "backend", status: 422, message: "Enter the required account identifier(s)." }));
      return;
    }

    let current = operation;
    if (!current.key || operationPayloadChanged(current, payload)) current = startLogicalOperation(payload);
    if (!canSubmit(current)) return;
    current = beginSubmit(current);
    setOperation(current);
    setPending(true);

    try {
      const key = current.key;
      if (!key || !token) throw new ApiError({ kind: "backend", status: 401, message: "Sign in again to submit this transaction." });
      const result = kind === "deposit"
        ? await transactionsApi.deposit(token, { accountId, amount }, key)
        : kind === "withdraw"
          ? await transactionsApi.withdraw(token, { accountId, amount }, key)
          : await transactionsApi.transfer(token, { sourceAccountId: accountId, destinationAccountId: destinationAccountId.trim(), amount }, key);
      setOperation(completeSuccess(current));
      setReceipt(result);
      await refreshAuthoritative();
    } catch (failure) {
      const normalized = failure instanceof ApiError ? failure : new ApiError({ kind: "network", message: "The transaction outcome is unknown. You may retry the same operation when ready.", retryableTransport: true });
      setError(normalized);
      setOperation(normalized.retryableTransport ? uncertainFailure(current) : confirmedFailure(current));
    } finally {
      setPending(false);
    }
  }

  function startAnotherOperation(): void {
    setOperation(EMPTY_OPERATION);
    setAmount("");
    setDestinationAccountId("");
    setError(null);
    setRefreshWarning(null);
    setReceipt(null);
    setRecentHistory([]);
    setRefreshedBalances([]);
  }

  const title = kind === "deposit" ? "Deposit funds" : kind === "withdraw" ? "Withdraw funds" : "Transfer funds";
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.7fr)]">
    <form className="card grid gap-5" onSubmit={(event) => void submit(event)} data-testid={`${kind}-form`}>
      <div><h2 className="text-2xl font-black">{title}</h2><p className="mt-2 muted">The server validates and commits the financial operation. This screen never updates balances optimistically.</p></div>
      <div className="field"><label htmlFor={`${kind}-account`}>{kind === "transfer" ? "Source account" : "Account"}</label><select id={`${kind}-account`} value={accountId} onChange={(event) => setAccountId(event.target.value)} required><option value="">Choose an account</option>{accounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.accountNumber} · {account.accountType} · {account.balance} LKR</option>)}</select></div>
      {kind === "transfer" && <div className="field"><label htmlFor="transfer-destination">Destination account ID</label><input id="transfer-destination" value={destinationAccountId} onChange={(event) => setDestinationAccountId(event.target.value)} autoComplete="off" required/><small>Enter the destination account UUID provided by the recipient. BankingSystem checks that the destination is valid.</small></div>}
      <div className="field"><label htmlFor={`${kind}-amount`}>Amount (decimal text)</label><input id={`${kind}-amount`} inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="50.00" required/><small>Enter the exact decimal amount accepted by BankingSystem. No client-side rounding is performed.</small></div>
      {error && <div className="error-box" role="alert">{error.message}{error.code && <span className="ml-2 text-xs">({error.code})</span>}{error.fieldErrors && <ul className="mt-2 list-disc pl-5">{Object.entries(error.fieldErrors).map(([field, message]) => <li key={field}>{field}: {message}</li>)}</ul>}{error.retryableTransport && <p className="mt-2 font-bold">The outcome may be uncertain. Retry this same form without changing its values to reuse the same key.</p>}</div>}
      {refreshWarning && <div className="error-box" role="alert">{refreshWarning}</div>}
      <button className="button" type="submit" disabled={pending || operation.status === "succeeded"}>{pending ? "Submitting securely…" : operation.status === "succeeded" ? "Completed" : "Submit transaction"}</button>
      {operation.status === "succeeded" && <button className="button secondary" type="button" onClick={startAnotherOperation}>Start another transaction</button>}
      {operation.key && <p className="text-xs muted" data-testid="idempotency-state">Operation status: {operation.status}. A new key is created only for a new logical operation.</p>}
    </form>
    <aside className="card"><h2 className="text-lg font-black">After submission</h2><ul className="mt-3 grid gap-3 text-sm muted"><li>• The same idempotency key is retained for an uncertain retry.</li><li>• Duplicate clicks while pending are ignored.</li><li>• Confirmed success triggers authoritative account and history refreshes.</li></ul>
      {receipt && <div className="success-box mt-5" role="status" data-testid="transaction-receipt"><strong>Transaction accepted.</strong><p className="mt-1">Reference: {receipt.journalReference ?? receipt.journalEntryId ?? "available in history"}</p></div>}
      {!!refreshedBalances.length && <div className="mt-5 grid gap-2" aria-label="Refreshed server balances">{refreshedBalances.map((account) => <p className="text-sm" key={account.accountId}><span className="font-bold">{account.accountNumber}:</span> {account.balance} LKR</p>)}</div>}
      {!!recentHistory.length && <div className="mt-5"><h3 className="font-bold">Latest server history</h3><ul className="mt-2 grid gap-2 text-sm">{recentHistory.slice(0, 5).map((item, index) => <li key={item.transactionId ?? item.journalEntryId ?? `${item.type}-${index}`}>{item.type} · {item.amount} LKR · {item.createdAt ?? item.timestamp ?? ""}</li>)}</ul></div>}
    </aside>
  </div>;
}
