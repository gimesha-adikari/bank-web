import { expect, test, type Page } from "@playwright/test";

const accountOne = "40000000-0000-4000-8000-000000000001";
const accountTwo = "40000000-0000-4000-8000-000000000002";
const accountThree = "40000000-0000-4000-8000-000000000003";
const eligibleAccount = "40000000-0000-4000-8000-000000000004";
const zeroToClose = "40000000-0000-4000-8000-000000000005";
const timeoutClosed = "40000000-0000-4000-8000-000000000006";
const timeoutOpen = "40000000-0000-4000-8000-000000000007";
const nonzeroLedger = "40000000-0000-4000-8000-000000000008";
const changingBalance = "40000000-0000-4000-8000-000000000009";
const negativeBalance = "40000000-0000-4000-8000-000000000010";

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

async function accountMethods(page: Page, accountId: string, from: number) {
  return (await evidence(page)).requests.slice(from).filter(({ path }) => path === `/api/v1/accounts/${accountId}`)
    .map(({ method }) => method);
}

async function reviewClose(page: Page) {
  await page.getByRole("button", { name: "Close account", exact: true }).click();
  return page.getByRole("button", { name: "Confirm close account" });
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

    await page.goto(`/staff/accounts/${eligibleAccount}`);
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
    await signIn(page, username, `/staff/accounts/${eligibleAccount}`);
    await (await reviewClose(page)).click();
    await expect(page.locator(".error-box[role=alert]")).toContainText(expected);
    await expect(page.locator(".success-box[role=status]")).toHaveCount(0);
  }
});

test("positive and negative balances stay exact and block closure in the browser", async ({ page }) => {
  const before = (await evidence(page)).requests.length;
  for (const [accountId, balance] of [[accountTwo, "50.5000"], [negativeBalance, "-0.0001"]]) {
    await signIn(page, "manager", `/staff/accounts/${accountId}`);
    await expect(page.getByText(`${balance} LKR`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close account", exact: true })).toBeDisabled();
    await expect(page.getByText(/bring the account balance to zero through authorized banking operations/i)).toBeVisible();
    await expect(page.getByRole("region", { name: "Close account confirmation" })).toHaveCount(0);
    expect(await accountMethods(page, accountId, before)).not.toContain("DELETE");
  }
});

test("a zero-balance close requires confirmation, returns 204, and preserves history", async ({ page }) => {
  await signIn(page, "manager", `/staff/accounts/${zeroToClose}`);
  const confirm = await reviewClose(page);
  const start = (await evidence(page)).requests.length;
  await expect(page.getByText(/bank-core checks the current account and ledger balances/i)).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  const closure = page.waitForResponse((response) => response.request().method() === "DELETE" && response.url().endsWith(`/api/v1/accounts/${zeroToClose}`));
  await confirm.click();

  expect((await closure).status()).toBe(204);
  await expect(page.locator(".success-box[role=status]")).toContainText(/account closed by bank-core/i);
  await expect(page.getByText("CLOSED", { exact: true })).toBeVisible();
  await expect(page.getByText("0.00 LKR", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close account", exact: true })).toHaveCount(0);
  const result = await evidence(page);
  expect(result.staffAccountClosures).toContainEqual({ accountId: zeroToClose, balanceBefore: "0.00" });
  expect(result.staffAccountRecords[zeroToClose]).toMatchObject({ accountStatus: "CLOSED", balance: "0.00" });
  expect(await accountMethods(page, zeroToClose, start)).toEqual(["GET", "DELETE", "GET"]);
  expect(result.requests.some((entry) => /ledger|journal/i.test(entry.path))).toBe(false);
  await page.getByRole("link", { name: "View transaction history" }).click();
  await expect(page.getByText("Final withdrawal")).toBeVisible();
});

test("a new nonzero balance on the preflight read stops the close", async ({ page }) => {
  await signIn(page, "teller", `/staff/accounts/${changingBalance}`);
  const confirm = await reviewClose(page);
  const change = await page.request.post("http://127.0.0.1:38080/test/change-close-preflight-balance");
  expect(change.status()).toBe(204);
  const start = (await evidence(page)).requests.length;
  await confirm.click();

  await expect(page.locator(".error-box[role=alert]")).toContainText(/changed since this page loaded/i);
  await expect(page.getByText("0.0001 LKR", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close account", exact: true })).toBeDisabled();
  expect(await accountMethods(page, changingBalance, start)).toEqual(["GET"]);
});

test("a 422 ledger balance rejection stays active at displayed zero and triggers a fresh account read", async ({ page }) => {
  await signIn(page, "admin", `/staff/accounts/${nonzeroLedger}`);
  const confirm = await reviewClose(page);
  const start = (await evidence(page)).requests.length;
  const response = page.waitForResponse((result) => result.request().method() === "DELETE" && result.url().endsWith(`/api/v1/accounts/${nonzeroLedger}`));
  await confirm.click();

  const rejected = await response;
  expect(rejected.status()).toBe(422);
  expect(await rejected.json()).toMatchObject({ code: "ERR_ACCOUNT_BALANCE_NONZERO" });
  await expect(page.locator(".error-box[role=alert]")).toContainText(/rejected closure because the account balance or the ledger balance is nonzero/i);
  await expect(page.getByRole("button", { name: "Close account", exact: true })).toBeEnabled();
  await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();
  await expect(page.getByText("0.0000 LKR", { exact: true })).toBeVisible();
  await expect(page.locator(".success-box[role=status]")).toHaveCount(0);
  expect(await accountMethods(page, nonzeroLedger, start)).toEqual(["GET", "DELETE", "GET"]);
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

for (const { username, accountId, closed } of [
  { username: "account-close-timeout", accountId: timeoutClosed, closed: true },
  { username: "account-close-timeout-open", accountId: timeoutOpen, closed: false }
]) {
  test(`close timeout with ${closed ? "closed" : "open"} read-back sends no second DELETE`, async ({ page }) => {
    await signIn(page, username, `/staff/accounts/${accountId}`);
    const confirm = await reviewClose(page);
    const start = (await evidence(page)).requests.length;
    const response = page.waitForResponse((result) => result.request().method() === "DELETE" && result.url().endsWith(`/api/v1/accounts/${accountId}`));
    await confirm.click();

    const timeout = await response;
    expect(timeout.status()).toBe(504);
    expect(await timeout.json()).toMatchObject({ code: "BANKING_UPSTREAM_TIMEOUT" });
    if (closed) {
      await expect(page.locator(".success-box[role=status]")).toContainText(/read-back confirms that bank-core closed this account/i);
      await expect(page.getByText("CLOSED", { exact: true })).toBeVisible();
    } else {
      await expect(page.locator(".error-box[role=alert]")).toContainText(/close result is uncertain.*original request may still complete/i);
      await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();
      await expect(page.locator(".success-box[role=status]")).toHaveCount(0);
    }
    expect(await accountMethods(page, accountId, start)).toEqual(["GET", "DELETE", "GET"]);
  });
}

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

test("a customer is denied the staff account page and a direct closure request through the BFF", async ({ page }) => {
  await signIn(page, "customer", `/staff/accounts/${eligibleAccount}`);
  await expect(page).toHaveURL(/\/unauthorized$/);
  await expect(page.getByRole("heading", { name: /do not have access/i })).toBeVisible();
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  const result = await page.request.delete(`/api/v1/accounts/${eligibleAccount}`, { headers: { "X-CSRF-Token": csrf.token } });
  expect(result.status()).toBe(403);
  expect(await result.json()).toMatchObject({ code: "ERR_FORBIDDEN" });
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
