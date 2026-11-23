import { FinancialForm } from "./FinancialForm";
import { SectionHeading } from "@/components/layout/ProtectedLayout";

export function FinancialPage({ kind, title }: { kind: "deposit" | "withdraw"; title: string }) { return <><SectionHeading eyebrow="Customer transaction" title={title} /><FinancialForm kind={kind} /></>; }
