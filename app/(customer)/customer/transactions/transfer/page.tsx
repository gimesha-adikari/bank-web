import { InternalPaymentForm } from "@/components/banking/InternalPaymentForm";
import { SectionHeading } from "@/components/layout/ProtectedLayout";

export default function TransferPage() {
  return <><SectionHeading eyebrow="Customer transaction" title="Transfer funds" /><InternalPaymentForm /></>;
}
