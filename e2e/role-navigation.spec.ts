import { expect, test, type Page } from "@playwright/test";

const accountOpening = "/staff/accounts/new";
const staffHistory = "/staff/accounts/account-1/transactions";

async function signIn(page: Page, username: string) {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("Teller can resume guarded account opening and use its staff navigation", async ({ page }) => {
  await page.goto(accountOpening);
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await signIn(page, "teller");
  await expect(page).toHaveURL(/\/staff\/accounts\/new$/);
  await expect(page.getByRole("heading", { name: "Open an account" })).toBeVisible();

  await page.getByRole("link", { name: "My Bank" }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole("link", { name: "Open account", exact: true })).toHaveAttribute("href", accountOpening);
  await expect(page.getByRole("link", { name: "Open an account", exact: true })).toHaveAttribute("href", accountOpening);

  await page.goto(staffHistory);
  await expect(page.getByRole("heading", { name: "100001" })).toBeVisible();
});

for (const { username, home } of [
  { username: "manager", home: "/staff" },
  { username: "admin", home: "/admin" }
]) {
  test(`${username} can use shared staff pages without the Teller account-opening action`, async ({ page }) => {
    await page.goto(`/login?returnTo=${encodeURIComponent(accountOpening)}`);
    await signIn(page, username);
    await expect(page).toHaveURL(new RegExp(`${home}$`));
    if (username === "admin") await page.getByRole("link", { name: "Staff workspace" }).click();
    await expect(page).toHaveURL(/\/staff$/);
    await expect(page.getByRole("heading", { name: "Operational banking" })).toBeVisible();
    await expect(page.locator(`a[href="${accountOpening}"]`)).toHaveCount(0);

    await page.goto(staffHistory);
    await expect(page.getByRole("heading", { name: "100001" })).toBeVisible();

    await page.goto(accountOpening);
    await expect(page).toHaveURL(/\/unauthorized$/);
    await expect(page.getByRole("heading", { name: /do not have access/i })).toBeVisible();
  });
}

for (const username of ["employee", "banned"]) {
  test(`${username} lands on the public denial page and remains outside staff routes`, async ({ page }) => {
    await page.goto("/login?returnTo=%2Fstaff");
    await signIn(page, username);
    await expect(page).toHaveURL(/\/unauthorized$/);
    await expect(page.getByRole("heading", { name: /do not have access/i })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/unauthorized$/);
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/unauthorized$/);
    await expect(page.getByRole("heading", { name: /do not have access/i })).toBeVisible();
  });
}
