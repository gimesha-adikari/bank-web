import { describe, expect, it } from "vitest";
import { allowsRole, loginDestination, PAGE_ROLES } from "@/lib/auth/navigation";

describe("staff customer directory access", () => {
  it.each(["ADMIN", "MANAGER", "TELLER"] as const)("allows %s on shared customer record routes", (role) => {
    expect(allowsRole(role, PAGE_ROLES.staff)).toBe(true);
    expect(loginDestination(role, "/staff/customers")).toBe("/staff/customers");
    expect(loginDestination(role, "/staff/customers/new")).toBe("/staff/customers/new");
    expect(loginDestination(role, "/staff/customers/customer-1")).toBe("/staff/customers/customer-1");
  });

  it.each(["CUSTOMER", "EMPLOYEE", "BANNED"] as const)("does not return %s to staff customer routes", (role) => {
    expect(loginDestination(role, "/staff/customers")).not.toMatch(/^\/staff\/customers/);
    expect(loginDestination(role, "/staff/customers/new")).not.toMatch(/^\/staff\/customers/);
    expect(loginDestination(role, "/staff/customers/customer-1")).not.toMatch(/^\/staff\/customers/);
  });
});
