import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { PAGE_ROLES } from "@/lib/auth/navigation";
export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <ProtectedLayout roles={PAGE_ROLES.admin}>{children}</ProtectedLayout>; }
