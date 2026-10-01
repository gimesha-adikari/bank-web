import { StaffAccountForm } from "@/components/banking/StaffAccountForm";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { AuthGuard } from "@/components/auth/AuthGuard";
export default function StaffAccountPage() { return <AuthGuard roles={["TELLER"]}><SectionHeading eyebrow="Staff flow" title="Open an account" /><StaffAccountForm /></AuthGuard>; }
