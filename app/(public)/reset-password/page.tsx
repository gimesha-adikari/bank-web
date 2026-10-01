import { Suspense } from "react";
import { ResetPasswordView } from "@/components/auth/ResetPasswordView";
export default function ResetPasswordPage() { return <main className="shell"><div className="container grid flex-1 items-center py-16"><div className="mx-auto w-full max-w-md"><h1 className="mb-6 text-4xl font-black">Reset your password</h1><Suspense fallback={<div className="card">Loading reset form…</div>}><ResetPasswordView /></Suspense></div></div></main>; }
