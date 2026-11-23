"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { ApiError } from "@/lib/api/errors";
import { customersApi } from "@/lib/api/customers";
import type { Customer, CustomerRecordRequest } from "@/lib/api/contracts";
import { StaffCustomerDeletion } from "./StaffCustomerDeletion";
import { StaffCustomerRecordFields, type CustomerEditableFields } from "./StaffCustomerRecordFields";

function recordFields(customer: Customer): CustomerEditableFields {
  const dob = customer.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(customer.dateOfBirth) ? customer.dateOfBirth : "";
  return {
    firstName: customer.firstName ?? "", lastName: customer.lastName ?? "", gender: customer.gender ?? "" as CustomerEditableFields["gender"],
    email: customer.email ?? "", phone: customer.phone ?? "", address: customer.address ?? "", dateOfBirth: dob
  };
}

function loadFailureMessage(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 403) return "Your staff role is not permitted to view this customer record.";
  if (failure instanceof ApiError && failure.status === 404) return "This customer record was not found. It may have been removed.";
  if (failure instanceof ApiError && failure.status === 401) return "Your session has expired. Sign in again to continue.";
  return failure instanceof ApiError ? failure.message : "Customer details could not be loaded.";
}

function saveFailureMessage(failure: unknown): string {
  if (!(failure instanceof ApiError)) return "The update could not be confirmed. Refresh this customer record before retrying.";
  if (failure.status === 401) return "Your session has expired. Sign in again to continue.";
  if (failure.status === 403) return "Your staff role is not permitted to update customer records.";
  if (failure.status === 404) return "The customer record or linked user no longer exists. Reload the directory and inspect the current record.";
  if (failure.status === 409) return "The customer record conflicts with a newer or existing record. Reload it before editing again.";
  if (failure.status === 400 || failure.status === 422) return `Bank-core rejected the customer details. ${failure.message}`;
  if (failure.kind === "network" || failure.kind === "timeout") return "The update may not have completed. Reload the customer record before attempting another update.";
  return failure.message;
}

