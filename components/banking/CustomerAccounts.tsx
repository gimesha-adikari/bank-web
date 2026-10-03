"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { accountsApi } from "@/lib/api/accounts";
import { ApiError } from "@/lib/api/errors";
import type { Account } from "@/lib/api/contracts";
import { AccountSummary } from "./AccountSummary";
import { SectionHeading } from "@/components/layout/ProtectedLayout";

export function CustomerAccounts() { const { status } = useAuth(); const [accounts, setAccounts] = useState<Account[]>([]); const [error, setError] = useState<string | null>(null); useEffect(() => { if (status !== "authenticated") return; void accountsApi.mine().then(setAccounts).catch((failure) => setError(failure instanceof ApiError ? failure.message : "Accounts could not be loaded.")); }, [status]); return <><SectionHeading title="Your accounts"><Link href="/customer/transactions/deposit" className="button">Deposit funds</Link></SectionHeading>{error && <div className="error-box mb-5" role="alert">{error}</div>}<div className="grid gap-4 md:grid-cols-2">{accounts.map((account) => <AccountSummary account={account} key={account.accountId} />)}</div></>; }
