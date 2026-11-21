"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/errors";
import { customersApi } from "@/lib/api/customers";
import type { Customer, CustomerRecordRequest, CustomerStatus, UserProfile } from "@/lib/api/contracts";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { StaffCustomerRecordFields, type CustomerEditableFields } from "./StaffCustomerRecordFields";

const emptyFields: CustomerEditableFields = { firstName: "", lastName: "", gender: "" as CustomerEditableFields["gender"], email: "", phone: "", address: "", dateOfBirth: "" };
type UserSearchState =
  | { term: string; status: "loading" }
  | { term: string; status: "success"; users: UserProfile[] }
  | { term: string; status: "error"; message: string };

function errorMessage(failure: unknown): string {
  if (!(failure instanceof ApiError)) return "The request could not be completed. Check the current customer records and try again.";
  if (failure.status === 401) return "Your session has expired. Sign in again to continue.";
  if (failure.status === 403) return "Your staff role is not permitted to create customer records.";
  if (failure.status === 404) return "The selected customer login could not be found. Search for an existing customer login again.";
  if (failure.status === 409) return "This login already has a customer record, or the request conflicts with an existing record. Refresh the directory before trying again.";
  if (failure.status === 400 || failure.status === 422) return `Bank-core rejected the customer details. ${failure.message}`;
  if (failure.kind === "network" || failure.kind === "timeout") return "The create request could not be confirmed. Refresh the customer directory before retrying.";
  if (failure.status >= 500) return "Bank-core could not confirm customer creation. Refresh the directory and check whether the record already exists before trying again.";
  return failure.message;
}

function requestBody(userId: string, fields: CustomerEditableFields, status: CustomerStatus): CustomerRecordRequest {
  return { ...fields, userId, status };
}

