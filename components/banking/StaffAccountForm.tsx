"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { staffApi } from "@/lib/api/staff";
import { ApiError } from "@/lib/api/errors";
import { validateAmount } from "@/lib/finance/money";
import type { Branch, Customer } from "@/lib/api/contracts";

export function StaffAccountForm() {
  const { status } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [userId, setUserId] = useState("");
  const [accountType, setAccountType] = useState("SAVINGS");
  const [initialDeposit, setInitialDeposit] = useState("");
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    void Promise.all([staffApi.customers(), staffApi.branches()]).then(([loadedCustomers, loadedBranches]) => {
      if (!active) return;
      const linkedCustomers = loadedCustomers.filter((customer) => Boolean(customer.userId));
      setCustomers(linkedCustomers);
      setBranches(loadedBranches);
      const requestedUserId = new URLSearchParams(window.location.search).get("customerUserId");
      if (requestedUserId && linkedCustomers.some((customer) => customer.userId === requestedUserId)) setUserId(requestedUserId);
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof ApiError ? failure.message : "Staff data could not be loaded.");
    });
    return () => { active = false; };
  }, [status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== "authenticated" || pending) return;
    const amountError = accountType === "CHECKING" && initialDeposit.trim() === "0.00" ? undefined : validateAmount(initialDeposit);
    if (amountError) { setError(amountError); return; }
    if (!userId || !customers.some((customer) => customer.userId === userId)) { setError("Choose a customer login."); return; }
    if (!branchId) { setError("Choose a branch."); return; }
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const account = await staffApi.openAccount(userId, { accountType, initialDeposit, branchId: Number(branchId) });
      setMessage(`Account ${account.accountNumber} was created by BankingSystem.`);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Account opening failed.");
    } finally {
      setPending(false);
    }
  }

  const minimum = accountType === "SAVINGS" ? "1000.00" : accountType === "FIXED_DEPOSIT" ? "5000.00" : "0.00";
  return (
    <form className="card grid gap-5" onSubmit={(event) => void submit(event)}>
      <div className="field">
        <label htmlFor="staff-customer">Customer</label>
        <select id="staff-customer" value={userId} onChange={(event) => setUserId(event.target.value)} required>
          <option value="">Choose a customer</option>
          {customers.map((customer) => <option key={customer.userId} value={customer.userId}>{customer.firstName} {customer.lastName} · {customer.username ?? customer.email ?? customer.userId}</option>)}
        </select>
        <small>This Teller endpoint targets the linked user ID, not the customer record ID.</small>
      </div>
      <div className="field">
        <label htmlFor="staff-account-type">Account type</label>
        <select id="staff-account-type" value={accountType} onChange={(event) => setAccountType(event.target.value)}><option value="SAVINGS">Savings</option><option value="CHECKING">Checking</option><option value="FIXED_DEPOSIT">Fixed deposit</option></select>
      </div>
      <div className="field">
        <label htmlFor="staff-branch">Branch</label>
        <select id="staff-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)} required><option value="">Choose a branch</option>{branches.map((branch) => <option key={branch.branchId} value={branch.branchId}>{branch.branchName}</option>)}</select>
      </div>
      <div className="field">
        <label htmlFor="staff-opening-deposit">Initial deposit (decimal text)</label>
        <input id="staff-opening-deposit" value={initialDeposit} onChange={(event) => setInitialDeposit(event.target.value)} inputMode="decimal" required />
        <small>Current backend guidance: minimum {minimum} LKR for {accountType}. BankingSystem validates the final value; no client-side rounding is applied.</small>
      </div>
      {error && <div className="error-box" role="alert">{error}</div>}
      {message && <div className="success-box" role="status">{message}</div>}
      <button className="button" disabled={pending}>{pending ? "Opening…" : "Open account"}</button>
    </form>
  );
}
