import type { Account } from "@/lib/api/contracts";
import { formatMoney } from "@/lib/finance/money";
import Link from "next/link";

export function AccountSummary({ account }: { account: Account }) { return <article className="card flex flex-col justify-between gap-5"><div><p className="text-sm font-bold uppercase tracking-[.12em] text-teal-700">{account.accountType}</p><h2 className="mt-2 text-xl font-black">{account.accountNumber}</h2><p className="mt-1 text-sm muted">Status: {account.accountStatus}</p></div><div><p className="text-3xl font-black">{formatMoney(account.balance)}</p><Link href={`/customer/accounts/${encodeURIComponent(account.accountId)}/transactions`} className="mt-4 inline-block text-sm font-bold text-teal-700">View transaction history →</Link></div></article>; }
