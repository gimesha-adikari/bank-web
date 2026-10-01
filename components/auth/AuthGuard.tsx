"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import type { Role } from "@/lib/api/contracts";

export function AuthGuard({ children, roles }: Readonly<{ children: React.ReactNode; roles?: Role[] }>) {
  const { status, role } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?returnTo=${encodeURIComponent(pathname || "/")}`);
    else if (status === "authenticated" && roles && role && !roles.includes(role)) router.replace("/unauthorized");
  }, [pathname, role, roles, router, status]);
  if (status === "booting") return <main className="container py-24"><div className="card">Checking your secure session…</div></main>;
  if (status !== "authenticated" || (roles && role && !roles.includes(role))) return null;
  return <>{children}</>;
}
