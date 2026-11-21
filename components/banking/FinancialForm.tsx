"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { accountsApi } from "@/lib/api/accounts";
import { isUncertainTransactionOutcome, transactionsApi } from "@/lib/api/transactions";
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
import type { Account, DepositRequest, FinancialReceipt, Transaction, TransferRequest } from "@/lib/api/contracts";

type Kind = "deposit" | "withdraw" | "transfer";
type FinancialPayload = DepositRequest | TransferRequest;

export function FinancialForm({ kind }: { kind: Kind }) {
  const { status } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [operation, setOperation] = useState<IdempotencyState<FinancialPayload> | null>(null);
  const submissionInFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<FinancialReceipt | null>(null);
  const [recentHistory, setRecentHistory] = useState<Transaction[]>([]);
  const [refreshedBalances, setRefreshedBalances] = useState<Account[]>([]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void accountsApi.mine()
      .then((items) => { setAccounts(items); setAccountId((selected) => selected || items[0]?.accountId || ""); })
      .catch((failure) => setError(failure instanceof ApiError ? failure : new ApiError({ kind: "network", message: "Accounts could not be loaded." })));
  }, [status]);

  const uncertain = operation?.status === "uncertain";
  const succeeded = operation?.status === "succeeded";
  const fieldsLocked = pending || uncertain || succeeded;

  async function refreshAuthoritative(payload: FinancialPayload): Promise<void> {
    const sourceId = "sourceAccountId" in payload ? payload.sourceAccountId : payload.accountId;
    const [source, history] = await Promise.allSettled([accountsApi.byId(sourceId), transactionsApi.history(sourceId)]);
    if (source.status === "fulfilled") {
      setAccounts((current) => current.map((account) => account.accountId === sourceId ? source.value : account));
      setRefreshedBalances([source.value]);
    }
    if (history.status === "fulfilled") setRecentHistory(history.value);
    if (source.status === "rejected" || history.status === "rejected") {
      setRefreshWarning("The transaction succeeded. Some account data could not be refreshed. Reload the account view for the latest balance and history.");
    }
    if ("destinationAccountId" in payload) {
      try {
        const destination = await accountsApi.byId(payload.destinationAccountId);
        setRefreshedBalances((current) => [...current.filter((account) => account.accountId !== destination.accountId), destination]);
      } catch {
        // Bank-core may accept a transfer to a destination the sender cannot read.
      }
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submissionInFlight.current || (operation && !canSubmit(operation))) return;
    setError(null);
    setRefreshWarning(null);
    if (status !== "authenticated") {
      setError(new ApiError({ kind: "backend", status: 401, message: "Sign in again to submit this transaction." }));
      return;
    }
    const draft: FinancialPayload = kind === "transfer"
      ? { sourceAccountId: accountId, destinationAccountId: destinationAccountId.trim(), amount: amount.trim() }
      : { accountId, amount: amount.trim() };
    const payload = uncertain ? operation.payload : draft;
    const amountError = validateAmount(payload.amount);
    if (amountError) { setError(new ApiError({ kind: "backend", status: 422, message: amountError })); return; }
    const hasAccounts = "sourceAccountId" in payload ? payload.sourceAccountId && payload.destinationAccountId : payload.accountId;
    if (!hasAccounts) {
      setError(new ApiError({ kind: "backend", status: 422, message: "Enter the required account identifier(s)." }));
      return;
    }

    const current = beginSubmit(operation && !operationPayloadChanged(operation, payload) ? operation : startLogicalOperation(payload));
    submissionInFlight.current = true;
    setOperation(current);
    setPending(true);

    try {
      const { key, payload: submitted } = current;
      const result = "sourceAccountId" in submitted
        ? await transactionsApi.transfer(submitted, key)
        : kind === "deposit"
          ? await transactionsApi.deposit(submitted, key)
          : await transactionsApi.withdraw(submitted, key);
      setOperation(completeSuccess(current));
      setReceipt(result);
      await refreshAuthoritative(submitted);
    } catch (failure) {
      const normalized = failure instanceof ApiError ? failure : new ApiError({ kind: "network", message: "The transaction outcome is unknown. You may retry the same operation when ready.", retryableTransport: true });
      setError(normalized);
      setOperation(uncertain || isUncertainTransactionOutcome(normalized) ? uncertainFailure(current) : confirmedFailure(current));
    } finally {
      submissionInFlight.current = false;
      setPending(false);
    }
  }

  function startAnotherOperation(): void {
    if (submissionInFlight.current) return;
    setOperation(null);
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
      <div className="field"><label htmlFor={`${kind}-account`}>{kind === "transfer" ? "Source account" : "Account"}</label><select id={`${kind}-account`} value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={fieldsLocked} required><option value="">Choose an account</option>{accounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.accountNumber} · {account.accountType} · {account.balance} LKR</option>)}</select></div>
      {kind === "transfer" && <div className="field"><label htmlFor="transfer-destination">Destination account ID</label><input id="transfer-destination" value={destinationAccountId} onChange={(event) => setDestinationAccountId(event.target.value)} autoComplete="off" disabled={fieldsLocked} required/><small>Enter the destination account UUID provided by the recipient. BankingSystem checks that the destination is valid.</small></div>}
      <div className="field"><label htmlFor={`${kind}-amount`}>Amount (decimal text)</label><input id={`${kind}-amount`} inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="50.00" disabled={fieldsLocked} required/><small>Enter a positive amount with up to two decimal places.</small></div>
      {(error || uncertain) && <div className="error-box" role="alert">
        {error && !isUncertainTransactionOutcome(error) && <>{error.message}{error.code && <span className="ml-2 text-xs">({error.code})</span>}{error.fieldErrors && <ul className="mt-2 list-disc pl-5">{Object.entries(error.fieldErrors).map(([field, message]) => <li key={field}>{field}: {message}</li>)}</ul>}</>}
        {uncertain && <p className="mt-2 font-bold">This transaction may already have succeeded. Retry the same transaction to reuse its original details and key. Check account history before starting a different transaction.</p>}
      </div>}
      {refreshWarning && <div className="error-box" role="alert">{refreshWarning}</div>}
      <button className="button" type="submit" disabled={pending || succeeded}>{succeeded ? "Completed" : pending ? "Submitting securely…" : uncertain ? "Retry same transaction" : "Submit transaction"}</button>
      {(succeeded || uncertain) && <button className="button secondary" type="button" disabled={pending} onClick={startAnotherOperation}>{uncertain ? "Start a different transaction" : "Start another transaction"}</button>}
      {operation && <p className="text-xs muted" data-testid="idempotency-state">Operation status: {operation.status}. A new key is created only for a new logical operation.</p>}
    </form>
    <aside className="card"><h2 className="text-lg font-black">After submission</h2><ul className="mt-3 grid gap-3 text-sm muted"><li>• The same idempotency key is retained for an uncertain retry.</li><li>• Duplicate clicks while pending are ignored.</li><li>• Confirmed success triggers authoritative account and history refreshes.</li></ul>
      {receipt && <div className="success-box mt-5" role="status" data-testid="transaction-receipt"><strong>Transaction accepted.</strong><p className="mt-1">Reference: {receipt.journalReference ?? receipt.journalEntryId ?? "available in history"}</p></div>}
      {!!refreshedBalances.length && <div className="mt-5 grid gap-2" aria-label="Refreshed server balances">{refreshedBalances.map((account) => <p className="text-sm" key={account.accountId}><span className="font-bold">{account.accountNumber}:</span> {account.balance} LKR</p>)}</div>}
      {!!recentHistory.length && <div className="mt-5"><h3 className="font-bold">Latest server history</h3><ul className="mt-2 grid gap-2 text-sm">{recentHistory.slice(0, 5).map((item, index) => <li key={item.transactionId ?? item.journalEntryId ?? `${item.type}-${index}`}>{item.type} · {item.amount} LKR · {item.createdAt ?? item.timestamp ?? ""}</li>)}</ul></div>}
    </aside>
  </div>;
}
