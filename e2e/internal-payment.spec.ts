import { expect, test, type Page, type Request } from "@playwright/test";

const payPath = "/customer/pay";
const transfer = "/api/v1/transactions/transfer";
const receiptPath = `${transfer}/receipt`;
const source = "60000000-0000-4000-8000-000000000001";
const checking = "60000000-0000-4000-8000-000000000002";
const recipient = "60000000-0000-4000-8000-000000000004";
const keyPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

const pathOf = (request: Request) => new URL(request.url()).pathname;
const isTransfer = (request: Request) => pathOf(request) === transfer && request.method() === "POST";
const isReceipt = (request: Request) => pathOf(request) === receiptPath && request.method() === "GET";

async function signIn(page: Page, username: string) {
  const { token } = await (await page.request.get("/api/auth/csrf")).json();
  const result = await page.request.post("/api/v1/auth/login", {
    data: { username, password: "secret" }, headers: { "X-CSRF-Token": token }
  });
  expect(result.ok()).toBe(true);
}

async function openPayment(page: Page, username: string, url = payPath) {
  const writes: Request[] = [];
  const reads: Request[] = [];
  page.on("request", (request) => {
    if (isTransfer(request)) writes.push(request);
    if (isReceipt(request)) reads.push(request);
  });
  await signIn(page, username);
  await page.goto(url);
  const account = page.getByRole("combobox", { name: "Source account" });
  await expect(account).toHaveValue(source, { timeout: 20_000 });
  return {
    account, writes, reads,
    destination: page.getByLabel(/Destination account UUID/),
    amount: page.getByLabel(/Amount \(LKR\)/),
    receipt: page.getByRole("region", { name: "Payment receipt" }),
    alert: page.locator(".error-box[role=alert]")
  };
}

async function reviewPayment(page: Page, amount = "10.25") {
  await page.getByLabel(/Destination account UUID/).fill(recipient);
  await page.getByLabel(/Amount \(LKR\)/).fill(amount);
  await page.getByRole("button", { name: "Review payment" }).click();
}

async function confirmPayment(page: Page) {
  await page.getByRole("button", { name: "Confirm payment" }).click();
}

test("Pay is customer-only and transfer stays protected by BFF auth, CSRF and core roles", async ({ page }) => {
  await page.goto(payPath);
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  expect((await page.request.get(receiptPath, { headers: { "Idempotency-Key": "example-key" } })).status()).toBe(401);
  await signIn(page, "admin");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Banking operations" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pay", exact: true })).toHaveCount(0);
  await page.goto(payPath);
  await expect(page).toHaveURL(/\/unauthorized$/);
  const headers = { "Idempotency-Key": "example-key" };
  const data = { sourceAccountId: source, destinationAccountId: recipient, amount: "10.25" };
  expect((await page.request.post(transfer, { headers, data })).status()).toBe(403);
  const { token } = await (await page.request.get("/api/auth/csrf")).json();
  const rejected = await page.request.post(transfer, { headers: { ...headers, "X-CSRF-Token": token }, data });
  expect(rejected.status()).toBe(403);
  expect(await rejected.json()).toMatchObject({ code: "ERR_FORBIDDEN" });
  expect((await page.request.get(receiptPath, { headers })).status()).toBe(403);
});

