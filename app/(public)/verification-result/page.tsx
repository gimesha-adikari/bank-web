import type { Metadata } from "next";
import Link from "next/link";
import { ResendVerificationForm } from "@/components/auth/ResendVerificationForm";

export const metadata: Metadata = { title: "Email verification | My Bank", referrer: "no-referrer" };

type SearchParams = Promise<{ flow?: string | string[]; status?: string | string[] }>;

export default async function VerificationResultPage({ searchParams }: { searchParams: SearchParams }) {
  const { flow, status } = await searchParams;
  const emailChange = flow === "email-change";
  const knownFlow = emailChange || flow === "registration";
  const verified = knownFlow && status === "verified";
  let heading = "Email verification";
  let message = "Open the verification link from your email.";

  if (verified) {
    heading = emailChange ? "Email address updated" : "Email verified";
    message = emailChange
      ? "Refresh your profile to see the new address. If your session has ended, sign in again."
      : "Your email has been verified. You can now sign in to your profile.";
  } else if (knownFlow && status === "invalid") {
    heading = "Verification link is invalid or expired";
    message = emailChange
      ? "If you already used the link, check the address in your profile. Otherwise, sign in to request another email change."
      : "If you already used the link, try signing in. You can also request a new verification email below.";
  } else if (knownFlow && status === "conflict") {
    heading = "Email address could not be updated";
    message = "Return to your profile to request a new email change.";
  } else if (knownFlow && status === "unavailable") {
    heading = "Verification could not be confirmed";
    message = emailChange
      ? "Check your profile first. If the address hasn’t changed, open the link from your email again later."
      : "Try signing in first. If verification is still required, reopen the link from your email later or request a new one.";
  }

  const showResend = flow === "registration" && !verified;
  return (
    <main className="shell">
      <div className="container grid flex-1 items-center py-12">
        <div className="mx-auto grid w-full max-w-lg gap-4">
          <section className="card grid gap-4">
            <h1 className="text-3xl font-black">{heading}</h1>
            <p className={verified ? "success-box" : knownFlow && status ? "error-box" : "muted"}>{message}</p>
            <div className="flex flex-wrap gap-3">
              {emailChange && <Link href="/customer/profile" className="button">Open profile</Link>}
              <Link href="/login" className={emailChange ? "button secondary" : "button"}>Sign in</Link>
            </div>
          </section>
          {showResend && <ResendVerificationForm />}
        </div>
      </div>
    </main>
  );
}
