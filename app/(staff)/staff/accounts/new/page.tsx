import { StaffAccountForm } from "@/components/banking/StaffAccountForm";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { PAGE_ROLES } from "@/lib/auth/navigation";
export default function StaffAccountPage() { return <AuthGuard roles={PAGE_ROLES.teller}><SectionHeading eyebrow="Staff flow" title="Open an account" /><StaffAccountForm /></AuthGuard>; }
