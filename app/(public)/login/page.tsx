import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() { return <main className="shell"><div className="container grid flex-1 items-center py-16"><div className="mx-auto w-full max-w-md"><p className="mb-2 font-bold uppercase tracking-[.16em] text-teal-700">My Bank</p><h1 className="mb-6 text-4xl font-black">Welcome back</h1><Suspense fallback={<div className="card">Loading sign-in…</div>}><LoginForm /></Suspense></div></div></main>; }
