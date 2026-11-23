import { InternalPaymentForm } from "@/components/banking/InternalPaymentForm";
import { SectionHeading } from "@/components/layout/ProtectedLayout";

export default function PayPage() {
  return <><SectionHeading eyebrow="Customer banking" title="Pay" /><InternalPaymentForm /></>;
}
