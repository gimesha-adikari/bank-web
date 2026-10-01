import { AppFooter, AppHeader } from "./AppHeader";
import { AuthGuard } from "@/components/auth/AuthGuard";
import type { Role } from "@/lib/api/contracts";

export function ProtectedLayout({ children, roles }: Readonly<{ children: React.ReactNode; roles?: Role[] }>) {
  return <AuthGuard roles={roles}><div className="shell"><AppHeader /><main className="container flex-1 py-8">{children}</main><AppFooter /></div></AuthGuard>;
}
export function SectionHeading({ eyebrow, title, children }: Readonly<{ eyebrow?: string; title: string; children?: React.ReactNode }>) { return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div>{eyebrow && <p className="mb-1 text-sm font-bold uppercase tracking-[.16em] text-teal-700">{eyebrow}</p>}<h1 className="text-3xl font-black">{title}</h1></div>{children}</div>; }
