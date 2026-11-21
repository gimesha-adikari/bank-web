import { expect, test, type Page } from "@playwright/test";

const accountOne = "40000000-0000-4000-8000-000000000001";
const accountTwo = "40000000-0000-4000-8000-000000000002";
const accountThree = "40000000-0000-4000-8000-000000000003";

async function signIn(page: Page, username: string, path = "/staff/accounts") {
  await page.context().clearCookies();
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  const login = await page.request.post("/api/v1/auth/login", {
    data: { username, password: "secret" },
    headers: { "X-CSRF-Token": csrf.token }
  });
  expect(login.status()).toBe(200);
  await page.goto(path);
}

async function evidence(page: Page) {
  const response = await page.request.get("http://127.0.0.1:38080/test/requests");
  return await response.json() as {
    requests: { method: string; path: string; idempotencyKey?: string | null }[];
    staffAccountUpdates: { accountId: string; accountType: string; initialDeposit: string; branchId: number; idempotencyKey: string | null }[];
    staffAccountClosures: { accountId: string; balanceBefore: string }[];
    staffAccountRecords: Record<string, { accountStatus: string; balance: string; accountType: string }>;
  };
}

test("ADMIN, MANAGER and TELLER can use shared account pages while Teller opening stays Teller-only", async ({ page }) => {
  for (const [username, canOpenForCustomer] of [["admin", false], ["manager", false], ["teller", true]] as const) {
    await signIn(page, username);
    await expect(page).toHaveURL(/\/staff\/accounts$/);
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
    await expect(page.getByRole("link", { name: "1000000001" })).toHaveAttribute("href", `/staff/accounts/${accountOne}`);
    await expect(page.getByRole("link", { name: "Accounts", exact: true })).toHaveAttribute("href", "/staff/accounts");
    const tellerOpeningLink = page.getByRole("link", { name: "Open account", exact: true });
    if (canOpenForCustomer) await expect(tellerOpeningLink).toHaveAttribute("href", "/staff/accounts/new");
    else await expect(tellerOpeningLink).toHaveCount(0);

    await page.goto(`/staff/accounts/${accountOne}`);
    await expect(page.getByRole("button", { name: "Edit account type or branch" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Close account" })).toBeEnabled();
  }
});

test("staff account detail and history use authoritative account-scoped endpoints without inventing owner data", async ({ page }) => {
  await signIn(page, "manager", `/staff/accounts/${accountOne}`);
  await expect(page.getByRole("heading", { name: "1000000001" })).toBeVisible();
  await expect(page.getByText(accountOne)).toBeVisible();
  await expect(page.getByText("1250.1234 LKR")).toBeVisible();
  await expect(page.getByText(/does not return a customer record UUID, linked user UUID, or branch/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /customer details/i })).toHaveCount(0);
  await page.getByRole("link", { name: "View transaction history" }).click();
  await expect(page).toHaveURL(new RegExp(`/staff/accounts/${accountOne}/transactions$`));
  await expect(page.getByText("TRANSFER_OUT")).toBeVisible();
  await expect(page.getByText("15.2300 LKR")).toBeVisible();
  await expect(page.getByText("Sample account transfer")).toBeVisible();

  const requests = (await evidence(page)).requests;
  expect(requests.some((entry) => entry.method === "GET" && entry.path === `/api/v1/accounts/${accountOne}`)).toBe(true);
  expect(requests.some((entry) => entry.method === "GET" && entry.path === `/api/v1/accounts/${accountOne}/transactions`)).toBe(true);
  expect(requests.some((entry) => entry.method === "GET" && entry.path === "/api/v1/transactions")).toBe(false);
});

test("account update uses the exact DTO through the BFF and refreshes authoritative details", async ({ page }) => {
  await signIn(page, "teller", `/staff/accounts/${accountOne}`);
  await page.getByRole("button", { name: "Edit account type or branch" }).click();
  await expect(page.getByRole("option", { name: /Harbour Branch/ })).toHaveCount(1);
  await page.getByLabel("Account type").selectOption("CHECKING");
  await page.getByLabel("Branch to set").selectOption("2147483647");
  await page.getByRole("button", { name: "Review account changes" }).click();
  await expect(page.getByRole("region", { name: "Review account changes" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm account changes" }).click();

  await expect(page.locator(".success-box[role=status]")).toContainText(/account update confirmed by bank-core/i);
  await expect(page.getByText("CHECKING", { exact: true })).toBeVisible();
  await expect(page.getByText("1250.1234 LKR")).toBeVisible();
  const result = await evidence(page);
  expect(result.staffAccountUpdates).toContainEqual({
    accountId: accountOne, accountType: "CHECKING", initialDeposit: "1250.1234", branchId: 2147483647, idempotencyKey: null
  });
  expect(result.requests.some((entry) => entry.method === "PUT" && entry.path === `/api/v1/accounts/${accountOne}`)).toBe(true);
});

test("closure authorization and conflicting state are reported without confirmation claims", async ({ page }) => {
  for (const [username, expected] of [
    ["account-close-forbidden", /not permitted to close accounts/i],
    ["account-close-conflict", /account changed while you were working/i]
  ] as const) {
    await signIn(page, username, `/staff/accounts/${accountTwo}`);
    await page.getByRole("button", { name: "Close account" }).click();
    await page.getByRole("checkbox", { name: /remaining balance will stay/i }).check();
    await page.getByRole("button", { name: "Confirm close account" }).click();
    await expect(page.locator(".error-box[role=alert]")).toContainText(expected);
    await expect(page.locator(".success-box[role=status]")).toHaveCount(0);
  }
});

test("closure requires deliberate acknowledgment and reports unchanged nonzero balance", async ({ page }) => {
  await signIn(page, "manager", `/staff/accounts/${accountTwo}`);
  await page.getByRole("button", { name: "Close account" }).click();
  const confirm = page.getByRole("button", { name: "Confirm close account" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("checkbox", { name: /remaining balance will stay/i }).check();
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.locator(".success-box[role=status]")).toContainText(/account closed by bank-core/i);
  await expect(page.getByText("CLOSED", { exact: true })).toBeVisible();
  await expect(page.getByText("50.5000 LKR")).toBeVisible();
  const result = await evidence(page);
  expect(result.staffAccountClosures).toContainEqual({ accountId: accountTwo, balanceBefore: "50.5000" });
  expect(result.staffAccountRecords[accountTwo]).toMatchObject({ accountStatus: "CLOSED", balance: "50.5000" });
  expect(result.requests.some((entry) => entry.method === "DELETE" && entry.path === `/api/v1/accounts/${accountTwo}`)).toBe(true);
  expect(result.requests.some((entry) => /ledger|journal/i.test(entry.path))).toBe(false);
});

test("already-closed account does not offer a second close request", async ({ page }) => {
  await signIn(page, "admin", `/staff/accounts/${accountThree}`);
  await expect(page.getByText(/already closed/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Close account" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit account type or branch" })).toBeEnabled();
});

test("uncertain update is read back and never submitted automatically a second time", async ({ page }) => {
  await signIn(page, "account-update-timeout", `/staff/accounts/${accountThree}`);
  const before = (await evidence(page)).staffAccountUpdates.length;
  await page.getByRole("button", { name: "Edit account type or branch" }).click();
  await expect(page.getByRole("option", { name: /Central Branch/ })).toHaveCount(1);
  await page.getByLabel("Account type").selectOption("CHECKING");
  await page.getByLabel("Branch to set").selectOption("21");
  await page.getByRole("button", { name: "Review account changes" }).click();
  await page.getByRole("button", { name: "Confirm account changes" }).click();

  await expect(page.locator(".error-box[role=alert]")).toContainText(/update result is uncertain.*no automatic retry/i);
  await expect(page.getByText("CHECKING", { exact: true })).toBeVisible();
  const result = await evidence(page);
  expect(result.staffAccountUpdates).toHaveLength(before + 1);
  expect(result.requests.filter((entry) => entry.method === "PUT" && entry.path === `/api/v1/accounts/${accountThree}`)).toHaveLength(1);
  expect(result.requests.some((entry) => entry.method === "GET" && entry.path === `/api/v1/accounts/${accountThree}`)).toBe(true);
});

test("uncertain close is recovered by a read-only status lookup without resubmission", async ({ page }) => {
  await signIn(page, "account-close-timeout", `/staff/accounts/${accountOne}`);
  await page.getByRole("button", { name: "Close account" }).click();
  await page.getByRole("checkbox", { name: /remaining balance will stay/i }).check();
  await page.getByRole("button", { name: "Confirm close account" }).click();

  await expect(page.locator(".success-box[role=status]")).toContainText(/read-back confirms that bank-core closed this account/i);
  const requests = (await evidence(page)).requests;
  expect(requests.filter((entry) => entry.method === "DELETE" && entry.path === `/api/v1/accounts/${accountOne}`)).toHaveLength(1);
  expect(requests.some((entry) => entry.method === "GET" && entry.path === `/api/v1/accounts/${accountOne}`)).toBe(true);
});

test("permission, missing record and transport failures stay visible without routing loops", async ({ page }) => {
  await signIn(page, "account-directory-forbidden");
  await expect(page.locator(".error-box[role=alert]")).toContainText(/not permitted to view account records/i);
  await expect(page).toHaveURL(/\/staff\/accounts$/);

  await signIn(page, "teller", "/staff/accounts/40000000-0000-4000-8000-000000000099");
  await expect(page.locator(".error-box[role=alert]")).toContainText(/account was not found/i);
  await page.getByRole("button", { name: "Reload account" }).click();
  await expect(page).toHaveURL(/\/staff\/accounts\/40000000-/);

  await signIn(page, "account-directory-network");
  await expect(page.locator(".error-box[role=alert]")).toContainText(/banking service could not be reached/i);
  await expect(page).toHaveURL(/\/staff\/accounts$/);

  await signIn(page, "account-directory-expired");
  await expect(page).toHaveURL(/\/login/);
});

test("a customer is denied direct navigation to staff account records", async ({ page }) => {
  await signIn(page, "customer", "/staff/accounts");
  await expect(page).toHaveURL(/\/unauthorized$/);
  await expect(page.getByRole("heading", { name: /do not have access/i })).toBeVisible();
});

test("bank-core update validation and authorization errors remain definitive", async ({ page }) => {
  for (const [username, expected] of [
    ["account-update-forbidden", /not permitted to update accounts/i],
    ["account-update-conflict", /account changed while you were working/i],
    ["account-update-validation", /bank-core rejected the update request.*branchId: Unknown branch/i]
  ] as const) {
    await signIn(page, username, `/staff/accounts/${accountOne}`);
    await page.getByRole("button", { name: "Edit account type or branch" }).click();
    await expect(page.getByRole("option", { name: /Central Branch/ })).toHaveCount(1);
    await page.getByLabel("Branch to set").selectOption("21");
    await page.getByRole("button", { name: "Review account changes" }).click();
    await page.getByRole("button", { name: "Confirm account changes" }).click();
    await expect(page.locator(".error-box[role=alert]")).toContainText(expected);
    await expect(page.locator(".error-box[role=alert]")).not.toContainText(/result is uncertain/i);
  }
});
