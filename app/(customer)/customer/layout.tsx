import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
export default function CustomerLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <ProtectedLayout roles={["CUSTOMER"]}>{children}</ProtectedLayout>; }
