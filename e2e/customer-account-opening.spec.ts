import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const newAccount = "/customer/accounts/new";
const endpoint = "/api/v1/accounts";

async function signIn(page: Page, username: string, path = newAccount) {
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  const response = await page.request.post("/api/v1/auth/login", {
    data: { username, password: "secret" },
    headers: { "X-CSRF-Token": csrf.token }
  });
  expect(response.status()).toBe(200);
  await page.goto(path);
}

async function coreCalls(request: APIRequestContext, method: string, path: string) {
  const { requests } = await (await request.get("http://127.0.0.1:38080/test/requests")).json() as {
    requests: { method: string; path: string }[];
  };
  return requests.filter((entry) => entry.method === method && entry.path === path).length;
}

async function fillOpening(page: Page, type = "SAVINGS", amount = "1000.05") {
  await page.getByLabel("Account type").selectOption(type, { timeout: 15_000 });
  await page.getByLabel("Branch", { exact: true }).selectOption("2147483647");
  await page.getByLabel("Opening deposit (LKR)").fill(amount);
}

test("an approved customer opens an account with the selected branch and can view its history", async ({ page, request }) => {
  await signIn(page, "opening-approved", "/customer");
  await page.getByRole("link", { name: "Open an account", exact: true }).click({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/customer\/accounts\/new$/);
  const type = page.getByLabel("Account type");
  await expect(type.locator("option")).toHaveText(["Savings", "Checking", "Fixed deposit"]);
  await expect(page.getByRole("option", { name: /Harbour Branch.*12 Harbour Road/i })).toBeAttached();
  const before = await coreCalls(request, "POST", endpoint);
  await fillOpening(page, "FIXED_DEPOSIT", "4999.99");
  const submit = page.getByRole("button", { name: "Open account", exact: true });
  await submit.click();
  await expect(page.getByText("The minimum opening deposit is 5000.00 LKR.")).toBeVisible();
  expect(await coreCalls(request, "POST", endpoint)).toBe(before);

  await fillOpening(page);
  const opening = page.waitForRequest((candidate) => new URL(candidate.url()).pathname === endpoint && candidate.method() === "POST");
  await submit.evaluate((button) => {
    const form = (button as HTMLButtonElement).form!;
    form.requestSubmit();
    form.requestSubmit();
  });
  const requestSent = await opening;
  expect(requestSent.postDataJSON()).toEqual({ accountType: "SAVINGS", initialDeposit: "1000.05", branchId: 2147483647 });
  expect(requestSent.headers()["idempotency-key"]).toBeUndefined();
  await expect(page.getByText("Account opened", { exact: true })).toBeVisible();
  await expect(page.getByText("Opening balance", { exact: true }).locator("..")).toContainText("1000.0500 LKR");
  await expect(page.getByText("Current balance", { exact: true })).toBeVisible();
  const response = await requestSent.response();
  const account = await response!.json() as { accountId: string; accountNumber: string };
  await expect(page.getByText(account.accountNumber, { exact: true })).toBeVisible();
  expect(await coreCalls(request, "GET", `${endpoint}/${account.accountId}`)).toBe(1);
  expect(await coreCalls(request, "POST", endpoint)).toBe(before + 1);
  await expect(page.getByRole("link", { name: "Customer dashboard" })).toHaveAttribute("href", "/customer");
  await page.getByRole("link", { name: "View transaction history" }).click();
  await expect(page).toHaveURL(new RegExp(`/customer/accounts/${account.accountId}/transactions$`));
  await expect(page.getByText("Opening deposit", { exact: true })).toBeVisible();
});

test("a timeout after creation reloads accounts without sending a second opening request", async ({ page, request }) => {
  await signIn(page, "opening-timeout");
  await fillOpening(page, "CHECKING", "0.00");
  const before = await coreCalls(request, "POST", endpoint);
  const timeout = page.waitForResponse((response) => response.url().endsWith(endpoint) && response.status() === 504);
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  await timeout;
  await expect(page.getByText(/may already have opened your account/i)).toBeVisible();
  await expect(page.getByText("Account opened", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /view transaction history/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open account", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh my accounts" }).click();
  await expect(page.getByRole("link", { name: /view transaction history/i })).toBeVisible();
  expect(await coreCalls(request, "POST", endpoint)).toBe(before + 1);
});

test("a lost response with no account yet keeps the uncertainty visible", async ({ page, request }) => {
  await signIn(page, "opening-network");
  await fillOpening(page, "CHECKING", "0");
  const before = await coreCalls(request, "POST", endpoint);
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  await expect(page.getByText(/no accounts are currently listed/i)).toBeVisible();
  await expect(page.getByText(/may already have opened your account/i)).toBeVisible();
  expect(await coreCalls(request, "POST", endpoint)).toBe(before + 1);
  await expect(page.getByRole("link", { name: "View my accounts" })).toHaveAttribute("href", "/customer/accounts");
});

test("a backend branch rejection keeps the draft available and offers a fresh branch list", async ({ page }) => {
  await signIn(page, "opening-branch", "/customer/accounts");
  await page.getByRole("link", { name: "Open an account", exact: true }).click({ timeout: 15_000 });
  await fillOpening(page);
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  await expect(page.getByText(/selected branch is no longer available/i)).toBeVisible();
  await expect(page.getByLabel("Opening deposit (LKR)")).toHaveValue("1000.05");
  await page.getByRole("button", { name: "Reload branches" }).click();
  await page.getByLabel("Branch", { exact: true }).selectOption("21");
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  await expect(page.getByText("Account opened", { exact: true })).toBeVisible();
});

for (const { username, message } of [
  { username: "opening-missing", message: /customer record is required/i },
  { username: "opening-pending", message: /complete identity verification/i }
]) {
  test(`${username} follows onboarding from a direct account-opening URL`, async ({ page, request }) => {
    const before = await coreCalls(request, "GET", "/api/v1/branches");
    await signIn(page, username);
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue onboarding" })).toHaveAttribute("href", "/customer/onboarding");
    await expect(page.getByRole("button", { name: "Open account", exact: true })).toHaveCount(0);
    expect(await coreCalls(request, "GET", "/api/v1/branches")).toBe(before);
  });
}

test("a Teller cannot open the customer account-opening page", async ({ page }) => {
  await signIn(page, "teller");
  await expect(page).toHaveURL(/\/unauthorized$/, { timeout: 15_000 });
});

test("branches failing to load leaves a recoverable state without an opening form", async ({ page }) => {
  await signIn(page, "opening-branches-unavailable");
  await expect(page.getByText(/could not load the branches/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload branches" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Open account", exact: true })).toHaveCount(0);
});

test("a record removed after eligibility was checked offers onboarding after the rejection", async ({ page }) => {
  await signIn(page, "opening-record-gone");
  await fillOpening(page);
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  await expect(page.getByText(/customer record is required/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue onboarding" })).toHaveAttribute("href", "/customer/onboarding");
});

for (const { username, message } of [
  { username: "opening-auth", message: /you are not allowed to open this account/i },
  { username: "opening-vault", message: /cannot process funded account openings/i }
]) {
  test(`${username} returns a definitive rejection`, async ({ page, request }) => {
    await signIn(page, username);
    await fillOpening(page);
    const reads = await coreCalls(request, "GET", `${endpoint}/my`);
    await page.getByRole("button", { name: "Open account", exact: true }).click();
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByRole("button", { name: "Open account", exact: true })).toBeEnabled();
    expect(await coreCalls(request, "GET", `${endpoint}/my`)).toBe(reads);
  });
}

test("an expired session follows the existing sign-in guard", async ({ page }) => {
  await signIn(page, "opening-expired");
  await fillOpening(page);
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fcustomer%2Faccounts%2Fnew$/);
});
