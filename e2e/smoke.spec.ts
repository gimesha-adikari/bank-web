import { expect, test } from "@playwright/test";

const account = { accountId: "account-1", accountNumber: "100001", accountType: "SAVINGS", accountStatus: "ACTIVE", balance: "100.0000" };

async function mockApi(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/auth/validate-token")) return route.fulfill({ status: 200, json: { username: "customer", role: "CUSTOMER" } });
    if (url.pathname.endsWith("/auth/login")) return route.fulfill({ status: 200, json: { token: "jwt", username: "customer", role: "CUSTOMER" } });
    if (url.pathname.endsWith("/accounts/my")) return route.fulfill({ status: 200, json: [account] });
    if (url.pathname.endsWith("/accounts/account-1")) return route.fulfill({ status: 200, json: account });
    if (url.pathname.endsWith("/transactions") && request.method() === "GET") return route.fulfill({ status: 200, json: [] });
    if (url.pathname.endsWith("/transactions/deposit")) return route.fulfill({ status: 200, json: { operation: "DEPOSIT", journalReference: "JR-1", amount: "10.00", currency: "LKR" } });
    return route.fulfill({ status: 404, json: { code: "NOT_FOUND", message: "Not found" } });
  });
}

test("public boot and sign-in route render", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A calm, dependable view of your money." })).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).first().click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("customer direct navigation, refresh, and financial receipt", async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => window.localStorage.setItem("bank-web.jwt", "jwt"));
  await page.goto("/customer");
  await expect(page.getByRole("heading", { name: /Welcome, customer/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText("100.0000 LKR")).toBeVisible();
  await page.getByRole("link", { name: "Deposit" }).click();
  await page.getByLabel("Amount (decimal text)").fill("10.00");
  await page.getByRole("button", { name: "Submit transaction" }).click();
  await expect(page.getByTestId("transaction-receipt")).toContainText("JR-1");
});

test("customer is denied from admin route by UX guard", async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => window.localStorage.setItem("bank-web.jwt", "jwt"));
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/unauthorized/);
  await expect(page.getByRole("heading", { name: /do not have access/i })).toBeVisible();
});
