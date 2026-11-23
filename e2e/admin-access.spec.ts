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
  await expect(page.getByRole("region", { name: "Confirm role change" }).getByText(/revokes the user’s existing sessions and the user must sign in again/i)).toBeVisible();
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

test("Admin reassigns an inactive unlinked former Teller with a reviewed role request", async ({ page, browser, baseURL }) => {
  const formerTeller = await browser.newPage({ baseURL });
  await signIn(formerTeller, "former.teller", "/customer");
  await expect(formerTeller).toHaveURL(/\/customer(?:\/|$)/);
  const managerAccess = () => formerTeller.evaluate(async () => {
    const response = await fetch("/api/v1/tellers");
    return { status: response.status, expired: response.headers.get("X-Bank-Auth-Expired") };
  });
  expect(await managerAccess()).toEqual({ status: 403, expired: null });

  await signIn(page, "admin-access-role-change");
  await page.getByRole("button", { name: "View former.teller account" }).click();
  const detail = page.getByRole("region", { name: "User account details" });
  await expect(detail.getByText("CUSTOMER", { exact: true })).toBeVisible();
  const editor = page.getByRole("button", { name: "Change role and employee access" });
  await expect(editor).toBeEnabled({ timeout: 5_000 });
  await editor.click();
  await page.getByLabel("Target role").selectOption("TELLER");
  await page.getByLabel("Employee status").selectOption("ACTIVE");
  await page.getByLabel("Gender").selectOption("OTHER");
  await page.getByLabel("Date of birth").fill("1990-01-02");
  await page.getByLabel("Phone").fill("0712345000");
  await page.getByLabel("Address").fill("4 Teller Street");
  await page.getByLabel("Department").fill("Branch Operations");
  const manager = page.getByLabel("Manager employee UUID");
  const managerOption = manager.getByRole("option", { name: /Lee Manager/ });
  await expect(managerOption).toHaveCount(1);
  await manager.selectOption(await managerOption.getAttribute("value") ?? "");
  await page.getByRole("button", { name: "Review role change" }).click();
  await expect(page.getByText("Confirm CUSTOMER → TELLER", { exact: true })).toBeVisible();
  const evidence = async () => (await page.request.get("http://127.0.0.1:38080/test/requests")).json() as Promise<{
    adminAccessMutations: { path: string; method: string; body: Record<string, unknown> }[];
    ids: { former: string; managerEmployee: string };
  }>;
  const snapshot = await evidence();
  const path = `/api/v1/access-control/roles/${snapshot.ids.former}`;
  expect(snapshot.adminAccessMutations.filter((item) => item.path === path)).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm role change" }).click();
  await expect(page.getByRole("status")).toContainText(/bank-core confirmed the role change/i);
  await expect(detail.getByText("TELLER", { exact: true })).toBeVisible();
  await expect(detail.getByText("Linked employee record")).toBeVisible();
  expect((await evidence()).adminAccessMutations.filter((item) => item.path === path)).toMatchObject([{
    path, method: "PUT", body: {
      firstName: "Robin", lastName: "Former", email: "former.teller@example.test", roleName: "TELLER",
      status: "ACTIVE", gender: "OTHER", dateOfBirth: "1990-01-02", phone: "0712345000",
      address: "4 Teller Street", department: "Branch Operations", managerId: snapshot.ids.managerEmployee
    }
  }]);
  expect(await managerAccess()).toEqual({ status: 401, expired: "1" });
  await signIn(formerTeller, "former.teller", "/staff/accounts");
  await expect(formerTeller).toHaveURL(/\/staff\/accounts$/);
  expect(await managerAccess()).toEqual({ status: 403, expired: null });
  await formerTeller.close();
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
  await expect(page.getByText(/login active flag is read-only here/i)).toBeVisible();
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
