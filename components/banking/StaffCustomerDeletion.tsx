"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Customer } from "@/lib/api/contracts";
import { customersApi } from "@/lib/api/customers";
import { ApiError } from "@/lib/api/errors";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function isMissingCustomer(failure: unknown): boolean {
  return failure instanceof ApiError && failure.status === 404 && failure.code === "ERR_NOT_FOUND";
}

function rejectionMessage(failure: unknown): string | undefined {
  if (!(failure instanceof ApiError) || failure.kind !== "backend") return;
  if (failure.status === 401) return "Your session has expired. Sign in again to continue.";
  if (failure.code === "CSRF_VALIDATION_FAILED") return "The request could not be verified. Open a new confirmation to try again.";
  if (failure.status === 403) return "Bank-core allows only Admins to delete customer records.";
  if (failure.status === 409) return "Bank-core blocked deletion because an account or other dependent records remain.";
  if (failure.status >= 400 && failure.status < 500 && failure.status !== 408) {
    return `Bank-core rejected the deletion. ${failure.message}`;
  }
}

async function readCustomer(customerId: string): Promise<Customer> {
  const record = await customersApi.getStaffCustomer(customerId);
  if (typeof record?.customerId !== "string" || record.customerId.toLowerCase() !== customerId.toLowerCase()
    || typeof record.firstName !== "string" || typeof record.lastName !== "string") {
    throw new ApiError({ kind: "parse", message: "Bank-core did not return the requested customer record." });
  }
  return record;
}

export function StaffCustomerDeletion({ customerId, customer, disabled, onReadback, onMissing }: Readonly<{
  customerId: string;
  customer: Customer;
  disabled: boolean;
  onReadback: (record: Customer) => void;
  onMissing: (message: string) => void;
}>) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const [typedId, setTypedId] = useState("");
  const [pending, setPending] = useState<"checking" | "deleting" | "reconciling">();
  const [outcome, setOutcome] = useState<"absent" | "uncertain" | "confirmed">();
  const [error, setError] = useState<string>();
  const validTarget = UUID.test(customerId) && typeof customer.customerId === "string"
    && customer.customerId.toLowerCase() === customerId.toLowerCase();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function openConfirmation() {
    setTypedId("");
    setError(undefined);
    dialog.current?.showModal();
  }

  async function reconcile() {
    setPending("reconciling");
    try {
      const current = await readCustomer(customerId);
      if (!mounted.current) return;
      onReadback(current);
      setError("The deletion outcome is uncertain. The customer record was still present when bank-core checked it. The original request may still finish.");
    } catch (failure) {
      if (!mounted.current) return;
      if (isMissingCustomer(failure)) {
        setOutcome("absent");
        setError(undefined);
        router.replace("/staff/customers");
      } else {
        setError("The deletion outcome could not be confirmed. Bank-core could not verify the current customer record.");
      }
    }
  }

  async function confirmDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog.current?.open || disabled || !validTarget || typedId !== customer.customerId || outcome || inFlight.current) return;
    inFlight.current = true;
    setPending("checking");
    try {
      let current: Customer;
      try {
        current = await readCustomer(customerId);
      } catch (failure) {
        if (!mounted.current) return;
        if (isMissingCustomer(failure)) {
          onMissing("This customer record is already absent from bank-core.");
        } else {
          setError("Bank-core could not verify the current customer record. Deletion was stopped before submission.");
        }
        return;
      }
      if (!mounted.current) return;
      const fields = Object.keys({ ...customer, ...current }) as (keyof Customer)[];
      if (fields.some((field) => customer[field] !== current[field])) {
        onReadback(current);
        setError("This customer record changed. Review the refreshed details before confirming deletion again.");
        return;
      }

      setPending("deleting");
      try {
        await customersApi.deleteStaffCustomer(customerId);
        if (!mounted.current) return;
        setOutcome("confirmed");
        router.replace("/staff/customers");
      } catch (failure) {
        if (!mounted.current) return;
        if (isMissingCustomer(failure)) {
          onMissing("The customer record was already absent when bank-core received the deletion request.");
          return;
        }
        const message = rejectionMessage(failure);
        if (message) {
          setError(message);
          return;
        }
        setOutcome("uncertain");
        await reconcile();
      }
    } finally {
      inFlight.current = false;
      setPending(undefined);
      dialog.current?.close();
    }
  }

  return <>
    <button type="button" className="button danger w-fit" onClick={openConfirmation} disabled={disabled || !validTarget || Boolean(pending || outcome)}>Delete customer record</button>
    {outcome === "confirmed" && <p className="success-box" role="status">Bank-core confirmed the deletion.</p>}
    {outcome === "absent" && !error && <p className="success-box" role="status">Bank-core confirmed that the customer record is absent.</p>}
    {error && <p className="error-box" role="alert">{error}</p>}
    <dialog ref={dialog} className="card m-auto w-11/12 max-w-lg backdrop:bg-slate-950/50" aria-labelledby="customer-deletion-title"
      onCancel={(event) => { if (inFlight.current) event.preventDefault(); }}>
      <form className="grid gap-4" onSubmit={(event) => void confirmDeletion(event)}>
        <h2 id="customer-deletion-title" className="text-xl font-bold">Delete customer record</h2>
        <p>This permanently deletes the customer record for <strong>{customer.firstName} {customer.lastName}</strong>.</p>
        <p>The linked login remains active if it is currently active. KYC records remain. Any account or dependent record blocks deletion, including a closed account with a zero balance. Financial history is preserved.</p>
        <p className="break-all font-mono text-sm">{customer.customerId}</p>
        <label className="field grid gap-1">
          Type customer UUID to confirm
          <input value={typedId} onChange={(event) => setTypedId(event.target.value)} autoComplete="off" spellCheck={false} disabled={Boolean(pending)} />
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="button danger" disabled={Boolean(pending) || typedId !== customer.customerId}>
            {pending === "deleting" ? "Deleting customer record…" : pending ? "Checking customer record…" : "Confirm customer deletion"}
          </button>
          <button type="button" className="button ghost" disabled={Boolean(pending)} onClick={() => dialog.current?.close()}>Cancel</button>
        </div>
      </form>
    </dialog>
  </>;
}
