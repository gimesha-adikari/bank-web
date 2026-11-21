import { expect, test, type Page, type Request } from "@playwright/test";

const depositEndpoint = "/api/v1/transactions/deposit";

async function openDeposit(page: Page) {
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  const response = await page.request.post("/api/v1/auth/login", {
    data: { username: "customer", password: "secret" },
    headers: { "X-CSRF-Token": csrf.token }
  });
  expect(response.ok()).toBe(true);
  await page.goto("/customer/transactions/deposit");
  const form = page.getByTestId("deposit-form");
  await expect(form.getByLabel("Account", { exact: true })).toHaveValue("account-1", { timeout: 20_000 });
  const writes: Request[] = [];
  page.on("request", (request) => {
    if (isDeposit(request)) writes.push(request);
  });
  return { writes, form, amount: form.getByLabel("Amount (decimal text)") };
}

function isDeposit(request: Request) {
  return request.method() === "POST" && new URL(request.url()).pathname === depositEndpoint;
}

test("a BFF timeout after posting retains the original payload and key for manual replay", async ({ page }) => {
  const { writes, form, amount } = await openDeposit(page);
  await amount.fill("70.01");
  const timeout = page.waitForResponse((response) => isDeposit(response.request()) && response.status() === 504);
  await form.evaluate((element) => {
    const form = element as HTMLFormElement;
    form.requestSubmit();
    form.requestSubmit();
  });
  expect(await (await timeout).json()).toMatchObject({ code: "BANKING_UPSTREAM_TIMEOUT" });
  await expect(form.getByRole("alert")).toContainText(/may already have succeeded/i);
  await expect(amount).toBeDisabled();
  await expect(amount).toHaveValue("70.01");
  expect(writes).toHaveLength(1);
  await expect(page.getByTestId("transaction-receipt")).toHaveCount(0);

  const replay = page.waitForResponse((response) => isDeposit(response.request()) && response.ok());
  await page.getByRole("button", { name: "Retry same transaction" }).click();
  expect(await (await replay).json()).toMatchObject({ journalReference: "JR-delayed", replayed: true });
  await expect(page.getByTestId("transaction-receipt")).toContainText("JR-delayed");
  await expect(page.getByLabel("Refreshed server balances")).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[0].headers()["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(writes[1].headers()["idempotency-key"]).toBe(writes[0].headers()["idempotency-key"]);
  expect(writes[1].postDataJSON()).toEqual({ accountId: "account-1", amount: "70.01" });
  expect(writes[1].postDataJSON()).toEqual(writes[0].postDataJSON());
});

test("a BFF connection failure requires an explicit start before a different payload can use a new key", async ({ page }) => {
  const { writes, form, amount } = await openDeposit(page);
  await amount.fill("70.02");
  const unavailable = page.waitForResponse((response) => isDeposit(response.request()) && response.status() === 502);
  await page.getByRole("button", { name: "Submit transaction" }).click();
  expect(await (await unavailable).json()).toMatchObject({ code: "BANKING_UPSTREAM_UNAVAILABLE" });
  await expect(form.getByRole("alert")).toContainText(/may already have succeeded/i);
  await expect(amount).toBeDisabled();
  expect(writes).toHaveLength(1);

  await page.getByRole("button", { name: "Start a different transaction" }).click();
  await expect(amount).toHaveValue("");
  await amount.fill("70.03");
  expect(writes).toHaveLength(1);
  await page.getByRole("button", { name: "Submit transaction" }).click();
  await expect(page.getByTestId("transaction-receipt")).toContainText("JR-1");
  expect(writes).toHaveLength(2);
  expect(writes[1].headers()["idempotency-key"]).not.toBe(writes[0].headers()["idempotency-key"]);
  expect(writes[1].postDataJSON()).toEqual({ accountId: "account-1", amount: "70.03" });
});
