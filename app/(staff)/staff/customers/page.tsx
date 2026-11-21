import { AuthGuard } from "@/components/auth/AuthGuard";
import { StaffCustomerDirectory } from "@/components/banking/StaffCustomerDirectory";
import { PAGE_ROLES } from "@/lib/auth/navigation";

export default function StaffCustomersPage() {
  return <AuthGuard roles={PAGE_ROLES.staff}><StaffCustomerDirectory /></AuthGuard>;
}
