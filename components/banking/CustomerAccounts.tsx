"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { accountsApi } from "@/lib/api/accounts";
import type { Account } from "@/lib/api/contracts";
import { ApiError } from "@/lib/api/errors";
import { CUSTOMER_ACCOUNT_OPENING, CUSTOMER_ONBOARDING } from "@/lib/auth/navigation";
import { AccountSummary } from "./AccountSummary";
import { useAccountOpeningEligibility } from "./useAccountOpeningEligibility";

export function CustomerAccounts() {
  const { status } = useAuth();
  const { eligibility, recheckEligibility } = useAccountOpeningEligibility();
  const [accounts, setAccounts] = useState<Account[]>();
  const [accountError, setAccountError] = useState<string>();
  const needsOnboarding = eligibility.state === "missing-record" || eligibility.state === "verification-needed";

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    void accountsApi.mine().then((result) => {
      if (active) setAccounts(result);
    }).catch((failure: unknown) => {
      if (active) setAccountError(failure instanceof ApiError ? failure.message : "Accounts could not be loaded.");
    });
    return () => { active = false; };
  }, [status]);

  return (
    <>
      <SectionHeading title="Your accounts">
        <div className="flex flex-wrap gap-3">
          {eligibility.state === "eligible" && <Link href={CUSTOMER_ACCOUNT_OPENING} className="button">Open an account</Link>}
          {Boolean(accounts?.length) && <Link href="/customer/transactions/deposit" className="button secondary">Deposit funds</Link>}
        </div>
      </SectionHeading>
      <div className="grid gap-4">
        {needsOnboarding && <div className="card grid gap-3">
          <p>Complete identity verification and your customer record before opening an account.</p>
          <Link href={CUSTOMER_ONBOARDING} className="button w-fit">Continue onboarding</Link>
        </div>}
        {eligibility.state === "error" && <div className="card grid gap-3">
          <p role="alert">{eligibility.message}</p>
          <button type="button" className="button secondary w-fit" onClick={recheckEligibility}>Check eligibility again</button>
        </div>}
        {!accounts && !accountError && <p className="card" role="status">Loading your accounts…</p>}
        {accountError && !(eligibility.state === "missing-record" && accountError === "Customer not found") &&
          <p className="error-box" role="alert">{accountError}</p>}
        {accounts?.length === 0 && !needsOnboarding && <p className="card">No accounts yet.</p>}
        <div className="grid gap-4 md:grid-cols-2">{accounts?.map((account) => <AccountSummary account={account} key={account.accountId} />)}</div>
      </div>
    </>
  );
}