test("reviews the exact request, submits once and refreshes only the payer's balance and history", async ({ page }) => {
  const { account, writes, reads, destination, amount, receipt, alert } = await openPayment(page, "pay-success");
  await expect(page.getByRole("link", { name: "Pay", exact: true })).toHaveAttribute("href", payPath);
  await expect(account.locator("option")).toHaveText(["Choose an account", "2000000001 · SAVINGS · 100.0000 LKR", "2000000002 · CHECKING · 250.5678 LKR"]);
  await account.selectOption(checking);
  await amount.fill("0010.20");
  await destination.fill("2000000003");
  await page.getByRole("button", { name: "Review payment" }).click();
  await expect(alert).toContainText("Enter the destination account UUID");
  await destination.fill(checking);
  await page.getByRole("button", { name: "Review payment" }).click();
  await expect(alert).toContainText("different from your source account");
  await destination.fill(recipient);
  await amount.fill("10.201");
  await page.getByRole("button", { name: "Review payment" }).click();
  await expect(alert).toContainText("at most two decimal places");
  await reviewPayment(page, "0010.20");
  const review = page.getByRole("region", { name: "Review payment" });
  await expect(review).toContainText("2000000002");
  await expect(review).toContainText(recipient);
  await expect(review).toContainText("0010.20 LKR");
  expect(writes).toHaveLength(0);

  const accountReads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "GET" && pathOf(request).startsWith("/api/v1/accounts/")) accountReads.push(pathOf(request));
  });
  const response = page.waitForResponse((result) => isTransfer(result.request()) && result.ok());
  await page.getByRole("button", { name: "Confirm payment" }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  const committed = await (await response).json();
  await expect(receipt).toContainText("JR-TEST-PAY");
  await expect(receipt).toContainText(committed.journalEntryId);
  await expect(receipt).toContainText("10.2000 LKR");
  await expect(receipt).toContainText("240.3678 LKR");
  await expect(receipt.getByText(/recipient balance/i)).toHaveCount(0);
  expect(committed).not.toHaveProperty("destinationResultingBalance");
  await expect(page.getByText(/Current payer balance/)).toContainText("240.3678 LKR");
  const row = page.getByRole("row", { name: /TRANSFER_OUT/ });
  await expect(row).toContainText("10.2000 LKR");
  await expect(row).toContainText("Internal transfer");
  await expect(row).toContainText("2026-02-03T12:00:00");
  expect(accountReads.sort()).toEqual([`/api/v1/accounts/${checking}`, `/api/v1/accounts/${checking}/transactions`]);
  expect(writes).toHaveLength(1);
  expect(reads).toHaveLength(0);
  expect(writes[0].postDataJSON()).toEqual({ sourceAccountId: checking, destinationAccountId: recipient, amount: "0010.20" });
  const key = writes[0].headers()["idempotency-key"];
  expect(key).toMatch(keyPattern);
  expect(writes[0].headers()["x-csrf-token"]).toBeTruthy();
  expect(writes[0].headers()["authorization"]).toBeUndefined();

  await page.getByRole("button", { name: "Start a new payment" }).click();
  await expect(amount).toHaveValue("");
  await reviewPayment(page, "1.00");
  await confirmPayment(page);
  await expect(receipt).toContainText("239.3678 LKR");
  expect(writes).toHaveLength(2);
  expect(writes[1].headers()["idempotency-key"]).not.toBe(key);
});

