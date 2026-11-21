import { AuthGuard } from "@/components/auth/AuthGuard";
import { StaffAccountDetail } from "@/components/banking/StaffAccountDetail";
import { PAGE_ROLES } from "@/lib/auth/navigation";

export default async function StaffAccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  return <AuthGuard roles={PAGE_ROLES.staff}><StaffAccountDetail accountId={accountId} /></AuthGuard>;
}
