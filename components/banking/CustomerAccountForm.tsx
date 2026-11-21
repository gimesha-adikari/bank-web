"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { accountsApi } from "@/lib/api/accounts";
import type { Account, Branch } from "@/lib/api/contracts";
import { ApiError } from "@/lib/api/errors";
import { CUSTOMER_ONBOARDING } from "@/lib/auth/navigation";
import { accountOpeningTerms, openingAccountTypes, type OpeningAccountType, validateOpeningDeposit } from "@/lib/finance/account-opening";
import { formatMoney } from "@/lib/finance/money";
import { AccountSummary } from "./AccountSummary";
import { useAccountOpeningEligibility } from "./useAccountOpeningEligibility";

type Outcome = { kind: "opened"; account: Account } | { kind: "uncertain" };
type Feedback = { message: string; field?: "branchId" | "initialDeposit" | "accountType" };

function openingRejection(error: ApiError): Feedback {
  if (error.status === 401) return { message: "Sign in again to open an account." };
  if (error.code === "CSRF_VALIDATION_FAILED") return { message: "The request could not be verified. Reload this page and try again." };
  if (error.status === 403) return { message: "You are not allowed to open this account." };
  if (error.code === "ERR_NOT_FOUND" && error.message === "Branch not found") {
    return { field: "branchId", message: "The selected branch is no longer available. Choose another branch or reload the list." };
  }
  if (error.code === "ERR_MIN_DEPOSIT" || error.code === "ERR_DEPOSIT_INVALID") {
    return { field: "initialDeposit", message: error.message };
  }
  if (error.code === "ERR_VAULT_ACCOUNT_NOT_FOUND" || error.code === "ERR_VAULT_ACCOUNT_INVALID") {
    return { message: "Bank-core cannot process funded account openings right now. Try again later or contact the bank." };
  }
  if (error.fieldErrors?.accountType) return { field: "accountType", message: "Choose an account type that bank-core accepts." };
  if (error.fieldErrors?.branchId) return { field: "branchId", message: "Choose an available branch." };
  if (error.fieldErrors?.initialDeposit) return { field: "initialDeposit", message: error.fieldErrors.initialDeposit };
  return { message: error.message };
}

function isUncertain(error: ApiError): boolean {
  if (error.status === 401 || error.status === 403 || error.authExpired) return false;
  return error.retryableTransport || error.status === 408
    || (error.status >= 500 && error.code !== "BANKING_PROXY_MISCONFIGURED");
}

