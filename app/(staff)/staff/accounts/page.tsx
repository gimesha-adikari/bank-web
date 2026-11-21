import { AuthGuard } from "@/components/auth/AuthGuard";
import { StaffAccountDirectory } from "@/components/banking/StaffAccountDirectory";
import { PAGE_ROLES } from "@/lib/auth/navigation";

export default function StaffAccountsPage() {
  return <AuthGuard roles={PAGE_ROLES.staff}><StaffAccountDirectory /></AuthGuard>;
}
