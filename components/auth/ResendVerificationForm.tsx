"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";

export function ResendVerificationForm({ initialEmail = "" }: { initialEmail?: string }) {
  const emailId = useId();
  const errorId = useId();
  const inFlight = useRef(false);
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    setSent(false);
    try {
      await authApi.resendVerification({ email: email.trim() });
      setSent(true);
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : 0;
      if (status === 400 || status === 422) setError("Enter a valid email address.");
      else if (status === 429) setError("Too many requests. Wait a few minutes and try again.");
      else setError("We could not send a verification email right now. Please try again.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <form className="card grid gap-4" method="post" onSubmit={submit}>
      <h2 className="text-xl font-black">Request a new verification email</h2>
      <div className="field">
        <label htmlFor={emailId}>Email address</label>
        <input id={emailId} name="email" type="email" autoComplete="email" value={email}
          onChange={(event) => setEmail(event.target.value)} disabled={pending}
          aria-describedby={error ? errorId : undefined} required />
      </div>
      {error && <p id={errorId} className="error-box" role="alert">{error}</p>}
      {sent && <p className="success-box" role="status">If verification is needed for that address, a verification email will be sent.</p>}
      <button className="button" type="submit" disabled={pending}>{pending ? "Sending…" : "Resend verification email"}</button>
    </form>
  );
}
