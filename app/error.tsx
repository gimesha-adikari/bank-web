"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="container py-24"><div className="card max-w-xl"><h1 className="text-3xl font-black">We could not load this page.</h1><p className="mt-3 muted">Your banking data was not changed. Try loading the page again.</p><button className="button mt-6" onClick={() => reset()}>Try again</button></div></main>;
}