test("a BFF timeout after persistence recovers through a receipt GET without posting again", async ({ page }) => {
  const { writes, reads, receipt } = await openPayment(page, "pay-timeout");
  await reviewPayment(page);
  const timeout = page.waitForResponse((result) => isTransfer(result.request()) && result.status() === 504);
  await confirmPayment(page);
  expect(await (await timeout).json()).toMatchObject({ code: "BANKING_UPSTREAM_TIMEOUT" });
  await expect(receipt).toContainText("JR-TEST-PAY");
  await expect(page.getByRole("row", { name: /TRANSFER_OUT/ })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(reads).toHaveLength(1);
  const key = writes[0].headers()["idempotency-key"];
  expect(reads[0].headers()["idempotency-key"]).toBe(key);
  expect(reads[0].headers()["x-csrf-token"]).toBeUndefined();
  const telemetry = await (await page.request.get("http://127.0.0.1:38080/test/requests")).json();
  expect(telemetry.paymentRequests.filter((entry: { username: string }) => entry.username === "pay-timeout")).toEqual([
    { username: "pay-timeout", method: "POST", key, payload: writes[0].postDataJSON() },
    { username: "pay-timeout", method: "GET", key }
  ]);
});

test("404 leaves the payment unresolved and a deliberate retry replays with the exact original key and payload", async ({ page }) => {
  const { writes, reads, receipt, alert } = await openPayment(page, "pay-retry");
  await reviewPayment(page, "0010.20");
  const missing = page.waitForResponse((result) => isReceipt(result.request()) && result.status() === 404);
  await confirmPayment(page);
  expect(await (await missing).json()).toMatchObject({ code: "ERR_NOT_FOUND" });
  await expect(alert).toContainText("The original request may still complete");
  await expect(receipt).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check receipt" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Start a new payment" })).toHaveCount(0);
  expect(writes).toHaveLength(1);
  const replay = page.waitForResponse((result) => isTransfer(result.request()) && result.ok());
  await page.getByRole("button", { name: "Retry same payment" }).click();
  expect(await (await replay).json()).toMatchObject({ journalReference: "JR-TEST-PAY", replayed: true });
  await expect(receipt).toContainText("89.8000 LKR");
  expect(writes).toHaveLength(2);
  expect(reads).toHaveLength(1);
  expect(writes[1].headers()["idempotency-key"]).toBe(writes[0].headers()["idempotency-key"]);
  expect(writes[1].postData()).toBe(writes[0].postData());

  const key = writes[0].headers()["idempotency-key"];
  const { token } = await (await page.request.get("/api/auth/csrf")).json();
  const changed = await page.request.post(transfer, {
    headers: { "Idempotency-Key": key, "X-CSRF-Token": token }, data: { ...writes[0].postDataJSON(), amount: "12.00" }
  });
  expect(changed.status()).toBe(409);
  expect(await changed.json()).toMatchObject({ code: "ERR_IDEMPOTENCY_CONFLICT" });
});

test("a receipt lookup timeout preserves uncertainty while an explicit read can confirm", async ({ page }) => {
  const { writes, reads, receipt, alert } = await openPayment(page, "pay-lookup-error");
  await reviewPayment(page);
  const timeout = page.waitForResponse((result) => isReceipt(result.request()) && result.status() === 504);
  await confirmPayment(page);
  await timeout;
  await expect(alert).toContainText("The receipt lookup could not be verified");
  await expect(receipt).toHaveCount(0);
  await page.getByRole("button", { name: "Check receipt" }).click();
  await expect(receipt).toContainText("JR-TEST-PAY");
  expect(writes).toHaveLength(1);
  expect(reads).toHaveLength(2);
  expect(reads.map((read) => read.headers()["idempotency-key"])).toEqual(Array(2).fill(writes[0].headers()["idempotency-key"]));
});

test("the existing Transfer page keeps the committed receipt if account refresh fails", async ({ page }) => {
  const { receipt, alert } = await openPayment(page, "pay-refresh-error", "/customer/transactions/transfer");
  await expect(page.getByRole("heading", { name: "Transfer funds", exact: true })).toBeVisible();
  await reviewPayment(page);
  await confirmPayment(page);
  await expect(alert).toContainText("Some account data could not be refreshed");
  await expect(receipt).toContainText("JR-TEST-PAY");
  await expect(receipt).toContainText("89.7500 LKR");
  await page.getByRole("button", { name: "Refresh account data" }).click();
  await expect(alert).toContainText("Some account data could not be refreshed");
  await expect(receipt).toContainText("JR-TEST-PAY");
});

test("definitive bank-core errors are distinct and a conflict prevents resubmission", async ({ page }) => {
  const { writes, reads, receipt, alert } = await openPayment(page, "pay-errors");
  for (const [amount, message] of [
    ["11.01", "insufficient funds"], ["11.02", "could not authorize the source account or find the destination"],
    ["11.03", "inactive or ineligible"], ["11.04", "must support internal payments in LKR"],
    ["11.05", "role is not authorized"], ["11.06", "conflict with the original payment key"]
  ]) {
    await reviewPayment(page, amount);
    await confirmPayment(page);
    await expect(alert).toContainText(message);
  }
  await expect(receipt).toHaveCount(0);
  await expect(page.getByRole("button", { name: /review payment|retry same payment|start a new payment/i })).toHaveCount(0);
  expect(writes).toHaveLength(6);
  expect(reads).toHaveLength(0);
});
