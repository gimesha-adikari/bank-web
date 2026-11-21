"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { ResendVerificationForm } from "./ResendVerificationForm";

const emptyForm = { username: "", email: "", password: "", firstName: "", lastName: "" };
const fields = [
  { key: "firstName", label: "First name", type: "text", autoComplete: "given-name", required: false },
  { key: "lastName", label: "Last name", type: "text", autoComplete: "family-name", required: false },
  { key: "username", label: "Username", type: "text", autoComplete: "username", required: true },
  { key: "email", label: "Email", type: "email", autoComplete: "email", required: true },
  { key: "password", label: "Password", type: "password", autoComplete: "new-password", required: true }
] as const;

export function RegisterForm() {
  const inFlight = useRef(false);
  const [form, setForm] = useState(emptyForm);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [availability, setAvailability] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function checkUsername() {
    const username = form.username.trim();
    if (username.length < 3) {
      setAvailability(null);
      return;
    }
    try {
      await authApi.usernameAvailable(username);
      setAvailability("Username is available.");
    } catch (failure) {
      setAvailability(failure instanceof ApiError ? failure.message : "Username availability could not be checked.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const email = form.email.trim();
    try {
      await authApi.register({ ...form, email });
      setForm(emptyForm);
      setRegisteredEmail(email);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure : new ApiError({ kind: "network", message: "Registration could not be completed." }));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (registeredEmail) {
    return (
      <div className="grid gap-4">
        <section className="card grid gap-4">
          <h2 className="text-xl font-black">Verify your email</h2>
          <p className="success-box" role="status">Your profile was created. Check your inbox and verify your email before you can sign in.</p>
          <Link href="/login" className="text-sm font-bold text-teal-700">Sign in after verification</Link>
        </section>
        <ResendVerificationForm initialEmail={registeredEmail} />
      </div>
    );
  }

  return (
    <form className="card grid gap-4" method="post" onSubmit={submit}>
      {fields.map(({ key, label, type, autoComplete, required }) => (
        <div className="field" key={key}>
          <label htmlFor={key}>{label}</label>
          <input id={key} type={type} autoComplete={autoComplete} value={form[key]} disabled={pending} required={required}
            onBlur={key === "username" ? () => void checkUsername() : undefined}
            onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
          {key === "username" && availability && <small role="status">{availability}</small>}
        </div>
      ))}
      {error && <div className="error-box" role="alert">
        {error.message}
        {error.fieldErrors && <ul className="mt-2 list-disc pl-5">{Object.entries(error.fieldErrors).map(([field, message]) => <li key={field}>{field}: {message}</li>)}</ul>}
      </div>}
      <button className="button" type="submit" disabled={pending}>{pending ? "Submitting…" : "Create profile"}</button>
      <Link href="/login" className="text-center text-sm font-bold text-teal-700">Already have an account? Sign in</Link>
    </form>
  );
}
