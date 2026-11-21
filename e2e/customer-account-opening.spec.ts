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

async function coreState(request: APIRequestContext) {
  return (await (await request.get("http://127.0.0.1:38080/test/requests")).json()) as {
    requests: { method: string; path: string; idempotencyKey?: string | null }[];
    accountOpeningCreations: Record<string, number>;
  };
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
  const idempotencyKey = requestSent.headers()["idempotency-key"];
  expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  expect(requestSent.headers()["x-idempotency-key"]).toBeUndefined();
  await expect(page.getByText("Account opened", { exact: true })).toBeVisible();
  await expect(page.getByText("Opening balance", { exact: true }).locator("..")).toContainText("1000.0500 LKR");
  await expect(page.getByText("Current balance", { exact: true })).toBeVisible();
  const response = await requestSent.response();
  const account = await response!.json() as { accountId: string; accountNumber: string };
  await expect(page.getByText(account.accountNumber, { exact: true })).toBeVisible();
  expect(await coreCalls(request, "GET", `${endpoint}/${account.accountId}`)).toBe(1);
  expect(await coreCalls(request, "POST", endpoint)).toBe(before + 1);
  const upstreamPosts = (await coreState(request)).requests.filter((entry) => entry.method === "POST" && entry.path === endpoint);
  expect(upstreamPosts.at(-1)?.idempotencyKey).toBe(idempotencyKey);
  await expect(page.getByRole("link", { name: "Customer dashboard" })).toHaveAttribute("href", "/customer");
  await page.getByRole("link", { name: "View transaction history" }).click();
  await expect(page).toHaveURL(new RegExp(`/customer/accounts/${account.accountId}/transactions$`));
  await expect(page.getByText("Opening deposit", { exact: true })).toBeVisible();
});

test("a timeout after creation needs a deliberate same-key retry and replays the original account", async ({ page, request }) => {
  await signIn(page, "opening-timeout");
  await fillOpening(page, "CHECKING", "0.00");
  const before = await coreCalls(request, "POST", endpoint);
  const initialRequestPromise = page.waitForRequest((candidate) => new URL(candidate.url()).pathname === endpoint && candidate.method() === "POST");
  const timeout = page.waitForResponse((response) => response.url().endsWith(endpoint) && response.status() === 504);
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  const initialRequest = await initialRequestPromise;
  await timeout;
  await expect(page.getByText(/may already have opened your account/i)).toBeVisible();
  await expect(page.getByText("Account opened", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /view transaction history/i })).toBeVisible();
  await expect(page.getByText(/reloading this page loses them/i)).toBeVisible();
  expect(await coreCalls(request, "POST", endpoint)).toBe(before + 1);
  const postsBeforeRetry = (await coreState(request)).requests.filter((entry) => entry.method === "POST" && entry.path === endpoint);
  expect(postsBeforeRetry.slice(-1)[0]?.idempotencyKey).toBe(initialRequest.headers()["idempotency-key"]);
  const accountBeforeRetry = await page.locator("article.card h2").textContent();
  const retryRequestPromise = page.waitForRequest((candidate) => new URL(candidate.url()).pathname === endpoint && candidate.method() === "POST");
  await page.getByRole("button", { name: "Retry the same opening", exact: true }).click();
  const retryRequest = await retryRequestPromise;
  expect(retryRequest.headers()["idempotency-key"]).toBe(initialRequest.headers()["idempotency-key"]);
  expect(retryRequest.postDataJSON()).toEqual(initialRequest.postDataJSON());
  await expect(page.getByText("Account opened", { exact: true })).toBeVisible();
  await expect(page.getByText(accountBeforeRetry!, { exact: true })).toBeVisible();
  const state = await coreState(request);
  expect(state.accountOpeningCreations["opening-timeout"]).toBe(1);
  expect(state.requests.filter((entry) => entry.method === "POST" && entry.path === endpoint).slice(-2).map((entry) => entry.idempotencyKey))
    .toEqual([initialRequest.headers()["idempotency-key"], initialRequest.headers()["idempotency-key"]]);
  expect(await coreCalls(request, "POST", endpoint)).toBe(before + 2);
});

