import { expect, test } from "@playwright/test";

test("public boot and sign-in route render", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A calm, dependable view of your money." })).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).first().click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("real BFF login establishes HttpOnly auth, reloads, and preserves financial idempotency", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("customer");
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/customer$/);
  await expect(page.getByRole("heading", { name: /Welcome, customer/ })).toBeVisible();
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }))).toEqual({ local: 0, session: 0, cookies: "" });
  await page.reload();
  await expect(page.getByText("100.0000 LKR")).toBeVisible();
  await page.getByRole("link", { name: "Deposit" }).click();
  await page.getByLabel("Amount (decimal text)").fill("10.00");
  await page.getByRole("button", { name: "Submit transaction" }).click();
  await expect(page.getByTestId("transaction-receipt")).toContainText("JR-1");
});

test("customer role guard remains a UX guard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("customer");
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/customer$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/unauthorized/);
  await expect(page.getByRole("heading", { name: /do not have access/i })).toBeVisible();
});

test("terminal authenticated 401 clears the browser session and returns to login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("customer");
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/customer$/);
  const status = await page.evaluate(async () => (await fetch("/api/v1/expired")).status);
  expect(status).toBe(401);
  await page.reload();
  await expect(page).toHaveURL(/login/);
  expect(await page.evaluate(() => document.cookie)).toBe("");
});

test("logout uses the BFF lifecycle and clears the session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("customer");
  await page.getByLabel("Password").fill("secret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/customer$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/login/);
  expect(await page.evaluate(() => document.cookie)).toBe("");
});
