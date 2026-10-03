"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ApiError } from "@/lib/api/errors";

export function AppHeader() {
  const { role, username, signOut } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const home = role === "ADMIN" ? "/admin" : role === "CUSTOMER" ? "/customer" : "/staff";
  async function handleSignOut(): Promise<void> {
    setPending(true);
    setLogoutError(null);
    try { await signOut(); } catch (failure) { setLogoutError(failure instanceof ApiError ? failure.message : "Logout could not be confirmed. Try again."); } finally { setPending(false); }
  }
  return <header className="border-b border-slate-200 bg-white"><div className="container flex flex-wrap items-center justify-between gap-4 py-4"><Link href={home} className="text-xl font-black text-teal-800">My Bank</Link><nav aria-label="Application navigation" className="flex flex-wrap items-center gap-3 text-sm font-semibold">{role === "CUSTOMER" && <><Link href="/customer/accounts">Accounts</Link><Link href="/customer/transactions/deposit">Deposit</Link><Link href="/customer/transactions/withdraw">Withdraw</Link><Link href="/customer/transactions/transfer">Transfer</Link><Link href="/customer/profile">Profile</Link></>}{(role === "ADMIN" || role === "TELLER" || role === "MANAGER") && <Link href="/staff/accounts/new">Open account</Link>}<span className="muted">{username}</span><button className="button ghost" disabled={pending} onClick={() => void handleSignOut()}>Sign out</button></nav>{logoutError && <div className="container pb-3"><div className="error-box" role="alert">{logoutError} Revocation was not confirmed; you remain signed in.</div></div>}</div></header>;
}

export function AppFooter() { return <footer className="container mt-auto border-t border-slate-200 py-5 text-sm text-slate-500">BankingSystem is the authority for financial state and authorization.</footer>; }
