"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { allowsRole, PAGE_ROLES, TELLER_ACCOUNT_OPENING } from "@/lib/auth/navigation";

export default function StaffPage() {
  const { role } = useAuth();
  return <>
    <SectionHeading eyebrow="Staff workspace" title="Operational banking" />
    <div className="grid gap-4 md:grid-cols-2">
      {allowsRole(role, PAGE_ROLES.teller) && <div className="card">
        <h2 className="text-xl font-black">Account opening</h2>
        <p className="mt-2 muted">Open an account through the server-authorized teller flow.</p>
        <Link href={TELLER_ACCOUNT_OPENING} className="button mt-5">Open an account</Link>
      </div>}
      <div className="card">
        <h2 className="text-xl font-black">Customer records</h2>
        <p className="mt-2 muted">Search, review, and maintain customer records linked to existing customer users.</p>
        <Link href="/staff/customers" className="button secondary mt-5">Browse customers</Link>
      </div>
      <div className="card">
        <h2 className="text-xl font-black">Authority boundary</h2>
        <p className="mt-2 muted">Customer ownership, thresholds, and balances are decided by BankingSystem.</p>
      </div>
    </div>
  </>;
}
