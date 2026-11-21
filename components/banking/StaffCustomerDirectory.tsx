"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { customersApi } from "@/lib/api/customers";
import type { Customer } from "@/lib/api/contracts";
import { ApiError } from "@/lib/api/errors";

function messageFor(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 403) return "Your staff role is not permitted to view customer records.";
  if (failure instanceof ApiError && failure.status === 401) return "Your session has expired. Sign in again to continue.";
  return failure instanceof ApiError ? failure.message : "Customer records could not be loaded.";
}

function nameOf(customer: Customer): string {
  return `${customer.firstName} ${customer.lastName}`.trim() || "Unnamed customer";
}

export function StaffCustomerDirectory() {
  const [customers, setCustomers] = useState<Customer[]>();
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setCustomers(await customersApi.listStaffCustomers());
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void customersApi.listStaffCustomers().then((result) => {
      if (active) setCustomers(result);
    }).catch((failure: unknown) => {
      if (active) setError(messageFor(failure));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return customers ?? [];
    return (customers ?? []).filter((customer) => [
      customer.firstName, customer.lastName, customer.email, customer.phone, customer.username,
      customer.customerId, customer.userId
    ].some((value) => value?.toLocaleLowerCase().includes(needle)));
  }, [customers, search]);

  return (
    <>
      <SectionHeading eyebrow="Staff workspace" title="Customer directory">
        <Link href="/staff/customers/new" className="button">Create customer record</Link>
      </SectionHeading>
      <div className="grid gap-5">
        <p className="muted">Search filters the records returned by bank-core. The current backend returns the complete list without pagination.</p>
        <div className="field">
          <label htmlFor="staff-customer-search">Search customer records</label>
          <input id="staff-customer-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, phone, or identifier" />
        </div>
        {loading && <div className="card" role="status">Loading customer records…</div>}
        {error && <div className="error-box grid gap-3" role="alert"><p>{error}</p><button type="button" className="button secondary w-fit" onClick={() => void loadCustomers()}>Try again</button></div>}
        {!loading && !error && customers?.length === 0 && <div className="card">No customer records were returned by bank-core.</div>}
        {!loading && !error && customers && customers.length > 0 && filtered.length === 0 && <div className="card">No customer records match “{search.trim()}”.</div>}
        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{filtered.map((customer) => (
                <tr key={customer.customerId} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{nameOf(customer)}</td>
                  <td className="px-4 py-3">{customer.email || "—"}</td>
                  <td className="px-4 py-3">{customer.phone || "—"}</td>
                  <td className="px-4 py-3">{customer.status || "Unknown"}</td>
                  <td className="px-4 py-3 text-right"><Link className="font-bold text-teal-800 underline" href={`/staff/customers/${encodeURIComponent(customer.customerId)}`}>View details</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
