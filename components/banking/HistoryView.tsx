"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { accountsApi } from "@/lib/api/accounts";
import { ApiError } from "@/lib/api/errors";
import type { Account, AccountTransaction } from "@/lib/api/contracts";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { formatMoney } from "@/lib/finance/money";
import { TransactionTable } from "./TransactionTable";

function historyFailureMessage(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 401) return "Your session has expired. Sign in again to view this account history.";
  if (failure instanceof ApiError && failure.status === 403) return "You are not permitted to view this account or its transaction history.";
  if (failure instanceof ApiError && failure.status === 404) return "The account or its transaction history was not found.";
  return failure instanceof ApiError ? failure.message : "Transaction history could not be loaded.";
}

function downloadCsv(items: AccountTransaction[]): void {
  const header = "transactionId,accountId,type,amount,balanceAfter,description,createdAt";
  const rows = items.map((item) => [item.transactionId, item.accountId, item.type, item.amount, item.balanceAfter, item.description ?? "", item.createdAt]
    .map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "account-transactions.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function HistoryView() {
  const params = useParams<{ accountId: string }>();
  const accountId = params.accountId;
  const { status, role } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [items, setItems] = useState<AccountTransaction[]>([]);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (status !== "authenticated" || !accountId) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- indicate the new account history request while its server read is pending.
    setPending(true);
    setError(undefined);
    void Promise.all([accountsApi.byId(accountId), accountsApi.history(accountId)]).then(([loadedAccount, history]) => {
      if (!active) return;
      if (loadedAccount.accountId !== accountId || history.some((item) => item.accountId !== accountId)) {
        throw new Error("The account history did not match the requested account.");
      }
      setAccount(loadedAccount);
      setItems(history);
    }).catch((failure: unknown) => {
      if (active) setError(historyFailureMessage(failure));
    }).finally(() => {
      if (active) setPending(false);
    });
    return () => { active = false; };
  }, [accountId, reloadVersion, status]);

  const customerRoute = role === "CUSTOMER";
  const accountsHref = customerRoute ? "/customer/accounts" : "/staff/accounts";
  const detailHref = customerRoute ? undefined : `/staff/accounts/${encodeURIComponent(accountId)}`;

  return <>
    <SectionHeading eyebrow="Account history" title={account?.accountNumber ?? "Transactions"}>
      <div className="flex flex-wrap gap-2">
        <Link href={accountsHref} className="button ghost">Back to accounts</Link>
        {detailHref && <Link href={detailHref} className="button ghost">Account details</Link>}
        {!pending && !error && <button className="button secondary" type="button" onClick={() => downloadCsv(items)}>Download CSV</button>}
      </div>
    </SectionHeading>
    {pending && <p className="card" role="status">Loading transaction history from bank-core…</p>}
    {error && <div className="error-box grid gap-3" role="alert"><p>{error}</p><button type="button" className="button secondary w-fit" onClick={() => setReloadVersion((version) => version + 1)}>Reload history</button></div>}
    {!pending && !error && <>
      <div className="card mb-5">
        <p className="text-sm muted">Current server-reported balance</p>
        <p className="mt-1 text-3xl font-black">{formatMoney(account?.balance)}</p>
        <p className="mt-2 break-all text-xs muted">Account ID: {accountId}</p>
      </div>
      <TransactionTable transactions={items} />
    </>}
  </>;
}
