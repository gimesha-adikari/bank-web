import { SectionHeading } from "@/components/layout/ProtectedLayout";
import Link from "next/link";

export default function AdminPage() {
  return <>
    <SectionHeading eyebrow="Administrator workspace" title="Banking operations" />
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h2 className="text-xl font-black">KYC review</h2>
        <p className="mt-2 muted">Open the Under review queue to inspect documents and verification checks for cases awaiting an Admin decision.</p>
        <Link className="button mt-5" href="/admin/kyc">Review KYC</Link>
      </div>
      <div className="card">
        <h2 className="text-xl font-black">Users and access</h2>
        <p className="mt-2 muted">Review users, employee assignments and roles returned by bank-core. Login activation is not available through the current Admin API.</p>
        <Link className="button secondary mt-5" href="/admin/users">Manage users and access</Link>
      </div>
    </div>
  </>;
}
