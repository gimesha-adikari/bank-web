"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { accountsApi } from "@/lib/api/accounts";
import type { Account, AccountRequest, Branch } from "@/lib/api/contracts";
import { ApiError } from "@/lib/api/errors";
import { formatMoney } from "@/lib/finance/money";
import { accountOpeningTerms, openingAccountTypes, type OpeningAccountType } from "@/lib/finance/account-opening";

type UpdateReview = { accountType: OpeningAccountType; branch: Branch };
type PendingAction = "updating" | "closing" | undefined;

function readFailureMessage(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 401) return "Your staff session has expired. Sign in again to view this account.";
  if (failure instanceof ApiError && failure.status === 403) return "Your staff role is not permitted to view this account.";
  if (failure instanceof ApiError && failure.status === 404) return "This account was not found. It may have been removed.";
  return failure instanceof ApiError ? failure.message : "Account details could not be loaded.";
}

function actionFailureMessage(failure: unknown, action: "update" | "close"): string {
  if (!(failure instanceof ApiError)) return `The ${action} result could not be confirmed.`;
  if (failure.status === 401 || failure.authExpired) return "Your staff session has expired. Sign in again to continue.";
  if (failure.status === 403) return `Your staff role is not permitted to ${action} accounts. Bank-core authorization remains authoritative.`;
  if (failure.status === 404) return "Bank-core could not find this account. Reload the account directory before taking further action.";
  if (failure.status === 409) return "This account changed while you were working. Its current server state has been reloaded; review it before continuing.";
  if (failure.status === 400 || failure.status === 422) {
    const fields = failure.fieldErrors ? ` ${Object.entries(failure.fieldErrors).map(([field, message]) => `${field}: ${message}`).join(" ")}` : "";
    return `Bank-core rejected the ${action} request. ${failure.message}${fields}`;
  }
  return failure.message || `Bank-core rejected the ${action} request.`;
}

function hasUncertainOutcome(failure: unknown): boolean {
  if (!(failure instanceof ApiError)) return true;
  if (failure.authExpired || failure.status === 401 || failure.status === 403) return false;
  if (failure.kind === "network" || failure.kind === "timeout" || failure.retryableTransport) return true;
  if (failure.status === 502 && failure.code === "BANKING_UPSTREAM_UNAVAILABLE") return true;
  if (failure.status === 504 && failure.code === "BANKING_UPSTREAM_TIMEOUT") return true;
  return failure.status >= 500 && !failure.code;
}

function sameAccountSnapshot(first: Account, second: Account): boolean {
  if (first.accountId !== second.accountId || first.accountType !== second.accountType
    || first.accountStatus !== second.accountStatus || first.balance !== second.balance) return false;
  return !first.updatedAt || !second.updatedAt || first.updatedAt === second.updatedAt;
}

function isZeroBalance(value: string): boolean {
  return /^0+(?:\.0+)?$/.test(value);
}

function formatTimestamp(value: string | undefined): string {
  return value ?? "—";
}

