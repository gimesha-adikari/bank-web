"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { accountsApi } from "@/lib/api/accounts";
import { ApiError } from "@/lib/api/errors";
import type { Account } from "@/lib/api/contracts";
import { AccountSummary } from "./AccountSummary";
import { SectionHeading } from "@/components/layout/ProtectedLayout";

export function CustomerDashboard() { const { token, username } = useAuth(); const [accounts, setAccounts] = useState<Account[]>([]); const [error, setError] = useState<string | null>(null); const [pending, setPending] = useState(true); useEffect(() => { if (!token) return; void accountsApi.mine(token).then(setAccounts).catch((failure) => setError(failure instanceof ApiError ? failure.message : "Accounts could not be loaded.")).finally(() => setPending(false)); }, [token]); return <><SectionHeading eyebrow="Customer banking" title={`Welcome, ${username ?? "customer"}`}><Link href="/customer/transactions/deposit" className="button">Start a transaction</Link></SectionHeading>{pending && <div className="card">Loading your accounts…</div>}{error && <div className="error-box" role="alert">{error}</div>}{!pending && !error && !accounts.length && <div className="card"><h2 className="text-xl font-black">No accounts yet</h2><p className="mt-2 muted">An account must be opened through a supported bank-core flow.</p></div>}<div className="grid gap-4 md:grid-cols-2">{accounts.map((account) => <AccountSummary key={account.accountId} account={account} />)}</div></>; }
