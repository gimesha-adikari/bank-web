"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { accountsApi } from "@/lib/api/accounts";
import { customersApi } from "@/lib/api/customers";
import { kycApi } from "@/lib/api/kyc";
import { ApiError } from "@/lib/api/errors";
import type { Account, Customer, KycStatus } from "@/lib/api/contracts";
import { CUSTOMER_ONBOARDING } from "@/lib/auth/navigation";
import { AccountSummary } from "./AccountSummary";

export function CustomerDashboard() {
  const { status, username } = useAuth();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>();
  const [accountError, setAccountError] = useState<string>();
  const [customer, setCustomer] = useState<Customer | null>();
  const [customerError, setCustomerError] = useState(false);
  const [kycStatus, setKycStatus] = useState<KycStatus | null>();
  const [kycError, setKycError] = useState(false);
  const hasRecord = Boolean(customer);
  const hasNoAccounts = accounts?.length === 0;

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    void customersApi.me().then((record) => {
      if (active) setCustomer(record);
    }).catch(() => {
      if (active) setCustomerError(true);
    });
    void accountsApi.mine().then((records) => {
      if (active) setAccounts(records);
    }).catch((failure: unknown) => {
      if (active) setAccountError(failure instanceof ApiError ? failure.message : "Accounts could not be loaded.");
    });
    return () => { active = false; };
  }, [status]);

  useEffect(() => {
    if (customer === null) router.replace(CUSTOMER_ONBOARDING);
  }, [customer, router]);

  useEffect(() => {
    if (!hasRecord || !hasNoAccounts) return;
    let active = true;
    void kycApi.me().then((latest) => {
      if (active) setKycStatus(latest?.status ?? null);
    }).catch(() => {
      if (active) setKycError(true);
    });
    return () => { active = false; };
  }, [hasRecord, hasNoAccounts]);

  return (
    <>
      <SectionHeading eyebrow="Customer banking" title={`Welcome, ${username ?? "customer"}`}>
        {customer !== null && <Link href="/customer/transactions/deposit" className="button">Start a transaction</Link>}
      </SectionHeading>
      <div className="grid gap-4">
        {customer === null && <div className="card">
          <h2 className="text-xl font-black">Set up your customer record</h2>
          <p className="mt-2 muted">Verify your identity and complete your customer details.</p>
          <Link href={CUSTOMER_ONBOARDING} className="button mt-4">Continue onboarding</Link>
        </div>}
        {customerError && <p className="error-box" role="alert">We could not load your customer record. Try reloading the page.</p>}
        {accounts === undefined && !accountError && <p className="card" role="status">Loading your accounts…</p>}
        {accountError && <p className="error-box" role="alert">{accountError}</p>}
        {hasNoAccounts && customer !== null && <div className="card">
          <h2 className="text-xl font-black">No accounts yet</h2>
          {hasRecord && kycStatus === "APPROVED" && <p className="mt-2 muted">Opening an account is your next step.</p>}
          {hasRecord && kycStatus === undefined && !kycError && <p className="mt-2 muted" role="status">Checking your verification status…</p>}
          {hasRecord && kycError && <p className="mt-2 muted">We could not load your verification status.</p>}
          {hasRecord && <Link href={CUSTOMER_ONBOARDING} className="button secondary mt-4">
            {kycStatus !== undefined && kycStatus !== "APPROVED" ? "Continue onboarding" : "View onboarding"}
          </Link>}
        </div>}
        {hasRecord && !hasNoAccounts && <Link href={CUSTOMER_ONBOARDING} className="w-fit text-sm font-bold text-teal-700">View onboarding</Link>}
        <div className="grid gap-4 md:grid-cols-2">{accounts?.map((account) => <AccountSummary key={account.accountId} account={account} />)}</div>
      </div>
    </>
  );
}
