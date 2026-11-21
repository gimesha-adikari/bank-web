import type { Role } from "@/lib/api/contracts";

export const PAGE_ROLES = {
  customer: ["CUSTOMER"],
  staff: ["ADMIN", "MANAGER", "TELLER"],
  admin: ["ADMIN"],
  teller: ["TELLER"]
} as const;

export const TELLER_ACCOUNT_OPENING = "/staff/accounts/new";
export const CUSTOMER_ONBOARDING = "/customer/onboarding";

const pageRoles = new Map<string, readonly Role[]>([
  ["/customer", PAGE_ROLES.customer],
  [CUSTOMER_ONBOARDING, PAGE_ROLES.customer],
  ["/customer/accounts", PAGE_ROLES.customer],
  ["/customer/profile", PAGE_ROLES.customer],
  ["/customer/transactions/deposit", PAGE_ROLES.customer],
  ["/customer/transactions/withdraw", PAGE_ROLES.customer],
  ["/customer/transactions/transfer", PAGE_ROLES.customer],
  ["/staff", PAGE_ROLES.staff],
  [TELLER_ACCOUNT_OPENING, PAGE_ROLES.teller],
  ["/admin", PAGE_ROLES.admin]
]);

const historyPages = [
  { path: /^\/customer\/accounts\/[\w-]+\/transactions$/, roles: PAGE_ROLES.customer },
  { path: /^\/staff\/accounts\/[\w-]+\/transactions$/, roles: PAGE_ROLES.staff }
];

const legacyPaths = new Map([
  ["/customer/home", "/customer"],
  ["/admin/home", "/admin"],
  ["/accounts/new", TELLER_ACCOUNT_OPENING],
  ["/teller/home", TELLER_ACCOUNT_OPENING]
]);

export function allowsRole(role: Role | null, roles: readonly Role[]): boolean {
  return role !== null && roles.includes(role);
}

export function roleHome(role: Role | null): string {
  switch (role) {
    case "CUSTOMER": return "/customer";
    case "ADMIN": return "/admin";
    case "MANAGER":
    case "TELLER": return "/staff";
    case "EMPLOYEE":
    case "BANNED":
    default: return "/unauthorized";
  }
}

export function loginDestination(role: Role, returnTo?: string | null): string {
  const requestedPath = returnTo?.split(/[?#]/, 1)[0];
  if (!requestedPath) return roleHome(role);

  const path = legacyPaths.get(requestedPath) ?? requestedPath;
  const roles = pageRoles.get(path) ?? historyPages.find((page) => page.path.test(path))?.roles;
  return roles && allowsRole(role, roles) ? path : roleHome(role);
}
