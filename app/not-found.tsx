import Link from "next/link";

export default function NotFound() {
  return <main className="container py-24"><div className="card max-w-xl"><p className="font-bold text-teal-700">404</p><h1 className="mt-2 text-3xl font-black">That page is not available.</h1><p className="mt-3 muted">The requested route is not part of the supported banking experience.</p><Link className="button mt-6" href="/">Return home</Link></div></main>;
}
