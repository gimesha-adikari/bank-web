"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Customer, CustomerGender, CustomerRecordRequest, UserProfile } from "@/lib/api/contracts";
import { customersApi } from "@/lib/api/customers";
import { ApiError } from "@/lib/api/errors";
import { usersApi } from "@/lib/api/users";

const genders: { value: CustomerGender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" }
];
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

export function CustomerRecordForm({ record, disabled, onRecord, onSavingChange }: {
  record: Customer | null;
  disabled: boolean;
  onRecord: (record: Customer) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const inFlight = useRef(false);
  const [profile, setProfile] = useState<UserProfile>();
  const [profileError, setProfileError] = useState(false);
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [warning, setWarning] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void usersApi.me().then((identity) => {
      if (!identity?.userId || !uuid.test(identity.userId)) throw new Error("Missing authenticated user ID");
      if (active) setProfile(identity);
    }).catch(() => {
      if (active) setProfileError(true);
    });
    return () => { active = false; };
  }, [profileAttempt]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || inFlight.current || disabled) return;
    setError(undefined);
    setWarning(undefined);
    setSaved(false);
    setFieldErrors({});
    const fields = new FormData(event.currentTarget);
    const read = (name: string) => String(fields.get(name) ?? "").trim();
    const firstName = read("firstName");
    const lastName = read("lastName");
    const email = read("email");
    const phone = read("phone");
    const address = read("address");
    const dateOfBirth = read("dateOfBirth");
    const gender = genders.find(({ value }) => value === read("gender"))?.value;
    if (!firstName || !lastName || !email || !phone || !dateOfBirth || !gender) {
      setFieldErrors({
        ...(!firstName && { firstName: "Enter your first name." }),
        ...(!lastName && { lastName: "Enter your last name." }),
        ...(!email && { email: "Enter your contact email." }),
        ...(!phone && { phone: "Enter your phone number." }),
        ...(!dateOfBirth && { dateOfBirth: "Enter your date of birth." }),
        ...(!gender && { gender: "Choose a gender." })
      });
      return;
    }
    const request: CustomerRecordRequest = {
      userId: profile.userId, firstName, lastName, gender, email, phone, address, dateOfBirth,
      status: record?.status ?? "ACTIVE"
    };

    inFlight.current = true;
    setSaving(true);
    onSavingChange(true);
    try {
      const savedRecord = await customersApi.save(request);
      if (!savedRecord?.customerId || savedRecord.userId !== profile.userId) throw new Error("Unconfirmed customer record");
      onRecord(savedRecord);
      setSaved(true);
      try {
        const refreshed = await customersApi.me();
        if (!refreshed || refreshed.userId !== profile.userId) throw new Error("Unable to reload customer record");
        onRecord(refreshed);
      } catch {
        setWarning("Bank-core saved your details. The record could not be reloaded. Use Refresh status to check it again.");
      }
    } catch (failure) {
      if (failure instanceof ApiError && failure.fieldErrors) setFieldErrors(failure.fieldErrors);
      const status = failure instanceof ApiError ? failure.status : 0;
      if (status === 409) setError("Bank-core could not save your details. Refresh status to check whether your verification is still approved.");
      else if (status === 403) setError("You are not allowed to update these customer details.");
      else if (status === 400 || status === 422) setError("Review your customer details and try again.");
      else setError("The save could not be confirmed. Refresh status to check your customer record.");
    } finally {
      inFlight.current = false;
      setSaving(false);
      onSavingChange(false);
    }
  }

  const fields = [
    { name: "firstName", label: "First name", value: record?.firstName ?? profile?.firstName, autoComplete: "given-name" },
    { name: "lastName", label: "Last name", value: record?.lastName ?? profile?.lastName, autoComplete: "family-name" },
    { name: "email", label: "Contact email", value: record?.email ?? profile?.email, type: "email", autoComplete: "email" },
    { name: "phone", label: "Phone", value: record?.phone ?? profile?.mobileNumber, type: "tel", autoComplete: "tel" },
    { name: "dateOfBirth", label: "Date of birth", value: record?.dateOfBirth, type: "date", autoComplete: "bday" },
    { name: "address", label: "Address (optional)", value: record?.address ?? profile?.address, autoComplete: "street-address" }
  ];
  return (
    <section className="card grid gap-4">
      <h2 className="text-xl font-black">Customer details</h2>
      {profileError && <div className="grid gap-3">
        <p className="error-box" role="alert">Your signed-in profile could not be loaded. Your details cannot be saved until it is available.</p>
        <button type="button" className="button secondary w-fit" onClick={() => {
          setProfileError(false);
          setProfileAttempt((attempt) => attempt + 1);
        }}>Reload profile</button>
      </div>}
      {!profile && !profileError && <p role="status" className="muted">Loading your profile…</p>}
      {profile && <form method="post" className="grid gap-4" onSubmit={(event) => void save(event)} key={record?.updatedAt ?? record?.customerId}>
        <fieldset className="grid gap-4 sm:grid-cols-2" disabled={disabled || saving}>
          {fields.map(({ name, label, value, type, autoComplete }) => <div className="field" key={name}>
            <label htmlFor={`customer-${name}`}>{label}</label>
            <input id={`customer-${name}`} name={name} defaultValue={value ?? ""} type={type ?? "text"}
              autoComplete={autoComplete} required={name !== "address"} aria-invalid={Boolean(fieldErrors[name])}
              aria-describedby={fieldErrors[name] ? `customer-${name}-error` : undefined} />
            {fieldErrors[name] && <p id={`customer-${name}-error`} className="text-sm text-red-800" role="alert">{fieldErrors[name]}</p>}
          </div>)}
          <div className="field">
            <label htmlFor="customer-gender">Gender</label>
            <select id="customer-gender" name="gender" defaultValue={record?.gender ?? ""} required
              aria-invalid={Boolean(fieldErrors.gender)} aria-describedby={fieldErrors.gender ? "customer-gender-error" : undefined}>
              <option value="" disabled>Choose an option</option>
              {genders.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
            {fieldErrors.gender && <p id="customer-gender-error" className="text-sm text-red-800" role="alert">{fieldErrors.gender}</p>}
          </div>
        </fieldset>
        {error && <p className="error-box" role="alert">{error}</p>}
        {warning && <p className="error-box" role="alert">{warning}</p>}
        {saved && <p className="success-box" role="status">Customer details saved.</p>}
        <button type="submit" className="button w-fit" disabled={disabled || saving}>{saving ? "Saving…" : "Save customer details"}</button>
      </form>}
    </section>
  );
}
