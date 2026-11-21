"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export function ResetPasswordView() {
  const token = useSearchParams().get("token");
  return token ? <ResetPasswordForm key={token} token={token} /> : <ForgotPasswordForm />;
}

function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (password !== confirm) {
      setError("Passwords must match.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      setPassword("");
      setConfirm("");
      setSucceeded(true);
    } catch (failure) {
      setError(failure instanceof ApiError && failure.code === "ERR_VALIDATION"
        ? "Check your new password and try again. Use at least 8 characters, including an uppercase letter, a number, and a special character."
        : "We couldn't reset your password. If your link is invalid, expired, or already used, request a new link.");
    } finally {
      setPending(false);
    }
  }

  if (succeeded) {
    return <div className="card grid gap-5">
      <div className="success-box" role="status">Password reset successfully.</div>
      <Link href="/login" className="button">Sign in with your new password</Link>
    </div>;
  }

  return <form className="card grid gap-5" onSubmit={submit}>
    <div className="field">
      <label htmlFor="new-password">New password</label>
      <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={pending} />
    </div>
    <div className="field">
      <label htmlFor="confirm-password">Confirm new password</label>
      <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required disabled={pending} />
    </div>
    {error && <div className="error-box" role="alert">{error}</div>}
    <button className="button" type="submit" disabled={pending}>{pending ? "Resetting…" : "Reset password"}</button>
    <Link href="/reset-password" className="text-center text-sm font-bold text-teal-700">Request a new link</Link>
    <Link href="/login" className="text-center text-sm font-bold text-teal-700">Back to sign in</Link>
  </form>;
}
