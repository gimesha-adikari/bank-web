"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";

export function ForgotPasswordForm() { const [email, setEmail] = useState(""); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [pending, setPending] = useState(false); async function submit(e: FormEvent) { e.preventDefault(); setPending(true); setError(null); try { await authApi.forgotPassword({ email: email.trim() }); setMessage("If the email is registered, reset instructions have been sent."); } catch (failure) { setError(failure instanceof ApiError ? failure.message : "The reset request could not be completed."); } finally { setPending(false); } } return <form className="card grid gap-5" onSubmit={submit}><div className="field"><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>{error && <div className="error-box" role="alert">{error}</div>}{message && <div className="success-box" role="status">{message}</div>}<button className="button" disabled={pending}>{pending ? "Sending…" : "Send reset instructions"}</button><Link href="/login" className="text-center text-sm font-bold text-teal-700">Back to sign in</Link></form>; }
