"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export function AppHeader() {
  const { role, username, signOut } = useAuth();
  const home = role === "ADMIN" ? "/admin" : role === "CUSTOMER" ? "/customer" : "/staff";
  return <header className="border-b border-slate-200 bg-white"><div className="container flex flex-wrap items-center justify-between gap-4 py-4"><Link href={home} className="text-xl font-black text-teal-800">My Bank</Link><nav aria-label="Application navigation" className="flex flex-wrap items-center gap-3 text-sm font-semibold">{role === "CUSTOMER" && <><Link href="/customer/accounts">Accounts</Link><Link href="/customer/transactions/deposit">Deposit</Link><Link href="/customer/transactions/withdraw">Withdraw</Link><Link href="/customer/transactions/transfer">Transfer</Link><Link href="/customer/profile">Profile</Link></>}{(role === "ADMIN" || role === "TELLER" || role === "MANAGER") && <Link href="/staff/accounts/new">Open account</Link>}<span className="muted">{username}</span><button className="button ghost" onClick={() => void signOut()}>Sign out</button></nav></div></header>;
}

export function AppFooter() { return <footer className="container mt-auto border-t border-slate-200 py-5 text-sm text-slate-500">BankingSystem is the authority for financial state and authorization.</footer>; }
