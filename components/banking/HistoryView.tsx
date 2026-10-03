"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { accountsApi } from "@/lib/api/accounts";
import { ApiError } from "@/lib/api/errors";
import type { Account, Transaction } from "@/lib/api/contracts";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { TransactionTable } from "./TransactionTable";

function downloadCsv(items: Transaction[]): void {
  const header = "type,amount,balanceAfter,description,createdAt";
  const rows = items.map((item) => [item.type, item.amount, item.balanceAfter ?? "", item.description ?? "", item.createdAt ?? item.timestamp ?? ""].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "account-transactions.csv"; anchor.click(); URL.revokeObjectURL(url);
}

export function HistoryView() { const params = useParams<{ accountId: string }>(); const accountId = params.accountId; const { status, role } = useAuth(); const [account, setAccount] = useState<Account | null>(null); const [items, setItems] = useState<Transaction[]>([]); const [error, setError] = useState<string | null>(null); const [pending, setPending] = useState(true); useEffect(() => { if (status !== "authenticated" || !accountId) return; void Promise.all([accountsApi.byId(accountId), accountsApi.history(accountId)]).then(([loadedAccount, history]) => { setAccount(loadedAccount); setItems(history as Transaction[]); }).catch((failure) => setError(failure instanceof ApiError ? failure.message : "History could not be loaded.")).finally(() => setPending(false)); }, [accountId, status]); return <><SectionHeading eyebrow="Account history" title={account?.accountNumber ?? "Transactions"}><div className="flex gap-2"><Link href={role === "CUSTOMER" ? "/customer/accounts" : "/staff"} className="button ghost">Back to accounts</Link>{!pending && !error && <button className="button secondary" onClick={() => downloadCsv(items)}>Download CSV</button>}</div></SectionHeading>{pending && <div className="card">Loading transaction history…</div>}{error && <div className="error-box" role="alert">{error}</div>}{!pending && !error && <><div className="card mb-5"><p className="text-sm muted">Current server-reported balance</p><p className="mt-1 text-3xl font-black">{account?.balance ?? "—"} LKR</p></div><TransactionTable transactions={items} /></>}</>; }
