import { expect, test, type Page } from "@playwright/test";

const customerId = "30000000-0000-4000-8000-000000000001";

async function signIn(page: Page, username = "teller") {
  await page.context().clearCookies();
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  const login = await page.request.post("/api/v1/auth/login", {
    data: { username, password: "secret" },
    headers: { "X-CSRF-Token": csrf.token }
  });
  expect(login.status()).toBe(200);
  await page.goto("/staff/customers");
}

async function openingEvidence(page: Page) {
  const response = await page.request.get("http://127.0.0.1:38080/test/requests");
  return await response.json() as {
    requests: { method: string; path: string }[];
    tellerOpeningRequests: { userId: string; accountType: string; initialDeposit: string; branchId: number; idempotencyKey: string | null }[];
    tellerOpenedAccountCount: number;
  };
}

function tellerPostCount(evidence: Awaited<ReturnType<typeof openingEvidence>>) {
  return evidence.requests.filter((entry) => entry.method === "POST" && /^\/api\/v1\/accounts\/[\da-f-]{36}$/.test(entry.path)).length;
}

test("Teller opens from customer detail using linked user UUID and views the refreshed account history", async ({ page }) => {
  await signIn(page);
  await page.goto(`/staff/customers/${customerId}`);
  await expect(page.getByRole("heading", { name: "Ava Martin" })).toBeVisible();
  const linkedUserId = (await page.locator("dd").filter({ hasText: /^0ce3cd10-/ }).textContent())!;

  await page.getByRole("link", { name: "Open Teller account form" }).click();
  await expect(page).toHaveURL(new RegExp(`/staff/accounts/new\\?customerUserId=${linkedUserId}`));
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue(linkedUserId);
  await page.getByLabel("Account type").selectOption("SAVINGS");
  await page.getByLabel("Branch").selectOption("21");
  await page.getByLabel(/Initial deposit/).fill("1000.10");
  await page.getByRole("button", { name: "Open account" }).click();

  await expect(page.locator('[aria-label="Account opening receipt"] h2[role="status"]')).toHaveText("Account opened");
  await expect(page.getByText("8000000001")).toBeVisible();
  await expect(page.getByText("SAVINGS", { exact: true })).toBeVisible();
  await expect(page.getByText("ACTIVE", { exact: true })).toHaveCount(2);
  await expect(page.getByText("1000.1000 LKR", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Ava Martin")).toBeVisible();
  await expect(page.getByText(linkedUserId)).toBeVisible();
  await expect(page.getByRole("link", { name: /transaction history/i })).toHaveAttribute("href", /\/staff\/accounts\/[\da-f-]{36}\/transactions$/);
  await expect(page.getByRole("link", { name: /customer details/i })).toHaveAttribute("href", `/staff/customers/${customerId}`);

  const historyHref = (await page.getByRole("link", { name: /transaction history/i }).getAttribute("href"))!;
  const accountId = new URL(historyHref, "http://localhost").pathname.split("/")[3];
  const evidence = await openingEvidence(page);
  expect(evidence.tellerOpeningRequests).toContainEqual({
    userId: linkedUserId, accountType: "SAVINGS", initialDeposit: "1000.10", branchId: 21, idempotencyKey: null
  });
  expect(evidence.tellerOpenedAccountCount).toBeGreaterThan(0);
  const requests = (await (await page.request.get("http://127.0.0.1:38080/test/requests")).json()).requests as { method: string; path: string; idempotencyKey?: string | null }[];
  expect(requests.some((entry) => entry.method === "GET" && entry.path === `/api/v1/accounts/${accountId}`)).toBe(true);
  expect(requests.some((entry) => entry.method === "POST" && entry.path === `/api/v1/accounts/${linkedUserId}` && entry.idempotencyKey === null)).toBe(true);

  await page.getByRole("link", { name: /transaction history/i }).click();
  await expect(page).toHaveURL(new RegExp(`/staff/accounts/${accountId}/transactions$`));
  await expect(page.getByRole("heading", { name: "8000000001" })).toBeVisible();
  await expect(page.getByText("Opening deposit")).toBeVisible();
});

test("a direct Teller entry can select an existing customer but cannot submit a customer record UUID as userId", async ({ page }) => {
  await signIn(page);
  await page.goto(`/staff/accounts/new?customerUserId=${customerId}`);
  await expect(page.locator(".error-box[role=alert]")).toHaveText(/does not match an existing customer login/i);
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Customer", { exact: true }).locator("option", { hasText: "Ava Martin" })).toHaveCount(1);
});

test("an uncertain Teller opening is not retried automatically and gives no unsafe retry action", async ({ page }) => {
  await signIn(page, "teller-opening-timeout");
  await page.goto("/staff/accounts/new");
  const before = await openingEvidence(page);
  await page.getByLabel("Customer", { exact: true }).selectOption({ label: "Ava Martin · directory-linked" });
  await page.getByLabel("Account type").selectOption("SAVINGS");
  await page.getByLabel("Branch").selectOption("21");
  await page.getByLabel(/Initial deposit/).fill("1000.00");
  await page.getByRole("button", { name: "Open account" }).click();

  await expect(page.locator(".error-box[role=alert]")).toHaveText(/may already have been created/i);
  await expect(page.getByRole("button", { name: /retry|open account/i })).toHaveCount(0);
  const evidence = await openingEvidence(page);
  expect(evidence.tellerOpeningRequests).toHaveLength(before.tellerOpeningRequests.length + 1);
  expect(evidence.tellerOpenedAccountCount).toBe(before.tellerOpenedAccountCount + 1);
});

test("a backend authorization rejection remains definitive", async ({ page }) => {
  await signIn(page, "teller-opening-forbidden");
  await page.goto("/staff/accounts/new");
  const before = await openingEvidence(page);
  await page.getByLabel("Customer", { exact: true }).selectOption({ label: "Ava Martin · directory-linked" });
  await page.getByLabel("Branch").selectOption("21");
  await page.getByLabel(/Initial deposit/).fill("1000.00");
  await page.getByRole("button", { name: "Open account" }).click();

  await expect(page.locator(".error-box[role=alert]")).toHaveText(/Teller role is not permitted/i);
  await expect(page.getByText(/may already have been created/i)).toHaveCount(0);
  expect(tellerPostCount(await openingEvidence(page))).toBe(tellerPostCount(before) + 1);
});

test("an expired staff session returns to sign in without replaying the opening", async ({ page }) => {
  await signIn(page, "teller-opening-expired");
  await page.goto("/staff/accounts/new");
  const before = await openingEvidence(page);
  await page.getByLabel("Customer", { exact: true }).selectOption({ label: "Ava Martin · directory-linked" });
  await page.getByLabel("Branch").selectOption("21");
  await page.getByLabel(/Initial deposit/).fill("1000.00");
  await page.getByRole("button", { name: "Open account" }).click();

  await expect(page).toHaveURL(/\/login/);
  expect(tellerPostCount(await openingEvidence(page))).toBe(tellerPostCount(before) + 1);
});
