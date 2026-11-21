"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { staffApi } from "@/lib/api/staff";
import { accountsApi } from "@/lib/api/accounts";
import { ApiError } from "@/lib/api/errors";
import type { Account, Branch, Customer } from "@/lib/api/contracts";
import { formatMoney } from "@/lib/finance/money";
import { accountOpeningTerms, isUncertainStaffAccountOpening, openingAccountTypes, validateOpeningDeposit, type OpeningAccountType } from "@/lib/finance/account-opening";

type LinkedCustomer = Customer & { userId: string };
type OpenedAccount = { receipt: Account; customer: LinkedCustomer; branch: Branch };

function nameOf(customer: Customer): string {
  return `${customer.firstName} ${customer.lastName}`.trim() || customer.username || "Unnamed customer";
}

function loadErrorMessage(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 401) return "Your staff session has expired. Sign in again to continue.";
  if (failure instanceof ApiError && failure.status === 403) return "Your staff role is not permitted to load customer or branch details for account opening.";
  return "Customer and branch details could not be loaded. Retry before opening an account.";
}

function openingFailureMessage(failure: ApiError): string {
  if (failure.status === 401 || failure.authExpired) return "Your Teller session has expired. Sign in again to continue.";
  if (failure.status === 403) return "Your Teller role is not permitted to open this account. Bank-core authorization remains authoritative.";
  if (failure.status === 404) {
    if (/branch/i.test(failure.message)) return "The selected branch could not be found. Reload the branch list and choose an available branch.";
    return "Bank-core could not find a customer record for this linked user. Reload the customer list and confirm the customer record still exists.";
  }
  if (failure.status === 400 || failure.status === 422) {
    const fields = failure.fieldErrors ? ` ${Object.entries(failure.fieldErrors).map(([field, message]) => `${field}: ${message}`).join(" ")}` : "";
    return `Bank-core rejected the account-opening details. ${failure.message}${fields}`;
  }
  return failure.message || "Bank-core rejected the account-opening request.";
}

function isUncertainFailure(failure: unknown): boolean {
  return !(failure instanceof ApiError) || isUncertainStaffAccountOpening(failure);
}

function uncertainMessage(): string {
  return "The request result could not be confirmed. An account may already have been created by bank-core. The Teller API has no idempotent retry and exposes no customer-scoped account lookup to safely match an unknown result. Do not submit this opening again; ask an authorized operations user to reconcile it before initiating any new opening.";
}