export function CustomerAccountForm() {
  const { eligibility, recheckEligibility } = useAccountOpeningEligibility();
  const eligible = eligibility.state === "eligible";
  const [recordMissing, setRecordMissing] = useState(false);
  const [branches, setBranches] = useState<Branch[]>();
  const [branchError, setBranchError] = useState<string>();
  const [branchLookup, setBranchLookup] = useState(0);
  const [branchId, setBranchId] = useState("");
  const [accountType, setAccountType] = useState<OpeningAccountType>("SAVINGS");
  const [amount, setAmount] = useState("");
  const [feedback, setFeedback] = useState<Feedback>();
  const [opening, setOpening] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();
  const [accounts, setAccounts] = useState<Account[]>();
  const [latest, setLatest] = useState<Account>();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const posting = useRef(false);

  useEffect(() => {
    if (!eligible) return;
    let active = true;
    void accountsApi.branches().then((result) => {
      if (active) setBranches(result.filter(({ branchId }) => Number.isInteger(branchId)
        && branchId >= -2147483648 && branchId <= 2147483647));
    }).catch((failure: unknown) => {
      if (!active) return;
      const denied = failure instanceof ApiError && failure.status === 403;
      setBranchError(denied ? "You are not allowed to view branches." : "We could not load the branches. Reload the list to try again.");
    });
    return () => { active = false; };
  }, [eligible, branchLookup]);

  function reloadBranches() {
    setBranchId("");
    setBranches(undefined);
    setBranchError(undefined);
    if (feedback?.field === "branchId") setFeedback(undefined);
    setBranchLookup((previous) => previous + 1);
  }

  async function refresh(result: Outcome) {
    setRefreshing(true);
    setRefreshError(false);
    try {
      if (result.kind === "opened") {
        const fresh = await accountsApi.byId(result.account.accountId);
        if (fresh?.accountId !== result.account.accountId) throw new Error("Unexpected account response");
        setLatest(fresh);
      } else {
        const fresh = await accountsApi.mine();
        if (!Array.isArray(fresh)) throw new Error("Unexpected account list");
        setAccounts(fresh);
      }
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  }

  const selectedBranch = branches?.find((branch) => String(branch.branchId) === branchId);
  const needsOnboarding = recordMissing || eligibility.state === "missing-record" || eligibility.state === "verification-needed";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (posting.current || needsOnboarding || !eligible || outcome) return;
    setFeedback(undefined);
    const deposit = amount.trim();
    const error = validateOpeningDeposit(deposit, accountType);
    if (error) {
      setFeedback({ field: "initialDeposit", message: error });
      return;
    }
    if (!selectedBranch) {
      setFeedback({ field: "branchId", message: "Choose an available branch." });
      return;
    }
    posting.current = true;
    setOpening(true);
    try {
      const account = await accountsApi.createCustomerAccount({ accountType, initialDeposit: deposit, branchId: selectedBranch.branchId });
      if (!account?.accountId || !account.accountNumber || !account.accountType || !account.accountStatus || typeof account.balance !== "string") {
        throw new Error("Missing account confirmation");
      }
      const result = { kind: "opened", account } as const;
      setOutcome(result);
      await refresh(result);
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "ERR_NOT_FOUND" && failure.message === "Customer not found") {
        setRecordMissing(true);
      } else if (failure instanceof ApiError && !isUncertain(failure)) {
        setFeedback(openingRejection(failure));
      } else {
        const result = { kind: "uncertain" } as const;
        setOutcome(result);
        await refresh(result);
      }
    } finally {
      posting.current = false;
      setOpening(false);
    }
  }

  function fieldFeedback(field: Feedback["field"]) {
    return feedback?.field === field && feedback?.message
      ? <p id={`opening-${field}-error`} className="text-sm text-red-800" role="alert">{feedback.message}</p>
      : null;
  }

  return (
    <>
      <SectionHeading eyebrow="Customer banking" title="Open an account">
        <Link href="/customer" className="button ghost">Customer dashboard</Link>
      </SectionHeading>
      <div className="grid max-w-4xl gap-4">
        {eligibility.state === "loading" && <p className="card" role="status">Checking account-opening eligibility…</p>}
        {eligibility.state === "error" && <div className="card grid gap-3">
          <p role="alert">{eligibility.message}</p>
          <button type="button" className="button secondary w-fit" onClick={recheckEligibility}>Check eligibility again</button>
        </div>}
        {needsOnboarding && <div className="card grid gap-3">
          <h2 className="text-xl font-black">Finish customer onboarding</h2>
          <p>{recordMissing || eligibility.state === "missing-record"
            ? "A customer record is required before you can open an account."
            : "Complete identity verification before opening an account."}</p>
          <Link href={CUSTOMER_ONBOARDING} className="button w-fit">Continue onboarding</Link>
        </div>}
        {eligible && !needsOnboarding && !outcome && <>
          {!branches && !branchError && <p className="card" role="status">Loading branches…</p>}
          {(branchError || branches?.length === 0) && <div className="card grid gap-3">
            <p role={branchError ? "alert" : "status"}>{branchError ?? "There are no branches available right now."}</p>
            <button type="button" className="button secondary w-fit" onClick={reloadBranches}>Reload branches</button>
          </div>}
          {branches && branches.length > 0 && <form className="card grid max-w-xl gap-4" method="post" onSubmit={(event) => void submit(event)}>
            <fieldset disabled={opening} className="grid gap-4">
              <div className="field">
                <label htmlFor="opening-type">Account type</label>
                <select id="opening-type" value={accountType} onChange={(event) => {
                  const type = openingAccountTypes.find((candidate) => candidate === event.target.value);
                  if (type) setAccountType(type);
                  setFeedback(undefined);
                }} aria-invalid={feedback?.field === "accountType"} aria-describedby={feedback?.field === "accountType" ? "opening-accountType-error" : undefined}>
                  {openingAccountTypes.map((type) => <option key={type} value={type}>{accountOpeningTerms[type].label}</option>)}
                </select>
                {fieldFeedback("accountType")}
              </div>
              <div className="field">
                <label htmlFor="opening-branch">Branch</label>
                <select id="opening-branch" required value={branchId} aria-invalid={feedback?.field === "branchId"}
                  aria-describedby={feedback?.field === "branchId" ? "opening-branchId-error" : undefined} onChange={(event) => {
                    setBranchId(event.target.value);
                    if (feedback?.field === "branchId") setFeedback(undefined);
                  }}>
                  <option value="">Choose a branch</option>
                  {branches.map((branch) => <option key={branch.branchId} value={branch.branchId}>
                    {[branch.branchName, branch.address].filter(Boolean).join(" — ")}
                  </option>)}
                </select>
                {selectedBranch?.contactNumber && <small>Branch phone {selectedBranch.contactNumber}</small>}
                {fieldFeedback("branchId")}
                {feedback?.field === "branchId" && <button type="button" onClick={reloadBranches} className="button secondary w-fit">Reload branches</button>}
              </div>
              <div className="field">
                <label htmlFor="opening-amount">Opening deposit (LKR)</label>
                <input id="opening-amount" value={amount} inputMode="decimal" autoComplete="off" required
                  aria-invalid={feedback?.field === "initialDeposit"} aria-describedby={feedback?.field === "initialDeposit" ? "opening-minimum opening-initialDeposit-error" : "opening-minimum"}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    if (feedback?.field === "initialDeposit") setFeedback(undefined);
                  }} />
                <small id="opening-minimum">Minimum {accountOpeningTerms[accountType].minimum}.00 LKR. Use up to two decimal places for a funded opening.</small>
                {fieldFeedback("initialDeposit")}
              </div>
            </fieldset>
            {feedback && !feedback.field && <p className="error-box" role="alert">{feedback.message}</p>}
            <button type="submit" className="button w-fit" disabled={opening}>{opening ? "Opening account…" : "Open account"}</button>
          </form>}
        </>}
        {outcome?.kind === "opened" && <section className="card grid gap-4">
          <h2 className="success-box font-black" role="status">Account opened</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt className="muted">Account number</dt><dd className="font-bold">{outcome.account.accountNumber}</dd></div>
            <div><dt className="muted">Account type</dt><dd className="font-bold">{accountOpeningTerms[outcome.account.accountType as OpeningAccountType]?.label ?? outcome.account.accountType}</dd></div>
            <div><dt className="muted">Opening status</dt><dd className="font-bold">{outcome.account.accountStatus}</dd></div>
            <div><dt className="muted">Opening balance</dt><dd className="font-bold">{formatMoney(outcome.account.balance)}</dd></div>
            {latest && <>
              <div><dt className="muted">Current status</dt><dd className="font-bold">{latest.accountStatus}</dd></div>
              <div><dt className="muted">Current balance</dt><dd className="font-bold">{formatMoney(latest.balance)}</dd></div>
            </>}
          </dl>
          {refreshing && <p className="muted" role="status">Refreshing account details…</p>}
          {refreshError && <div className="grid gap-3">
            <p className="error-box" role="alert">Bank-core confirmed the opening. The latest account details could not be loaded.</p>
            <button type="button" className="button secondary w-fit" onClick={() => void refresh(outcome)}>Refresh account details</button>
          </div>}
          <Link className="button w-fit" href={`/customer/accounts/${encodeURIComponent(outcome.account.accountId)}/transactions`}>View transaction history</Link>
        </section>}
        {outcome?.kind === "uncertain" && <section className="card grid gap-4">
          <h2 className="text-xl font-black">Account opening could not be confirmed</h2>
          <p className="error-box" role="alert">Bank-core may already have opened your account. Check the account list below before sending another opening request.</p>
          {refreshing && <p className="muted" role="status">Checking your accounts with bank-core…</p>}
          {refreshError && <p className="error-box" role="alert">We could not refresh your accounts. Try checking again before opening another account.</p>}
          {!refreshError && accounts?.length === 0 && <p className="muted">No accounts are currently listed. Your request may still be processing.</p>}
          {!refreshError && accounts && accounts.length > 0 && <div className="grid gap-4 sm:grid-cols-2">
            {accounts.map((account) => <AccountSummary key={account.accountId} account={account} />)}
          </div>}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="button secondary" disabled={refreshing} onClick={() => void refresh(outcome)}>Refresh my accounts</button>
            <Link href="/customer/accounts" className="button ghost">View my accounts</Link>
          </div>
        </section>}
      </div>
    </>
  );
}
