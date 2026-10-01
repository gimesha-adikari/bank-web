"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "./AuthProvider";
import { ApiError } from "@/lib/api/errors";

function safeReturnTo(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) return null;
  const path = value.split(/[?#]/, 1)[0];
  return /^\/(customer|admin|staff)(\/|$)/.test(path) ? path : null;
}

export function LoginForm() {
  const { signIn } = useAuth();
  const search = useSearchParams();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setPending(true);
    try { await signIn({ username: username.trim(), password }); const target = safeReturnTo(search.get("returnTo")); if (target) router.replace(target); }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "Sign in could not be completed."); }
    finally { setPending(false); }
  }
  return <form className="card grid gap-5" onSubmit={submit} aria-describedby={error ? "login-error" : undefined}><div className="field"><label htmlFor="username">Username</label><input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></div><div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>{error && <div id="login-error" className="error-box" role="alert">{error}</div>}<button className="button" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button><div className="flex justify-between gap-3 text-sm"><Link href="/register" className="font-bold text-teal-700">Create profile</Link><Link href="/reset-password" className="font-bold text-teal-700">Forgot password?</Link></div></form>;
}
