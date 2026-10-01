"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";

export function RegisterForm() {
  const [form, setForm] = useState({ username: "", email: "", password: "", firstName: "", lastName: "" });
  const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<ApiError | null>(null); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPending(true); setError(null); try { await authApi.register(form); setMessage("Registration submitted. Check your email if verification is required."); } catch (failure) { setError(failure instanceof ApiError ? failure : new ApiError({ kind: "network", message: "Registration could not be completed." })); } finally { setPending(false); } }
  return <form className="card grid gap-4" onSubmit={submit}>{[["firstName", "First name"], ["lastName", "Last name"], ["username", "Username"], ["email", "Email"], ["password", "Password"]].map(([key, label]) => <div className="field" key={key}><label htmlFor={key}>{label}</label><input id={key} type={key === "password" ? "password" : key === "email" ? "email" : "text"} autoComplete={key === "password" ? "new-password" : key} value={form[key as keyof typeof form]} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} required={key !== "firstName" && key !== "lastName"} /></div>)}{error && <div className="error-box" role="alert">{error.message}{error.fieldErrors && <ul className="mt-2 list-disc pl-5">{Object.entries(error.fieldErrors).map(([field, text]) => <li key={field}>{field}: {text}</li>)}</ul>}</div>}{message && <div className="success-box" role="status">{message}</div>}<button className="button" disabled={pending}>{pending ? "Submitting…" : "Create profile"}</button><Link href="/login" className="text-center text-sm font-bold text-teal-700">Already have an account? Sign in</Link></form>;
}