test("an empty account lookup after a lost response does not prove failure and permits only a manual same-key retry", async ({ page, request }) => {
  await signIn(page, "opening-network");
  await fillOpening(page, "CHECKING", "0");
  const before = await coreCalls(request, "POST", endpoint);
  const initialRequestPromise = page.waitForRequest((candidate) => new URL(candidate.url()).pathname === endpoint && candidate.method() === "POST");
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  const initialRequest = await initialRequestPromise;
  await expect(page.getByText(/no accounts are currently listed/i)).toBeVisible();
  await expect(page.getByText(/may already have opened your account/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry the same opening", exact: true })).toBeEnabled();
  expect(await coreCalls(request, "POST", endpoint)).toBe(before + 1);
  await expect(page.getByRole("link", { name: "View my accounts" })).toHaveAttribute("href", "/customer/accounts");
  const retryRequestPromise = page.waitForRequest((candidate) => new URL(candidate.url()).pathname === endpoint && candidate.method() === "POST");
  await page.getByRole("button", { name: "Retry the same opening", exact: true }).click();
  const retryRequest = await retryRequestPromise;
  expect(retryRequest.headers()["idempotency-key"]).toBe(initialRequest.headers()["idempotency-key"]);
  expect(retryRequest.postDataJSON()).toEqual(initialRequest.postDataJSON());
  await expect(page.getByText("Account opened", { exact: true })).toBeVisible();
  const state = await coreState(request);
  expect(state.accountOpeningCreations["opening-network"]).toBe(1);
  expect(state.requests.filter((entry) => entry.method === "POST" && entry.path === endpoint).slice(-2).map((entry) => entry.idempotencyKey))
    .toEqual([initialRequest.headers()["idempotency-key"], initialRequest.headers()["idempotency-key"]]);
  expect(await coreCalls(request, "POST", endpoint)).toBe(before + 2);
});

test("a definitive backend rejection after manual uncertain retry returns to the recoverable form", async ({ page }) => {
  await signIn(page, "opening-network-validation");
  await fillOpening(page, "SAVINGS", "1000.05");
  const initialRequestPromise = page.waitForRequest((candidate) => new URL(candidate.url()).pathname === endpoint && candidate.method() === "POST");
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  const initialRequest = await initialRequestPromise;
  await expect(page.getByText(/no accounts are currently listed/i)).toBeVisible();

  const retryRequestPromise = page.waitForRequest((candidate) => new URL(candidate.url()).pathname === endpoint && candidate.method() === "POST");
  await page.getByRole("button", { name: "Retry the same opening", exact: true }).click();
  const retryRequest = await retryRequestPromise;
  expect(retryRequest.headers()["idempotency-key"]).toBe(initialRequest.headers()["idempotency-key"]);
  expect(retryRequest.postDataJSON()).toEqual(initialRequest.postDataJSON());
  await expect(page.getByText("Opening deposit below minimum", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open account", exact: true })).toBeEnabled();
  await expect(page.getByText(/may already have opened your account/i)).toHaveCount(0);
});

test("starting a different account opening creates a fresh logical operation key", async ({ page }) => {
  await signIn(page, "opening-approved");
  await fillOpening(page, "SAVINGS", "1000.05");
  const firstRequestPromise = page.waitForRequest((candidate) => new URL(candidate.url()).pathname === endpoint && candidate.method() === "POST");
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  const firstRequest = await firstRequestPromise;
  await expect(page.getByText("Account opened", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open another account", exact: true }).click();
  await fillOpening(page, "CHECKING", "0");
  const secondRequestPromise = page.waitForRequest((candidate) => new URL(candidate.url()).pathname === endpoint && candidate.method() === "POST");
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  const secondRequest = await secondRequestPromise;
  expect(secondRequest.headers()["idempotency-key"]).not.toBe(firstRequest.headers()["idempotency-key"]);
  expect(secondRequest.postDataJSON()).toEqual({ accountType: "CHECKING", initialDeposit: "0", branchId: 2147483647 });
  await expect(page.getByText("Account opened", { exact: true })).toBeVisible();
  const upstreamPosts = (await coreState(page.request)).requests.filter((entry) => entry.method === "POST" && entry.path === endpoint);
  expect(upstreamPosts.slice(-2).map((entry) => entry.idempotencyKey)).toEqual([
    firstRequest.headers()["idempotency-key"], secondRequest.headers()["idempotency-key"]
  ]);
});

test("an idempotency conflict stops the old operation until the customer checks accounts and explicitly starts a new one", async ({ page }) => {
  const seededKey = "h2w-conflict-key";
  await page.addInitScript(() => {
    const keys = ["h2w-conflict-key", "h2w-new-operation-key"];
    let index = 0;
    Object.defineProperty(window.crypto, "randomUUID", {
      configurable: true,
      value: () => keys[index++] ?? "h2w-extra-operation-key"
    });
  });
  await page.request.post("http://127.0.0.1:38080/test/seed-account-opening-conflict", {
    data: { username: "opening-conflict", key: seededKey }
  });
  await signIn(page, "opening-conflict");
  await fillOpening(page);
  const firstRequestPromise = page.waitForRequest((candidate) => new URL(candidate.url()).pathname === endpoint && candidate.method() === "POST");
  const myAccountsBefore = await coreCalls(page.request, "GET", `${endpoint}/my`);
  const openingRequestsBefore = await coreCalls(page.request, "POST", endpoint);
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  const firstRequest = await firstRequestPromise;
  await expect(page.getByText(/key is already associated with a different account request/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry the same opening", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start a new account opening", exact: true })).toHaveCount(0);
  expect(await coreCalls(page.request, "GET", `${endpoint}/my`)).toBe(myAccountsBefore);
  expect(await coreCalls(page.request, "POST", endpoint)).toBe(openingRequestsBefore + 1);
  await page.getByRole("button", { name: "Check my accounts", exact: true }).click();
  await expect(page.getByText("1000099999", { exact: true })).toBeVisible();
  await page.getByLabel(/I reviewed my accounts/i).check();
  await page.getByRole("button", { name: "Start a new account opening", exact: true }).click();
  await fillOpening(page, "SAVINGS", "1000.05");
  const secondRequestPromise = page.waitForRequest((candidate) => new URL(candidate.url()).pathname === endpoint && candidate.method() === "POST");
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  const secondRequest = await secondRequestPromise;
  expect(secondRequest.headers()["idempotency-key"]).not.toBe(firstRequest.headers()["idempotency-key"]);
  await expect(page.getByText("Account opened", { exact: true })).toBeVisible();
});

test("a backend invalid-key validation error stays definitive and recoverable", async ({ page }) => {
  await signIn(page, "opening-invalid-key");
  await fillOpening(page, "SAVINGS", "1000.05");
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  await expect(page.getByText(/Bank-core rejected the account-opening request as invalid/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Open account", exact: true })).toBeEnabled();
  await expect(page.getByText(/may already have opened your account/i)).toHaveCount(0);
});

test("a backend KYC eligibility rejection remains a definitive failure", async ({ page, request }) => {
  await signIn(page, "opening-kyc-rejected");
  await fillOpening(page);
  const reads = await coreCalls(request, "GET", `${endpoint}/my`);
  await page.getByRole("button", { name: "Open account", exact: true }).click();
  await expect(page.getByText(/KYC must be APPROVED before self-service account opening/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Open account", exact: true })).toBeEnabled();
  expect(await coreCalls(request, "GET", `${endpoint}/my`)).toBe(reads);
  expect((await coreState(request)).accountOpeningCreations["opening-kyc-rejected"] ?? 0).toBe(0);
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
