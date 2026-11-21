"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { accountsApi } from "@/lib/api/accounts";
import type { Account } from "@/lib/api/contracts";
import { ApiError } from "@/lib/api/errors";
import { formatMoney } from "@/lib/finance/money";

function accountLoadFailure(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 401) return "Your staff session has expired. Sign in again to view account records.";
  if (failure instanceof ApiError && failure.status === 403) return "Your staff role is not permitted to view account records.";
  if (failure instanceof ApiError && failure.status === 404) return "The account directory endpoint could not be found.";
  return failure instanceof ApiError ? failure.message : "Account records could not be loaded.";
}

function timestamp(value: string | undefined): string {
  return value ?? "—";
}

export function StaffAccountDirectory() {
  const { status } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- retain the loading state across an explicit directory reload.
    setLoading(true);
    void accountsApi.listStaffAccounts().then((result) => {
      if (!active) return;
      setAccounts(result);
      setError(undefined);
    }).catch((failure: unknown) => {
      if (active) setError(accountLoadFailure(failure));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [reloadVersion, status]);

  return <>
    <SectionHeading eyebrow="Staff workspace" title="Accounts">
      <Link href="/staff" className="button ghost">Staff workspace</Link>
    </SectionHeading>
    {loading && <p className="card" role="status">Loading accounts from bank-core…</p>}
    {!loading && error && <div className="error-box grid gap-3" role="alert">
      <p>{error}</p>
      <button type="button" className="button secondary w-fit" onClick={() => {
        setLoading(true);
        setError(undefined);
        setReloadVersion((version) => version + 1);
      }}>Reload accounts</button>
    </div>}
    {!loading && !error && accounts?.length === 0 && <p className="card" role="status">No accounts were returned by bank-core.</p>}
    {!loading && !error && accounts && accounts.length > 0 && <div className="card overflow-x-auto">
      <p className="mb-3 text-sm muted" role="note">Bank-core currently returns the complete account list without pagination or server-side filters.</p>
      <table className="w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">Bank account directory</caption>
        <thead><tr className="border-b border-slate-200 text-slate-500">
          <th className="p-3">Account number</th><th className="p-3">Account ID</th><th className="p-3">Type</th>
          <th className="p-3">Status</th><th className="p-3">Balance</th><th className="p-3">Created</th><th className="p-3">Updated</th>
        </tr></thead>
        <tbody>{accounts.map((account) => <tr key={account.accountId} className="border-b border-slate-100 last:border-0">
          <td className="p-3 font-bold"><Link href={`/staff/accounts/${encodeURIComponent(account.accountId)}`} className="text-teal-800 hover:underline">{account.accountNumber}</Link></td>
          <td className="p-3 break-all font-mono text-xs">{account.accountId}</td>
          <td className="p-3">{account.accountType}</td>
          <td className="p-3">{account.accountStatus}</td>
          <td className="p-3">{formatMoney(account.balance)}</td>
          <td className="p-3">{timestamp(account.createdAt)}</td>
          <td className="p-3">{timestamp(account.updatedAt)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </>;
}
