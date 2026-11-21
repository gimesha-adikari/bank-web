"use client";

import type { CustomerGender, CustomerRecordRequest } from "@/lib/api/contracts";

export type CustomerEditableFields = Pick<CustomerRecordRequest, "firstName" | "lastName" | "gender" | "email" | "phone" | "address" | "dateOfBirth">;

export function StaffCustomerRecordFields({
  value,
  onChange,
  prefix,
}: Readonly<{
  value: CustomerEditableFields;
  onChange: (field: keyof CustomerEditableFields, next: string) => void;
  prefix: string;
}>) {
  const field = (key: keyof CustomerEditableFields, label: string, type = "text") => (
    <div className="field">
      <label htmlFor={`${prefix}-${key}`}>{label}</label>
      <input id={`${prefix}-${key}`} type={type} value={value[key]} onChange={(event) => onChange(key, event.target.value)} required={key !== "address"} />
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {field("firstName", "First name")}
      {field("lastName", "Last name")}
      <div className="field">
        <label htmlFor={`${prefix}-gender`}>Gender</label>
        <select id={`${prefix}-gender`} value={value.gender} onChange={(event) => onChange("gender", event.target.value as CustomerGender)} required>
          <option value="">Choose a value</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option>
        </select>
      </div>
      {field("email", "Email", "email")}
      {field("phone", "Phone", "tel")}
      {field("dateOfBirth", "Date of birth", "date")}
      <div className="field md:col-span-2">
        <label htmlFor={`${prefix}-address`}>Address</label>
        <textarea id={`${prefix}-address`} value={value.address} onChange={(event) => onChange("address", event.target.value)} rows={3} />
      </div>
    </div>
  );
}