export function StaffAccountDetail({ accountId }: Readonly<{ accountId: string }>) {
  const { status } = useAuth();
  const [account, setAccount] = useState<Account>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [reloadVersion, setReloadVersion] = useState(0);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchError, setBranchError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [draftType, setDraftType] = useState<OpeningAccountType>("SAVINGS");
  const [branchId, setBranchId] = useState("");
  const [updateReview, setUpdateReview] = useState<UpdateReview>();
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);
  const [acknowledgeBalance, setAcknowledgeBalance] = useState(false);
  const [pending, setPending] = useState<PendingAction>();
  const [actionError, setActionError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [refreshError, setRefreshError] = useState<string>();
  const mutationLock = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the requested account changes before its new authoritative read completes.
    setLoading(true);
    setLoadError(undefined);
    void accountsApi.byId(accountId).then((result) => {
      if (!active) return;
      if (result.accountId !== accountId) throw new Error("The account response did not match the requested identifier.");
      setAccount(result);
    }).catch((failure: unknown) => {
      if (active) setLoadError(readFailureMessage(failure));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [accountId, reloadVersion, status]);

  async function refreshAccount(): Promise<Account | undefined> {
    setRefreshError(undefined);
    try {
      const refreshed = await accountsApi.byId(accountId);
      if (refreshed.accountId !== accountId) throw new Error("The account response did not match the requested identifier.");
      setAccount(refreshed);
      setLoadError(undefined);
      return refreshed;
    } catch (failure) {
      setRefreshError(readFailureMessage(failure));
      return undefined;
    }
  }

  async function loadBranches() {
    setBranchesLoading(true);
    setBranchError(undefined);
    try {
      const result = await accountsApi.branches();
      setBranches(result);
      if (result.length === 0) setBranchError("No branches were returned by bank-core. Account details cannot be updated until a branch is available.");
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 403) setBranchError("Your staff role is not permitted to load the branch list.");
      else setBranchError(failure instanceof ApiError ? failure.message : "Branches could not be loaded.");
    } finally {
      setBranchesLoading(false);
    }
  }

  function beginEdit() {
    if (!account) return;
    const currentType = openingAccountTypes.find((type) => type === account.accountType) ?? "SAVINGS";
    setDraftType(currentType);
    setBranchId("");
    setUpdateReview(undefined);
    setEditing(true);
    setActionError(undefined);
    void loadBranches();
  }

  function cancelEdit() {
    setEditing(false);
    setUpdateReview(undefined);
    setBranchError(undefined);
    setActionError(undefined);
  }

  function reviewUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedBranch = branches.find((branch) => String(branch.branchId) === branchId);
    if (!selectedBranch) {
      setActionError("Choose a branch from the current bank-core branch list.");
      return;
    }
    setActionError(undefined);
    setUpdateReview({ accountType: draftType, branch: selectedBranch });
  }

  async function refreshAfterConflict() {
    setShowCloseConfirmation(false);
    setUpdateReview(undefined);
    setEditing(false);
    await refreshAccount();
  }

  async function confirmUpdate() {
    if (!account || !updateReview || mutationLock.current) return;
    mutationLock.current = true;
    setPending("updating");
    setActionError(undefined);
    setNotice(undefined);
    try {
      const latest = await accountsApi.byId(accountId);
      if (!sameAccountSnapshot(account, latest)) {
        setAccount(latest);
        setEditing(false);
        setUpdateReview(undefined);
        setActionError("This account changed since this page loaded. Its current server state has been refreshed; review it before editing again.");
        return;
      }
      const request: AccountRequest = {
        accountType: updateReview.accountType,
        // The backend update DTO requires initialDeposit, while updateAccount ignores it.
        // Forward the server-returned balance unchanged so this form never changes money.
        initialDeposit: latest.balance,
        branchId: updateReview.branch.branchId
      };
      const updated = await accountsApi.update(accountId, request);
      if (updated.accountId !== accountId) throw new Error("The update response did not match the requested account.");
      setAccount(updated);
      setEditing(false);
      setUpdateReview(undefined);
      setNotice("Account update confirmed by bank-core. The request preserved the current balance.");
      const refreshed = await refreshAccount();
      if (!refreshed) setRefreshError("Bank-core confirmed the update, but current account details could not be refreshed.");
    } catch (failure) {
      if (hasUncertainOutcome(failure)) {
        setEditing(false);
        setUpdateReview(undefined);
        setActionError("The update result is uncertain. No automatic retry was sent. The latest account fields are being read back; the account response does not include its branch, so verify branch assignment before making another change.");
        const refreshed = await refreshAccount();
        if (!refreshed) setRefreshError("The update may have completed, and the account read-back also failed. Do not resubmit until an authorized staff member verifies the current record.");
      } else if (failure instanceof ApiError && failure.status === 409) {
        setActionError(actionFailureMessage(failure, "update"));
        await refreshAfterConflict();
      } else {
        setActionError(actionFailureMessage(failure, "update"));
      }
    } finally {
      mutationLock.current = false;
      setPending(undefined);
    }
  }

  async function confirmClose() {
    if (!account || account.accountStatus === "CLOSED" || mutationLock.current) return;
    if (!isZeroBalance(account.balance) && !acknowledgeBalance) return;
    mutationLock.current = true;
    setPending("closing");
    setActionError(undefined);
    setNotice(undefined);
    try {
      const latest = await accountsApi.byId(accountId);
      if (!sameAccountSnapshot(account, latest)) {
        setAccount(latest);
        setShowCloseConfirmation(false);
        setAcknowledgeBalance(false);
        setActionError("This account changed since this page loaded. Its current server state has been refreshed; review it before closing.");
        return;
      }
      if (latest.accountStatus === "CLOSED") {
        setAccount(latest);
        setShowCloseConfirmation(false);
        setNotice("This account was already closed by bank-core. No close request was sent.");
        return;
      }
      await accountsApi.close(accountId);
      setShowCloseConfirmation(false);
      setAcknowledgeBalance(false);
      const refreshed = await refreshAccount();
      if (refreshed?.accountStatus === "CLOSED") {
        setNotice("Account closed by bank-core. No balance transfer or ledger posting was performed.");
      } else {
        setNotice("Bank-core accepted the close request, but the current account status could not be confirmed. Refresh before taking further action.");
      }
    } catch (failure) {
      if (hasUncertainOutcome(failure)) {
        setShowCloseConfirmation(false);
        setAcknowledgeBalance(false);
        setActionError("The close result is uncertain. No automatic retry was sent. Reading the current account status from bank-core.");
        const refreshed = await refreshAccount();
        if (refreshed?.accountStatus === "CLOSED") {
          setActionError(undefined);
          setNotice("A read-back confirms that bank-core closed this account. Its balance remains unchanged.");
        } else if (refreshed) {
          setActionError("The close result is uncertain; the latest read-back still shows this account as open. No retry was sent. Review the current status before deliberately confirming another close request.");
        } else {
          setActionError("The close result is uncertain and bank-core could not confirm the current status. Do not submit another close request until an authorized staff member verifies the account.");
        }
      } else if (failure instanceof ApiError && failure.status === 409) {
        setActionError(actionFailureMessage(failure, "close"));
        await refreshAfterConflict();
      } else {
        setActionError(actionFailureMessage(failure, "close"));
      }
    } finally {
      mutationLock.current = false;
      setPending(undefined);
    }
  }

  const requiresBalanceAcknowledgment = Boolean(account && !isZeroBalance(account.balance));

  return <>
    <SectionHeading eyebrow="Staff workspace" title={account?.accountNumber ?? "Account details"}>
      <Link href="/staff/accounts" className="button ghost">Back to accounts</Link>
    </SectionHeading>
    {loading && <p className="card" role="status">Loading account details from bank-core…</p>}
    {!loading && loadError && <div className="error-box grid gap-3" role="alert">
      <p>{loadError}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="button secondary w-fit" onClick={() => setReloadVersion((version) => version + 1)}>Reload account</button>
        <Link href="/staff/accounts" className="button ghost">Account directory</Link>
      </div>
    </div>}
    {!loading && account && <>
      <section className="card grid gap-4" aria-label="Account information">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="muted">Account number</dt><dd className="font-bold">{account.accountNumber}</dd></div>
          <div><dt className="muted">Account type</dt><dd className="font-bold">{account.accountType}</dd></div>
          <div><dt className="muted">Status</dt><dd className="font-bold">{account.accountStatus}</dd></div>
          <div><dt className="muted">Current balance</dt><dd className="font-bold">{formatMoney(account.balance)}</dd></div>
          <div><dt className="muted">Account ID</dt><dd className="break-all font-mono text-sm">{account.accountId}</dd></div>
          <div><dt className="muted">Created</dt><dd>{formatTimestamp(account.createdAt)}</dd></div>
          <div><dt className="muted">Updated</dt><dd>{formatTimestamp(account.updatedAt)}</dd></div>
        </dl>
        <p className="rounded-lg bg-slate-50 p-3 text-sm muted" role="note">
          Bank-core does not return a customer record UUID, linked user UUID, or branch for this account. Account ID identifies the account only; no customer-detail link is available from this response.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/staff/accounts/${encodeURIComponent(account.accountId)}/transactions`} className="button">View transaction history</Link>
          <button type="button" className="button secondary" disabled={pending !== undefined || editing} onClick={beginEdit}>Edit account type or branch</button>
          {account.accountStatus !== "CLOSED" && <button type="button" className="button ghost" disabled={pending !== undefined || editing} onClick={() => {
            setShowCloseConfirmation(true);
            setAcknowledgeBalance(false);
            setActionError(undefined);
          }}>Close account</button>}
          <button type="button" className="button ghost" disabled={pending !== undefined} onClick={() => void refreshAccount()}>Refresh account</button>
        </div>
        {account.accountStatus === "CLOSED" && <p className="muted" role="status">This account is already closed. It cannot be closed again. Bank-core still exposes account type and branch updates for this record.</p>}
      </section>

      {editing && <form className="card mt-5 grid gap-4" onSubmit={reviewUpdate}>
        <h2 className="text-xl font-black">Update account type or branch</h2>
        <p className="muted">Bank-core&apos;s update request requires a branch ID, but account details do not return the current branch. Select the branch to set explicitly.</p>
        <div className="field">
          <label htmlFor="staff-account-type">Account type</label>
          <select id="staff-account-type" value={draftType} disabled={pending !== undefined} onChange={(event) => {
            const selected = openingAccountTypes.find((type) => type === event.target.value);
            if (selected) setDraftType(selected);
          }}>
            {openingAccountTypes.map((type) => <option key={type} value={type}>{accountOpeningTerms[type].label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="staff-account-branch">Branch to set</label>
          <select id="staff-account-branch" value={branchId} required disabled={pending !== undefined || branchesLoading || branches.length === 0} onChange={(event) => setBranchId(event.target.value)}>
            <option value="">Choose a branch</option>
            {branches.map((branch) => <option key={branch.branchId} value={branch.branchId}>{branch.branchName}{branch.address ? ` — ${branch.address}` : ""}</option>)}
          </select>
          {branchesLoading && <small role="status">Loading branches…</small>}
          {branchError && <small className="text-red-800" role="alert">{branchError}</small>}
        </div>
        <p className="text-sm muted">The validated update DTO also requires <code>initialDeposit</code>. Bank-core ignores that field during account updates, so this form forwards the current server balance unchanged: {formatMoney(account.balance)}.</p>
        {actionError && <p className="error-box" role="alert">{actionError}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="button" disabled={pending !== undefined || branchesLoading || branches.length === 0}>Review account changes</button>
          <button type="button" className="button ghost" disabled={pending !== undefined} onClick={cancelEdit}>Cancel</button>
        </div>
      </form>}

      {updateReview && editing && <section className="card mt-5 grid gap-4" aria-label="Review account changes">
        <h2 className="text-xl font-black">Review account changes</h2>
        <p>Account type: {account.accountType} → {updateReview.accountType}</p>
        <p>Branch to set: {updateReview.branch.branchName} · {updateReview.branch.branchId}</p>
        <p className="muted">Current balance {formatMoney(account.balance)} will be forwarded unchanged in the required DTO. Bank-core&apos;s update service ignores the deposit field; no money will move.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="button" disabled={pending !== undefined} onClick={() => void confirmUpdate()}>{pending === "updating" ? "Updating account…" : "Confirm account changes"}</button>
          <button type="button" className="button ghost" disabled={pending !== undefined} onClick={() => setUpdateReview(undefined)}>Back to edit</button>
        </div>
      </section>}

      {showCloseConfirmation && account.accountStatus !== "CLOSED" && <section className="card mt-5 grid gap-4" aria-label="Close account confirmation">
        <h2 className="text-xl font-black">Confirm account closure</h2>
        <p>Closing changes this account&apos;s status to CLOSED. Bank-core does not check the balance, transfer funds, or create a ledger posting during closure.</p>
        {!isZeroBalance(account.balance) && <>
          <p className="error-box">This account has a balance of {formatMoney(account.balance)}. The balance will remain in the account. Bank-core blocks deposits, withdrawals and transfers for closed accounts, so closure can leave these funds unavailable through those workflows.</p>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={acknowledgeBalance} disabled={pending !== undefined} onChange={(event) => setAcknowledgeBalance(event.target.checked)} />
            <span>I understand the remaining balance will stay in this account.</span>
          </label>
        </>}
        <p>This is a consequential status change. The exposed account API has no reopen operation; confirm only after reviewing the account and any remaining balance.</p>
        {actionError && <p className="error-box" role="alert">{actionError}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" className="button" disabled={pending !== undefined || (requiresBalanceAcknowledgment && !acknowledgeBalance)} onClick={() => void confirmClose()}>{pending === "closing" ? "Closing account…" : "Confirm close account"}</button>
          <button type="button" className="button ghost" disabled={pending !== undefined} onClick={() => {
            setShowCloseConfirmation(false);
            setAcknowledgeBalance(false);
          }}>Cancel</button>
        </div>
      </section>}

      {actionError && !editing && !showCloseConfirmation && <p className="error-box mt-5" role="alert">{actionError}</p>}
      {notice && <p className="success-box mt-5" role="status">{notice}</p>}
      {refreshError && <div className="error-box mt-5 grid gap-3" role="alert"><p>{refreshError}</p><button className="button secondary w-fit" disabled={pending !== undefined} onClick={() => void refreshAccount()}>Refresh account details</button></div>}
    </>}
  </>;
}
