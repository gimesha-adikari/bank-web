import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, username: string, path = "/admin/users") {
  await page.context().clearCookies();
  const bootstrap = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/auth/validate-token");
  await page.goto(`/login?returnTo=${encodeURIComponent(path)}`);
  await bootstrap;
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("Admin can resume the guarded user access directory", async ({ page }) => {
  await signIn(page, "admin-access-directory");
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("heading", { name: "User and access management" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Users & access" })).toHaveAttribute("href", "/admin/users");
});

test("Admin browses user and employee records without conflating their identifiers", async ({ page }) => {
  await signIn(page, "admin-access-directory");
  await expect(page.getByText("alex.customer@example.test")).toBeVisible();
  await page.getByLabel("Search users").fill("Alex");
  await expect(page.getByRole("button", { name: "View alex.customer account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View teller.jordan account" })).toHaveCount(0);
  await page.getByRole("button", { name: "View alex.customer account" }).click();
  await expect(page.getByText(/Customer record UUID is not returned by the Admin user directory/i)).toBeVisible();
  await expect(page.getByText(/User UUID/)).toBeVisible();

  await page.getByRole("tab", { name: "Employees" }).click();
  await expect(page.getByText("Jordan Teller")).toBeVisible();
  await page.getByRole("button", { name: /View Jordan Teller employee record/ }).click();
  await expect(page.getByText(/Employee UUID is not returned by this list/i)).toBeVisible();
  await expect(page.getByText(/Linked user UUID/)).toBeVisible();
  await expect(page.getByText(/Manager employee UUID/)).toBeVisible();
});

test("Admin changes a user role only after reviewing the exact request", async ({ page }) => {
  await signIn(page, "admin-access-role-change");
  await page.getByRole("button", { name: "View alex.customer account" }).click();
  await page.getByRole("button", { name: "Change role and employee access" }).click();
  await page.getByLabel("Target role").selectOption("MANAGER");
  await page.getByLabel("Employee status").selectOption("ACTIVE");
  await page.getByLabel("Gender").selectOption("OTHER");
  await page.getByLabel("Date of birth").fill("1991-05-06");
  await page.getByLabel("Phone").fill("0712345678");
  await page.getByLabel("Address").fill("2 Synthetic Road");
  await page.getByLabel("Department").fill("Branch Operations");
  await page.getByRole("button", { name: "Review role change" }).click();
  await expect(page.getByText("Confirm CUSTOMER → MANAGER", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Confirm role change" }).getByText(/existing sessions can keep their earlier role claims/i)).toBeVisible();
  await page.getByRole("button", { name: "Confirm role change" }).click();
  await expect(page.getByRole("status")).toContainText(/bank-core confirmed the role change/i);
  await expect(page.getByRole("region", { name: "User account details" }).getByText("MANAGER", { exact: true })).toBeVisible();

  const evidence = await (await page.request.get("http://127.0.0.1:38080/test/requests")).json() as {
    adminAccessMutations: { actor: string; method: string; path: string; body: Record<string, unknown>; idempotencyKey: string | null }[];
    ids: { alex: string };
  };
  const changes = evidence.adminAccessMutations.filter((entry) => entry.actor === "admin-access-role-change");
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({
    method: "PUT", path: `/api/v1/access-control/roles/${evidence.ids.alex}`, idempotencyKey: null,
    body: {
      firstName: "Alex", lastName: "Customer", email: "alex.customer@example.test", phone: "0712345678",
      address: "2 Synthetic Road", roleName: "MANAGER", department: "Branch Operations",
      status: "ACTIVE", gender: "OTHER", dateOfBirth: "1991-05-06"
    }
  });
});

test("an uncertain persisted role change is reconciled by reads with no automatic resend", async ({ page }) => {
  await signIn(page, "admin-access-timeout");
  await page.getByRole("button", { name: "View timeout.customer account" }).click();
  await page.getByRole("button", { name: "Change role and employee access" }).click();
  await page.getByLabel("Target role").selectOption("TELLER");
  await page.getByLabel("Employee status").selectOption("ACTIVE");
  await page.getByLabel("Gender").selectOption("OTHER");
  await page.getByLabel("Date of birth").fill("1992-08-07");
  await page.getByLabel("Phone").fill("0722222222");
  await page.getByLabel("Address").fill("3 Recovery Road");
  await page.getByRole("button", { name: "Review role change" }).click();
  await page.getByRole("button", { name: "Confirm role change" }).click();
  await expect(page.getByRole("status")).toContainText(/response was interrupted.*authoritative user record now reports teller/i);
  const evidence = await (await page.request.get("http://127.0.0.1:38080/test/requests")).json() as {
    adminAccessMutations: { actor: string; method: string }[];
    adminAccessReads: { method: string; path: string; username: string }[];
  };
  expect(evidence.adminAccessMutations.filter((entry) => entry.actor === "admin-access-timeout")).toHaveLength(1);
  expect(evidence.adminAccessReads.filter((entry) => entry.username === "admin-access-timeout" && entry.path.includes("/access-control/users/")).length).toBeGreaterThanOrEqual(2);
});

test("user login activation is shown read-only because no Admin activation endpoint exists", async ({ page }) => {
  await signIn(page, "admin-access-directory");
  await page.getByRole("button", { name: "View inactive.customer account" }).click();
  await expect(page.locator("dt", { hasText: "Login active" }).locator("..")).toContainText("No");
  await expect(page.getByText(/bank-core has no Admin endpoint to activate or deactivate user logins/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /activate user/i })).toHaveCount(0);
});

for (const username of ["customer", "teller", "manager"]) {
  test(`${username} is denied Admin user access management`, async ({ page }) => {
    await signIn(page, username);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/unauthorized$/);
    await expect(page.getByRole("heading", { name: /do not have access/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users & access" })).toHaveCount(0);
    expect(await page.evaluate(async () => (await fetch("/api/v1/access-control/users")).status)).toBe(403);
  });
}
