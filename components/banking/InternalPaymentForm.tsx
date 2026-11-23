"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { accountsApi } from "@/lib/api/accounts";
import type { Account, AccountTransaction, TransferReceipt, TransferRequest } from "@/lib/api/contracts";
import { ApiError } from "@/lib/api/errors";
import { isUncertainTransactionOutcome, transactionsApi } from "@/lib/api/transactions";
import { newIdempotencyKey } from "@/lib/finance/idempotency";
import { formatMoney, isDecimalString, validateAmount } from "@/lib/finance/money";
import { TransactionTable } from "./TransactionTable";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Payment = { key: string; payload: Readonly<TransferRequest> };
type PaymentState =
  | { kind: "draft"; error?: string }
  | { kind: "review"; payload: Readonly<TransferRequest> }
  | { kind: "uncertain"; payment: Payment; message: string }
  | { kind: "conflict"; payment: Payment }
  | { kind: "confirmed"; receipt: TransferReceipt };

function decimalValue(value: string): string {
  const [whole, cents = ""] = value.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${cents.replace(/0+$/, "")}`;
}

function verifyReceipt(receipt: TransferReceipt, payload: Readonly<TransferRequest>): TransferReceipt {
  if (receipt?.operationType !== "TRANSFER" || receipt.currency !== "LKR"
    || typeof receipt.sourceAccountId !== "string" || receipt.sourceAccountId.toLowerCase() !== payload.sourceAccountId.toLowerCase()
    || typeof receipt.destinationAccountId !== "string" || receipt.destinationAccountId.toLowerCase() !== payload.destinationAccountId.toLowerCase()
    || typeof receipt.journalEntryId !== "string" || !UUID.test(receipt.journalEntryId)
    || typeof receipt.journalReference !== "string" || !receipt.journalReference.trim()
    || typeof receipt.amount !== "string" || !isDecimalString(receipt.amount)
    || decimalValue(receipt.amount) !== decimalValue(payload.amount)
    || typeof receipt.sourceResultingBalance !== "string" || !isDecimalString(receipt.sourceResultingBalance)
    || typeof receipt.postedAt !== "string" || !receipt.postedAt.trim() || typeof receipt.replayed !== "boolean") {
    throw new ApiError({ kind: "parse", message: "Bank-core did not return a receipt matching this payment." });
  }
  return receipt;
}

function rejectionMessage(error: ApiError): string {
  if (error.status === 401) return "Your session has expired. Sign in again before making a payment.";
  if (error.code === "CSRF_VALIDATION_FAILED") return "Your request could not be verified. Review the payment again before submitting.";
  if (error.status === 403) return "Your current role is not authorized to make payments.";
  switch (error.code) {
    case "ERR_INSUFFICIENT_FUNDS": return "Your source account has insufficient funds for this payment.";
    case "ERR_ACCOUNT_ACCESS_DENIED":
    case "ERR_NOT_FOUND": return "Bank-core could not authorize the source account or find the destination. Check the selected account and destination UUID.";
    case "ERR_ACCOUNT_NOT_ACTIVE":
    case "ERR_LEDGER_ACCOUNT_NOT_ACTIVE": return "An account is inactive or ineligible for this payment. Check the source and choose an eligible destination.";
    case "ERR_UNSUPPORTED_CURRENCY":
    case "ERR_CURRENCY_MISMATCH": return "Both accounts must support internal payments in LKR.";
    case "ERR_SELF_TRANSFER": return "Choose a destination different from your source account.";
    default: return error.message;
  }
}

export function InternalPaymentForm() {
  const { status, role } = useAuth();
  const canPay = status === "authenticated" && role === "CUSTOMER";
  const [accounts, setAccounts] = useState<Account[]>();
  const [accountError, setAccountError] = useState<string>();
  const [loadVersion, setLoadVersion] = useState(0);
  const [sourceId, setSourceId] = useState("");
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<PaymentState>({ kind: "draft" });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [refreshedAccount, setRefreshedAccount] = useState<Account>();
  const [history, setHistory] = useState<AccountTransaction[]>();
  const [refreshWarning, setRefreshWarning] = useState(false);

  const eligible = accounts?.filter((account) => account.accountStatus === "ACTIVE" && UUID.test(account.accountId));
  const source = eligible?.find((account) => account.accountId === sourceId);

  useEffect(() => {
    if (!canPay) return;
    let active = true;
    void accountsApi.mine().then((records) => {
      if (!active) return;
      setAccounts(records);
      setSourceId((selected) => selected || records.find((item) => item.accountStatus === "ACTIVE" && UUID.test(item.accountId))?.accountId || "");
    }).catch(() => {
      if (active) setAccountError("Your accounts could not be loaded.");
    });
    return () => { active = false; };
  }, [canPay, loadVersion]);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPay || state.kind !== "draft" || inFlight.current) return;
    const destinationId = destination.trim();
    const error = !source ? "Choose an active source account."
      : !UUID.test(destinationId) ? "Enter the destination account UUID."
      : destinationId.toLowerCase() === source.accountId.toLowerCase() ? "Choose a destination different from your source account."
      : validateAmount(amount);
    if (error || !source) {
      setState({ kind: "draft", error });
      return;
    }
    setState({ kind: "review", payload: { sourceAccountId: source.accountId, destinationAccountId: destinationId, amount: amount.trim() } });
  }

  async function run(action: () => Promise<void>) {
    if (!canPay || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function refreshAccount(accountId: string) {
    const [balanceResult, historyResult] = await Promise.allSettled([accountsApi.byId(accountId), accountsApi.history(accountId)]);
    const account = balanceResult.status === "fulfilled" && balanceResult.value?.accountId === accountId ? balanceResult.value : undefined;
    const items = historyResult.status === "fulfilled" && Array.isArray(historyResult.value)
      && historyResult.value.every((item) => item?.accountId === accountId) ? historyResult.value : undefined;
    setRefreshedAccount(account);
    setHistory(items);
    setRefreshWarning(!account || !items);
    if (account) setAccounts((current) => current?.map((item) => item.accountId === accountId ? account : item));
  }

  async function confirmReceipt(receipt: TransferReceipt, payment: Payment) {
    setState({ kind: "confirmed", receipt });
    await refreshAccount(payment.payload.sourceAccountId);
  }

  async function checkReceipt(payment: Payment) {
    setState({ kind: "uncertain", payment, message: "The payment outcome is uncertain. Checking for a committed receipt…" });
    let receipt: TransferReceipt;
    try {
      receipt = verifyReceipt(await transactionsApi.transferReceipt(payment.key), payment.payload);
    } catch (failure) {
      const missing = failure instanceof ApiError && failure.status === 404 && failure.code === "ERR_NOT_FOUND";
      setState({
        kind: "uncertain", payment,
        message: missing
          ? "No committed receipt was visible when checked. The original request may still complete."
          : "The receipt lookup could not be verified. Check again or review your account history before making another payment."
      });
      return;
    }
    await confirmReceipt(receipt, payment);
  }

  async function send(payment: Payment, recovering: boolean) {
    let receipt: TransferReceipt;
    try {
      receipt = verifyReceipt(await transactionsApi.transfer(payment.payload, payment.key), payment.payload);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409 && failure.code !== "ERR_IDEMPOTENCY_IN_PROGRESS") {
        setState({ kind: "conflict", payment });
      } else if (recovering || !(failure instanceof ApiError) || failure.kind === "parse"
        || failure.status === 408 || failure.status >= 500 || isUncertainTransactionOutcome(failure)) {
        await checkReceipt(payment);
      } else {
        setState({ kind: "draft", error: rejectionMessage(failure) });
      }
      return;
    }
    await confirmReceipt(receipt, payment);
  }

  function startAnotherPayment() {
    if (inFlight.current || state.kind !== "confirmed") return;
    setDestination("");
    setAmount("");
    setRefreshedAccount(undefined);
    setHistory(undefined);
    setRefreshWarning(false);
    setState({ kind: "draft" });
  }

  const reviewed = state.kind === "review" ? state.payload
    : state.kind === "uncertain" || state.kind === "conflict" ? state.payment.payload : undefined;
  const historySource = state.kind === "confirmed" ? state.receipt.sourceAccountId : reviewed?.sourceAccountId;

  return <div className="grid gap-5">
    {state.kind === "draft" && <form className="card grid max-w-2xl gap-5" onSubmit={review} noValidate>
      <h2 className="text-xl font-bold">Payment details</h2>
      {!accounts && !accountError && <p role="status" className="muted">Loading your accounts…</p>}
      {accountError && <div className="error-box grid gap-3" role="alert"><p>{accountError}</p>
        <button className="button secondary w-fit" type="button" onClick={() => { setAccountError(undefined); setLoadVersion((v) => v + 1); }}>Reload accounts</button>
      </div>}
      {accounts && !eligible?.length && <p className="muted">You need an active account to make an internal payment.</p>}
      <div className="field">
        <label htmlFor="pay-source">Source account</label>
        <select id="pay-source" value={source?.accountId ?? ""} onChange={(event) => setSourceId(event.target.value)} disabled={!eligible?.length || busy}>
          <option value="">Choose an account</option>
          {eligible?.map((item) => <option key={item.accountId} value={item.accountId}>
            {item.accountNumber} · {item.accountType} · {formatMoney(item.balance)}
          </option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="pay-destination">Destination account UUID</label>
        <input id="pay-destination" aria-describedby="pay-destination-help" value={destination} onChange={(event) => setDestination(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy} />
        <small id="pay-destination-help">Ask the recipient for the account UUID. They can find it in their account history.</small>
      </div>
      <div className="field">
        <label htmlFor="pay-amount">Amount (LKR)</label>
        <input id="pay-amount" aria-describedby="pay-amount-help" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" autoComplete="off" placeholder="0.00" disabled={busy} />
        <small id="pay-amount-help">Enter a positive amount with up to two decimal places.</small>
      </div>
      {state.error && <p className="error-box" role="alert">{state.error}</p>}
      <button className="button w-fit" type="submit" disabled={!canPay || !eligible?.length || busy}>Review payment</button>
    </form>}

    {reviewed && <section className="card grid max-w-2xl gap-4" aria-labelledby="payment-review">
      <h2 className="text-xl font-bold" id="payment-review">{state.kind === "review" ? "Review payment" : "Original payment details"}</h2>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="text-sm muted">Source account</dt><dd className="break-all">{source?.accountNumber ?? reviewed.sourceAccountId}{source && <> · {source.accountType}</>}</dd></div>
        <div><dt className="text-sm muted">Payment amount</dt><dd className="font-bold">{formatMoney(reviewed.amount)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm muted">Destination account UUID</dt><dd className="break-all font-mono text-sm">{reviewed.destinationAccountId}</dd></div>
      </dl>
      {state.kind === "review" && <>
        <p>Confirm that the destination UUID and amount are correct.</p>
        <div className="flex flex-wrap gap-3">
          <button className="button" type="button" disabled={busy || !canPay} onClick={() => void run(() => send({ key: newIdempotencyKey(), payload: state.payload }, false))}>
            {busy ? "Submitting payment…" : "Confirm payment"}
          </button>
          <button className="button secondary" type="button" disabled={busy} onClick={() => setState({ kind: "draft" })}>Edit payment</button>
        </div>
      </>}
      {state.kind === "uncertain" && <>
        <div className="error-box grid gap-2" role="alert"><p>{state.message}</p><p>Check the receipt first. Retrying sends the same payment details with the original key.</p></div>
        <div className="flex flex-wrap gap-3">
          <button className="button" type="button" disabled={busy || !canPay} onClick={() => void run(() => checkReceipt(state.payment))}>Check receipt</button>
          <button className="button secondary" type="button" disabled={busy || !canPay} onClick={() => void run(() => send(state.payment, true))}>Retry same payment</button>
        </div>
      </>}
      {state.kind === "conflict" && <p className="error-box" role="alert">Bank-core reported a conflict with the original payment key. Check account history or contact support before making another payment.</p>}
      {(state.kind === "uncertain" || state.kind === "conflict") && <p className="text-sm muted">This page keeps recovery details in memory. Reloading or leaving the page clears them.</p>}
    </section>}

    {state.kind === "confirmed" && <>
      <section className="card grid max-w-2xl gap-4" aria-labelledby="payment-receipt">
        <h2 className="text-xl font-bold" id="payment-receipt">Payment receipt</h2>
        <p className="success-box" role="status">Payment confirmed by bank-core.</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-sm muted">Payment reference</dt><dd className="break-all font-bold">{state.receipt.journalReference}</dd></div>
          <div><dt className="text-sm muted">Amount</dt><dd>{formatMoney(state.receipt.amount, state.receipt.currency)}</dd></div>
          <div><dt className="text-sm muted">Payer balance after payment</dt><dd>{formatMoney(state.receipt.sourceResultingBalance, state.receipt.currency)}</dd></div>
          <div><dt className="text-sm muted">Posted at</dt><dd>{state.receipt.postedAt}</dd></div>
          <div className="sm:col-span-2"><dt className="text-sm muted">Journal UUID</dt><dd className="break-all font-mono text-sm">{state.receipt.journalEntryId}</dd></div>
        </dl>
        <button className="button w-fit" type="button" disabled={busy} onClick={startAnotherPayment}>Start a new payment</button>
      </section>
      {busy && <p role="status" className="muted">Refreshing your account data…</p>}
      {refreshWarning && <div className="error-box grid gap-3" role="alert"><p>The payment is confirmed. Some account data could not be refreshed.</p>
        <button className="button secondary w-fit" type="button" disabled={busy} onClick={() => void run(() => refreshAccount(state.receipt.sourceAccountId))}>Refresh account data</button>
      </div>}
      {refreshedAccount && <p className="card">Current payer balance · <strong>{formatMoney(refreshedAccount.balance)}</strong></p>}
      {history && <section className="grid gap-3" aria-label="Latest source account history">
        <h2 className="text-lg font-bold">Latest source account history</h2>
        <TransactionTable transactions={history.slice(0, 5)} />
      </section>}
    </>}
    {historySource && state.kind !== "review" && <Link className="button ghost w-fit" href={`/customer/accounts/${encodeURIComponent(historySource)}/transactions`}>View full account history</Link>}
  </div>;
}
