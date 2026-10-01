import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
export default function StaffLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <ProtectedLayout roles={["ADMIN", "TELLER", "MANAGER"]}>{children}</ProtectedLayout>; }
