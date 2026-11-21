import { describe, expect, it } from "vitest";
import { allowsRole, loginDestination, PAGE_ROLES } from "@/lib/auth/navigation";

describe("Admin KYC review access", () => {
  it("allows Admin login redirects to the guarded review route", () => {
    expect(allowsRole("ADMIN", PAGE_ROLES.admin)).toBe(true);
    expect(loginDestination("ADMIN", "/admin/kyc")).toBe("/admin/kyc");
  });

  it.each(["CUSTOMER", "MANAGER", "TELLER", "EMPLOYEE", "BANNED"] as const)("does not route %s into Admin KYC review", (role) => {
    expect(allowsRole(role, PAGE_ROLES.admin)).toBe(false);
    expect(loginDestination(role, "/admin/kyc")).not.toBe("/admin/kyc");
  });
});
