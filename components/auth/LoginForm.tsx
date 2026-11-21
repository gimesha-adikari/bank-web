"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "./AuthProvider";
import { ApiError } from "@/lib/api/errors";

export function LoginForm() {
  const { signIn } = useAuth();
  const search = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setPending(true);
    try { await signIn({ username: username.trim(), password }, search.get("returnTo")); }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "Sign in could not be completed."); }
    finally { setPending(false); }
  }
  return <form className="card grid gap-5" onSubmit={submit} aria-describedby={error ? "login-error" : undefined}><div className="field"><label htmlFor="username">Username</label><input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></div><div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>{error && <div id="login-error" className="error-box" role="alert">{error}</div>}<button className="button" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button><div className="flex flex-wrap justify-between gap-3 text-sm"><Link href="/register" className="font-bold text-teal-700">Create profile</Link><Link href="/reset-password" className="font-bold text-teal-700">Forgot password?</Link><Link href="/verification-result?flow=registration" className="font-bold text-teal-700">Resend verification</Link></div></form>;
}