export function StaffCustomerDetail({ customerId }: Readonly<{ customerId: string }>) {
  const { role } = useAuth();
  const [loadedCustomer, setLoadedCustomer] = useState<{ customerId: string; record: Customer }>();
  const [fields, setFields] = useState<CustomerEditableFields>();
  const [loadError, setLoadError] = useState<{ customerId: string; message: string }>();
  const [reloadVersion, setReloadVersion] = useState(0);
  const [saveError, setSaveError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const customer = loadedCustomer?.customerId === customerId ? loadedCustomer.record : undefined;
  const error = loadError?.customerId === customerId ? loadError.message : undefined;
  const loading = !customer && !error;

  useEffect(() => {
    let active = true;
    void customersApi.getStaffCustomer(customerId).then((result) => {
      if (!active) return;
      setLoadedCustomer({ customerId, record: result });
      setFields(recordFields(result));
    }).catch((failure: unknown) => {
      if (active) setLoadError({ customerId, message: loadFailureMessage(failure) });
    });
    return () => { active = false; };
  }, [customerId, reloadVersion]);

  function retryLoadCustomer() {
    setLoadError(undefined);
    setReloadVersion((version) => version + 1);
  }

  function updateField(field: keyof CustomerEditableFields, value: string) {
    setFields((current) => current ? { ...current, [field]: value } : current);
  }

  function cancelEdit() {
    if (customer) setFields(recordFields(customer));
    setEditing(false);
    setSaveError(undefined);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer?.userId || !customer.status || !fields || pending) return;
    setPending(true);
    setSaveError(undefined);
    setNotice(undefined);
    const body: CustomerRecordRequest = { ...fields, userId: customer.userId, status: customer.status };
    try {
      const updated = await customersApi.updateStaffCustomer(body);
      setLoadedCustomer({ customerId: updated.customerId, record: updated });
      setFields(recordFields(updated));
      setEditing(false);
      setNotice("Customer record updated by bank-core.");
      try {
        const refreshed = await customersApi.getStaffCustomer(customer.customerId);
        setLoadedCustomer({ customerId: refreshed.customerId, record: refreshed });
        setFields(recordFields(refreshed));
      } catch {
        setSaveError("The update was confirmed, but the latest record could not be refreshed. Reload this page to check the server state.");
      }
    } catch (failure) {
      const fieldErrors = failure instanceof ApiError && failure.fieldErrors
        ? ` ${Object.entries(failure.fieldErrors).map(([field, message]) => `${field}: ${message}`).join(" ")}`
        : "";
      setSaveError(`${saveFailureMessage(failure)}${fieldErrors}`);
    } finally {
      setPending(false);
    }
  }

  const tellerHref = customer?.userId ? `/staff/accounts/new?customerUserId=${encodeURIComponent(customer.userId)}` : null;

  return (
    <>
      <SectionHeading eyebrow="Staff workspace" title={customer ? `${customer.firstName} ${customer.lastName}`.trim() : "Customer details"}>
        <div className="flex flex-wrap gap-3">
          <Link href="/staff/customers" className="button ghost">Back to customers</Link>
          {role === "TELLER" && tellerHref && <Link href={tellerHref} className="button secondary">Open Teller account form</Link>}
        </div>
      </SectionHeading>
      {loading && <div className="card" role="status">Loading customer details…</div>}
      {error && <div className="error-box grid gap-3" role="alert"><p>{error}</p><button type="button" className="button secondary w-fit" onClick={retryLoadCustomer}>Try again</button></div>}
      {customer && fields && !loading && <div className="grid gap-5">
        <section className="card grid gap-4" aria-label="Authoritative customer information">
          <h2 className="text-xl font-bold">Customer information</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt className="text-sm muted">Customer ID</dt><dd className="break-all font-mono text-sm">{customer.customerId}</dd></div>
            <div><dt className="text-sm muted">Linked user ID</dt><dd className="break-all font-mono text-sm">{customer.userId ?? "Not linked"}</dd></div>
            <div><dt className="text-sm muted">Username</dt><dd>{customer.username || "—"}</dd></div>
            <div><dt className="text-sm muted">Status</dt><dd>{customer.status || "Unknown"}</dd></div>
          </dl>
          {!customer.userId && <p className="error-box">This record has no linked user ID. Bank-core requires userId for updates and Teller-assisted account opening.</p>}
          {!editing && <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
            <div><p className="text-sm muted">Email</p><p>{customer.email || "—"}</p></div>
            <div><p className="text-sm muted">Phone</p><p>{customer.phone || "—"}</p></div>
            <div><p className="text-sm muted">Gender</p><p>{customer.gender || "—"}</p></div>
            <div><p className="text-sm muted">Date of birth</p><p>{customer.dateOfBirth || "—"}</p></div>
            <div className="sm:col-span-2"><p className="text-sm muted">Address</p><p>{customer.address || "—"}</p></div>
          </div>}
          {!editing && <button type="button" className="button w-fit" disabled={!customer.userId || !customer.status} onClick={() => { setSaveError(undefined); setNotice(undefined); setEditing(true); }}>Edit customer details</button>}
        </section>
        {editing && <form className="card grid gap-5" onSubmit={(event) => void save(event)}>
          <div><h2 className="text-xl font-bold">Edit customer details</h2><p className="mt-1 muted">The linked user ID and existing status remain unchanged. Bank-core validates all submitted fields.</p></div>
          <StaffCustomerRecordFields value={fields} onChange={updateField} prefix="edit-customer" />
          {saveError && <p className="error-box" role="alert">{saveError}</p>}
          <div className="flex flex-wrap gap-3"><button className="button" disabled={pending}>{pending ? "Saving…" : "Save customer details"}</button><button type="button" className="button ghost" disabled={pending} onClick={cancelEdit}>Cancel</button></div>
        </form>}
        {notice && <p className="success-box" role="status">{notice}</p>}
        {!editing && saveError && <p className="error-box" role="alert">{saveError}</p>}
        {role === "ADMIN" && <StaffCustomerDeletion key={customerId} customerId={customerId} customer={customer} disabled={editing}
          onReadback={(record) => {
            setLoadedCustomer({ customerId, record });
            setFields(recordFields(record));
            setNotice(undefined);
          }}
          onMissing={(message) => {
            setLoadedCustomer(undefined);
            setFields(undefined);
            setLoadError({ customerId, message });
          }} />}
      </div>}
    </>
  );
}
