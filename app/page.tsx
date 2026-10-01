import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <header className="border-b border-slate-200 bg-white">
        <div className="container flex items-center justify-between py-5">
          <Link href="/" className="text-xl font-black tracking-tight text-teal-800">My Bank</Link>
          <nav aria-label="Public navigation" className="flex items-center gap-3 text-sm font-semibold">
            <Link href="/login" className="button ghost">Sign in</Link>
            <Link href="/register" className="button">Open an account</Link>
          </nav>
        </div>
      </header>
      <section className="container grid flex-1 items-center gap-10 py-16 md:grid-cols-2">
        <div>
          <p className="mb-3 font-bold uppercase tracking-[.2em] text-teal-700">Banking, clearly</p>
          <h1 className="max-w-xl text-4xl font-black leading-tight md:text-6xl">A calm, dependable view of your money.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Manage accounts, review transaction history, and send supported transactions through the authoritative BankingSystem API.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/login" className="button">Sign in securely</Link><Link href="/register" className="button secondary">Create your profile</Link></div>
        </div>
        <div className="card bg-gradient-to-br from-teal-700 to-slate-900 text-white"><p className="text-sm uppercase tracking-[.2em] text-teal-100">Your control center</p><h2 className="mt-4 text-3xl font-black">Balances and receipts from the server of record.</h2><p className="mt-4 text-teal-50">The web app never calculates or stores financial state as its own source of truth.</p></div>
      </section>
      <footer className="container border-t border-slate-200 py-5 text-sm text-slate-500">BankingSystem remains the authority for authentication, balances, and transaction rules.</footer>
    </main>
  );
}
