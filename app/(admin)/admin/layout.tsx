import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <ProtectedLayout roles={["ADMIN"]}>{children}</ProtectedLayout>; }
