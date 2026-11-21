import { AuthGuard } from "@/components/auth/AuthGuard";
import { StaffCustomerCreate } from "@/components/banking/StaffCustomerCreate";
import { PAGE_ROLES } from "@/lib/auth/navigation";

export default function NewStaffCustomerPage() {
  return <AuthGuard roles={PAGE_ROLES.staff}><StaffCustomerCreate /></AuthGuard>;
}