export function StaffAccountForm() {
  const { status } = useAuth();
  const [customers, setCustomers] = useState<LinkedCustomer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customerUserId, setCustomerUserId] = useState("");
  const [accountType, setAccountType] = useState<OpeningAccountType>("SAVINGS");
  const [initialDeposit, setInitialDeposit] = useState("");
  const [branchId, setBranchId] = useState("");
  const [loadError, setLoadError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [invalidCustomerTarget, setInvalidCustomerTarget] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [opened, setOpened] = useState<OpenedAccount>();
  const [latestAccount, setLatestAccount] = useState<Account>();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [uncertain, setUncertain] = useState<LinkedCustomer>();
  const pendingRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    void Promise.all([staffApi.customers(), staffApi.branches()]).then(([loadedCustomers, loadedBranches]) => {
      if (!active) return;
      const linkedCustomers = loadedCustomers.filter((customer): customer is LinkedCustomer => typeof customer.userId === "string" && customer.userId.length > 0);
      setCustomers(linkedCustomers);
      setBranches(loadedBranches);
      const requestedUserId = new URLSearchParams(window.location.search).get("customerUserId");
      if (requestedUserId) {
        if (linkedCustomers.some((customer) => customer.userId === requestedUserId)) {
          setCustomerUserId(requestedUserId);
          setInvalidCustomerTarget(false);
        } else {
          setCustomerUserId("");
          setInvalidCustomerTarget(true);
        }
      } else {
        setInvalidCustomerTarget(false);
      }
      setLoadError(undefined);
    }).catch((failure: unknown) => {
      if (active) setLoadError(loadErrorMessage(failure));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadAttempt, status]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.userId === customerUserId),
    [customerUserId, customers]
  );
  const selectedBranch = useMemo(
    () => branches.find((branch) => String(branch.branchId) === branchId),
    [branchId, branches]
  );
  const customerDetailHref = selectedCustomer ? `/staff/customers/${encodeURIComponent(selectedCustomer.customerId)}` : "/staff/customers";

  function retryLoad() {
    setLoading(true);
    setLoadError(undefined);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function refreshAccount(accountId: string) {
    setRefreshing(true);
    setRefreshError(false);
    try {
      const refreshed = await accountsApi.byId(accountId);
      if (refreshed.accountId !== accountId) throw new Error("The account response did not match the requested account.");
      setLatestAccount(refreshed);
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current || status !== "authenticated" || opened || uncertain) return;
    if (!selectedCustomer) {
      setError("Choose an existing customer record with a linked user login.");
      return;
    }
    if (!selectedBranch) {
      setError("Choose a branch from the current bank-core branch list.");
      return;
    }
    const amountError = validateOpeningDeposit(initialDeposit, accountType);
    if (amountError) {
      setError(amountError);
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    try {
      const receipt = await staffApi.openAccount(selectedCustomer.userId, {
        accountType,
        initialDeposit,
        branchId: selectedBranch.branchId
      });
      setOpened({ receipt, customer: selectedCustomer, branch: selectedBranch });
      await refreshAccount(receipt.accountId);
    } catch (failure) {
      if (isUncertainFailure(failure)) {
        setUncertain(selectedCustomer);
      } else {
        setError(openingFailureMessage(failure as ApiError));
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <>
      {!opened && !uncertain && <div className="mb-4">
        <Link href={customerDetailHref} className="button ghost">{selectedCustomer ? "Back to customer details" : "Customer directory"}</Link>
      </div>}

      {loading && <p className="card" role="status">Loading customer records and branches…</p>}
      {!loading && loadError && <div className="error-box grid gap-3" role="alert">
        <p>{loadError}</p>
        <button type="button" className="button secondary w-fit" onClick={retryLoad}>Retry loading details</button>
      </div>}
      {!loading && !loadError && customers.length === 0 && <p className="card" role="status">No customer records with linked user logins are available. Create or update a customer record before opening an account.</p>}
      {!loading && !loadError && customers.length > 0 && branches.length === 0 && <p className="card" role="status">No branches are currently available for account opening.</p>}

      {!loading && !loadError && customers.length > 0 && branches.length > 0 && !opened && !uncertain && <form className="card grid gap-5" onSubmit={(event) => void submit(event)}>
        {invalidCustomerTarget && <p className="error-box" role="alert">The customer user ID in this link does not match an existing customer login. The customer record may be missing or the customer record UUID may have been used instead of the linked user UUID. Choose a customer from the current list.</p>}
        <fieldset disabled={pending} className="grid gap-5">
          <div className="field">
            <label htmlFor="staff-customer">Customer</label>
            <select id="staff-customer" value={customerUserId} onChange={(event) => {
              setCustomerUserId(event.target.value);
              setInvalidCustomerTarget(false);
              setError(undefined);
            }} required>
              <option value="">Choose a customer</option>
              {customers.map((customer) => <option key={customer.userId} value={customer.userId}>
                {nameOf(customer)} · {customer.username ?? customer.email ?? customer.userId}
              </option>)}
            </select>
            <small>Bank-core receives the linked user UUID. Customer record UUID and user UUID are different identifiers.</small>
          </div>
          {selectedCustomer && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="font-bold">Customer receiving the account</h2>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="muted">Customer</dt><dd>{nameOf(selectedCustomer)}</dd></div>
              <div><dt className="muted">Record status</dt><dd>{selectedCustomer.status ?? "Unknown"}</dd></div>
              <div><dt className="muted">Customer record ID</dt><dd className="break-all font-mono">{selectedCustomer.customerId}</dd></div>
              <div><dt className="muted">Linked user ID sent to bank-core</dt><dd className="break-all font-mono">{selectedCustomer.userId}</dd></div>
            </dl>
          </div>}
          <div className="field">
            <label htmlFor="staff-account-type">Account type</label>
            <select id="staff-account-type" value={accountType} onChange={(event) => {
              const selected = openingAccountTypes.find((type) => type === event.target.value);
              if (selected) setAccountType(selected);
              setError(undefined);
            }}>
              {openingAccountTypes.map((type) => <option key={type} value={type}>{accountOpeningTerms[type].label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="staff-branch">Branch</label>
            <select id="staff-branch" value={branchId} onChange={(event) => {
              setBranchId(event.target.value);
              setError(undefined);
            }} required>
              <option value="">Choose a branch</option>
              {branches.map((branch) => <option key={branch.branchId} value={branch.branchId}>
                {[branch.branchName, branch.address].filter(Boolean).join(" — ")}
              </option>)}
            </select>
            {selectedBranch?.contactNumber && <small>Branch phone {selectedBranch.contactNumber}</small>}
          </div>
          <div className="field">
            <label htmlFor="staff-opening-deposit">Initial deposit (LKR)</label>
            <input id="staff-opening-deposit" value={initialDeposit} onChange={(event) => {
              setInitialDeposit(event.target.value);
              setError(undefined);
            }} inputMode="decimal" autoComplete="off" required />
            <small>Minimum {accountOpeningTerms[accountType].minimum}.00 LKR. Use no more than two decimal places for funded deposits. The original decimal text is sent without rounding.</small>
          </div>
        </fieldset>
        {error && <p className="error-box" role="alert">{error}</p>}
        <button className="button w-fit" disabled={pending || !selectedCustomer || !selectedBranch}>
          {pending ? "Opening account…" : "Open account"}
        </button>
      </form>}

      {uncertain && <section className="card grid gap-4">
        <h2 className="text-xl font-black">Account opening result is uncertain</h2>
        <p className="error-box" role="alert">{uncertainMessage()}</p>
        <p>Customer selected for the request: {nameOf(uncertain)} · user ID {uncertain.userId}</p>
        <Link href={customerDetailHref} className="button ghost w-fit">Return to customer details</Link>
      </section>}

      {opened && <section className="card grid gap-4" aria-label="Account opening receipt">
        <h2 className="success-box font-black" role="status">Account opened</h2>
        <p className="muted">The account response does not include customer or branch identifiers. The customer and branch shown here are the recipients selected for this request.</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="muted">Account number</dt><dd className="font-bold">{opened.receipt.accountNumber}</dd></div>
          <div><dt className="muted">Account type</dt><dd className="font-bold">{opened.receipt.accountType}</dd></div>
          <div><dt className="muted">Opening status</dt><dd className="font-bold">{opened.receipt.accountStatus}</dd></div>
          <div><dt className="muted">Opening balance</dt><dd className="font-bold">{formatMoney(opened.receipt.balance)}</dd></div>
          <div><dt className="muted">Customer selected for opening</dt><dd>{nameOf(opened.customer)}</dd></div>
          <div><dt className="muted">Customer record ID</dt><dd className="break-all font-mono">{opened.customer.customerId}</dd></div>
          <div><dt className="muted">Linked user ID targeted by the request</dt><dd className="break-all font-mono">{opened.customer.userId}</dd></div>
          <div><dt className="muted">Branch selected</dt><dd>{opened.branch.branchName} · {opened.branch.branchId}</dd></div>
          {latestAccount && <>
            <div><dt className="muted">Current status</dt><dd className="font-bold">{latestAccount.accountStatus}</dd></div>
            <div><dt className="muted">Current balance</dt><dd className="font-bold">{formatMoney(latestAccount.balance)}</dd></div>
          </>}
        </dl>
        {refreshing && <p className="muted" role="status">Refreshing account details from bank-core…</p>}
        {refreshError && <div className="grid gap-3">
          <p className="error-box" role="alert">Bank-core confirmed account creation, but the latest account details could not be loaded.</p>
          <button type="button" className="button secondary w-fit" disabled={refreshing} onClick={() => void refreshAccount(opened.receipt.accountId)}>Refresh account details</button>
        </div>}
        <div className="flex flex-wrap gap-3">
          <Link href={`/staff/accounts/${encodeURIComponent(opened.receipt.accountId)}/transactions`} className="button">View transaction history</Link>
          <Link href={customerDetailHref} className="button ghost">Return to customer details</Link>
        </div>
      </section>}
    </>
  );
}
