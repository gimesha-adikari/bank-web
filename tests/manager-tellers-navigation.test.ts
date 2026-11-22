import { describe, expect, it } from "vitest";
import { allowsRole, loginDestination, PAGE_ROLES } from "@/lib/auth/navigation";

describe("manager Teller lifecycle access", () => {
  it("permits only MANAGER to resume the Teller directory route", () => {
    expect(PAGE_ROLES.manager).toEqual(["MANAGER"]);
    expect(allowsRole("MANAGER", PAGE_ROLES.manager)).toBe(true);
    expect(loginDestination("MANAGER", "/staff/tellers")).toBe("/staff/tellers");
  });

  it.each(["ADMIN", "TELLER", "CUSTOMER", "EMPLOYEE", "BANNED"] as const)(
    "does not direct %s to Manager Teller operations",
    (role) => {
      expect(allowsRole(role, PAGE_ROLES.manager)).toBe(false);
      expect(loginDestination(role, "/staff/tellers")).not.toBe("/staff/tellers");
    }
  );
});