export function StaffCustomerCreate() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoaded, setCustomersLoaded] = useState(false);
  const [customersError, setCustomersError] = useState<string>();
  const [query, setQuery] = useState("");
  const [userSearch, setUserSearch] = useState<UserSearchState>();
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [fields, setFields] = useState<CustomerEditableFields>(emptyFields);
  const [status, setStatus] = useState<CustomerStatus | "">("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const loadCustomers = useCallback(async () => {
    setCustomersError(undefined);
    setCustomersLoaded(false);
    try {
      setCustomers(await customersApi.listStaffCustomers());
      setCustomersLoaded(true);
    } catch (failure) {
      setCustomersError(failure instanceof ApiError && failure.status === 403
        ? "Your staff role is not permitted to create customer records."
        : failure instanceof ApiError ? failure.message : "Existing customer records could not be checked.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void customersApi.listStaffCustomers().then((result) => {
      if (!active) return;
      setCustomers(result);
      setCustomersLoaded(true);
    }).catch((failure: unknown) => {
      if (!active) return;
      setCustomersError(failure instanceof ApiError && failure.status === 403
        ? "Your staff role is not permitted to create customer records."
        : failure instanceof ApiError ? failure.message : "Existing customer records could not be checked.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    let active = true;
    const timer = setTimeout(() => {
      setUserSearch({ term, status: "loading" });
      void customersApi.searchCustomerUsers(term).then((result) => {
        if (active) setUserSearch({ term, status: "success", users: result.filter((user) => user.roleName === "CUSTOMER") });
      }).catch((failure: unknown) => {
        if (active) setUserSearch({ term, status: "error", message: errorMessage(failure) });
      });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  const currentSearch = userSearch?.term === query.trim() ? userSearch : undefined;
  const searching = Boolean(query.trim()) && (!currentSearch || currentSearch.status === "loading");
  const searchError = currentSearch?.status === "error" ? currentSearch.message : undefined;
  const availableUsers = useMemo(() => {
    const existing = new Set(customers.map((customer) => customer.userId).filter((id): id is string => Boolean(id)));
    const searchedUsers = currentSearch?.status === "success" ? currentSearch.users : [];
    return searchedUsers.filter((user) => !existing.has(user.userId));
  }, [customers, currentSearch]);

  function updateField(field: keyof CustomerEditableFields, next: string) {
    setFields((current) => ({ ...current, [field]: next }));
  }

  function chooseUser(userId: string) {
    const user = availableUsers.find((candidate) => candidate.userId === userId) ?? null;
    setSelected(user);
    setError(undefined);
    setFields(user ? {
      firstName: user.firstName ?? "", lastName: user.lastName ?? "", gender: "" as CustomerEditableFields["gender"],
      email: user.email ?? "", phone: "", address: user.address ?? "", dateOfBirth: ""
    } : emptyFields);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !customersLoaded || !selected || !status) return;
    setPending(true);
    setError(undefined);
    try {
      const created = await customersApi.createStaffCustomer(requestBody(selected.userId, fields, status));
      if (!created.customerId) throw new ApiError({ kind: "parse", message: "Bank-core created a record but did not return its customer identifier. Refresh the directory to locate it." });
      router.push(`/staff/customers/${encodeURIComponent(created.customerId)}`);
    } catch (failure) {
      const fieldErrors = failure instanceof ApiError && failure.fieldErrors
        ? ` ${Object.entries(failure.fieldErrors).map(([field, message]) => `${field}: ${message}`).join(" ")}`
        : "";
      setError(`${errorMessage(failure)}${fieldErrors}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SectionHeading eyebrow="Staff workspace" title="Create customer record" />
      <div className="mb-5 card border-amber-300 bg-amber-50 text-sm">
        This links an existing CUSTOMER login to a customer record. It does not create a login or approve KYC. Customer self-service account opening still requires bank-core KYC approval.
      </div>
      {customersError && <div className="error-box grid gap-3" role="alert"><p>{customersError}</p><button type="button" className="button secondary w-fit" onClick={() => void loadCustomers()}>Retry record check</button></div>}
      {!customersError && !customersLoaded && <p className="card" role="status">Checking existing customer records…</p>}
      {customersLoaded && <form className="card grid gap-5" onSubmit={(event) => void submit(event)}>
        <div className="field">
          <label htmlFor="customer-user-search">Search existing customer logins</label>
          <input id="customer-user-search" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); setFields(emptyFields); setError(undefined); }} autoComplete="off" />
          <small>Search uses bank-core’s customer-user name and email search.</small>
        </div>
        {searching && <p role="status">Searching existing customer logins…</p>}
        {searchError && <p className="error-box" role="alert">{searchError}</p>}
        {!searching && query.trim() && !searchError && availableUsers.length === 0 && <p className="muted">No unlinked customer login matched that search.</p>}
        {availableUsers.length > 0 && <div className="field">
          <label htmlFor="customer-user-select">Existing customer login</label>
          <select id="customer-user-select" value={selected?.userId ?? ""} onChange={(event) => chooseUser(event.target.value)} required>
            <option value="">Choose a customer login</option>
            {availableUsers.map((user) => <option key={user.userId} value={user.userId}>{[user.firstName, user.lastName].filter(Boolean).join(" ") || user.username} · {user.email ?? "email unavailable"}</option>)}
          </select>
          {selected && <small>Selected user ID: {selected.userId}</small>}
        </div>}
        {selected && <>
          <h2 className="text-lg font-bold">Customer record details</h2>
          <StaffCustomerRecordFields value={fields} onChange={updateField} prefix="create-customer" />
          <div className="field">
            <label htmlFor="create-customer-status">Record status</label>
            <select id="create-customer-status" value={status} onChange={(event) => setStatus(event.target.value as CustomerStatus | "")} required>
              <option value="">Choose a status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="PENDING">Pending</option><option value="RESIGNED">Resigned</option>
            </select>
          </div>
        </>}
        {error && <div className="error-box" role="alert">{error}</div>}
        <div className="flex flex-wrap gap-3">
          <button className="button" disabled={pending || !selected || !status}>{pending ? "Creating…" : "Create customer record"}</button>
          <Link href="/staff/customers" className="button ghost">Cancel</Link>
        </div>
      </form>}
    </>
  );
}
