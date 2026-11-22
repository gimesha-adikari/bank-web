import { AuthGuard } from "@/components/auth/AuthGuard";
import { ManagerTellerDirectory } from "@/components/banking/ManagerTellerDirectory";
import { PAGE_ROLES } from "@/lib/auth/navigation";

export default function ManagerTellersPage() {
  return <AuthGuard roles={PAGE_ROLES.manager}><ManagerTellerDirectory /></AuthGuard>;
}
