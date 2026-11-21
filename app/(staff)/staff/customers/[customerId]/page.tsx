import { AuthGuard } from "@/components/auth/AuthGuard";
import { StaffCustomerDetail } from "@/components/banking/StaffCustomerDetail";
import { PAGE_ROLES } from "@/lib/auth/navigation";

export default async function StaffCustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return <AuthGuard roles={PAGE_ROLES.staff}><StaffCustomerDetail customerId={customerId} /></AuthGuard>;
}
