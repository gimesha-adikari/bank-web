import { describe, expect, it } from "vitest";
import { allowsRole, loginDestination, PAGE_ROLES } from "@/lib/auth/navigation";

describe("Admin access management route", () => {
  it("allows only Admin login returns to the user access directory", () => {
    expect(allowsRole("ADMIN", PAGE_ROLES.admin)).toBe(true);
    expect(loginDestination("ADMIN", "/admin/users")).toBe("/admin/users");
  });

  it.each(["CUSTOMER", "MANAGER", "TELLER", "EMPLOYEE", "BANNED"] as const)(
    "does not direct %s into Admin access management",
    (role) => {
      expect(loginDestination(role, "/admin/users")).not.toBe("/admin/users");
    }
  );
});
