import { expect, test, type Page } from "@playwright/test";

const customers = {
  safe: "30000000-0000-4000-8000-000000000003",
  conflict: "30000000-0000-4000-8000-000000000004",
  timeoutPersisted: "30000000-0000-4000-8000-000000000005",
  timeoutPresent: "30000000-0000-4000-8000-000000000006",
  stale: "30000000-0000-4000-8000-000000000007",
  absent: "30000000-0000-4000-8000-000000000008"
};

async function signIn(page: Page, username: string, path: string) {
  await page.context().clearCookies();
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  const login = await page.request.post("/api/v1/auth/login", {
    data: { username, password: "secret" },
    headers: { "X-CSRF-Token": csrf.token }
  });
  expect(login.status()).toBe(200);
  await page.goto(path);
}

async function backendRequests(page: Page) {
  const response = await page.request.get("http://127.0.0.1:38080/test/requests");
  return (await response.json()) as {
    requests: { method: string; path: string }[];
    customerDeletionAttempts: { actor: string; customerId: string }[];
  };
}

async function methodsSince(page: Page, requestCount: number, customerId: string) {
  const evidence = await backendRequests(page);
  return evidence.requests.slice(requestCount).filter(({ path }) => path === `/api/v1/customers/${customerId}`).map(({ method }) => method);
}

async function openConfirmation(page: Page) {
  await page.getByRole("button", { name: "Delete customer record" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete customer record" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("The linked login remains active");
  await expect(dialog).toContainText("KYC records remain");
  await expect(dialog).toContainText("Any account or dependent record blocks deletion");
  return dialog;
}

async function submitConfirmedDelete(page: Page, customerId: string) {
  const dialog = await openConfirmation(page);
  const confirm = dialog.getByRole("button", { name: "Confirm customer deletion" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type customer UUID to confirm").fill("30000000-0000-4000-8000-000000000000");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type customer UUID to confirm").fill(customerId);
  await expect(confirm).toBeEnabled();
  await confirm.click();
}

test("Admin deletion requires the exact customer UUID and confirms deletion through the BFF", async ({ page }) => {
  await signIn(page, "admin-customer-delete", `/staff/customers/${customers.safe}`);
  await expect(page.getByRole("heading", { name: "Dana Safe" })).toBeVisible();

  const { requests, customerDeletionAttempts } = await backendRequests(page);
  const withoutCsrf = await page.request.delete(`/api/v1/customers/${customers.safe}`);
  expect(withoutCsrf.status()).toBe(403);
  const dialog = await openConfirmation(page);
  const confirm = dialog.getByRole("button", { name: "Confirm customer deletion" });
  await expect(confirm).toBeDisabled();
  const input = dialog.getByLabel("Type customer UUID to confirm");
  await input.fill(`${customers.safe} `);
  await expect(confirm).toBeDisabled();
  await input.fill(customers.safe);
  await expect(confirm).toBeEnabled();
  expect(await methodsSince(page, requests.length, customers.safe)).toEqual([]);
  const response = page.waitForResponse((response) => response.request().method() === "DELETE" && response.url().endsWith(`/customers/${customers.safe}`));
  await confirm.click();

  expect((await response).status()).toBe(204);
  await expect(page).toHaveURL(/\/staff\/customers$/);
  await expect(page.getByRole("heading", { name: "Customer directory" })).toBeVisible();
  await expect(page.getByText("Ava Martin")).toBeVisible();
  await expect(page.getByText("Dana Safe")).toHaveCount(0);
  const evidence = await backendRequests(page);
  expect(await methodsSince(page, requests.length, customers.safe)).toEqual(["GET", "DELETE"]);
  expect(evidence.customerDeletionAttempts.slice(customerDeletionAttempts.length)).toEqual([{ actor: "admin-customer-delete", customerId: customers.safe }]);
});

for (const [role, username] of [["MANAGER", "manager"], ["TELLER", "teller"]] as const) {
  test(`${role} can inspect the record but cannot see or invoke customer deletion`, async ({ page }) => {
    await signIn(page, username, "/staff/customers/30000000-0000-4000-8000-000000000001");
    await expect(page.getByRole("heading", { name: "Ava Martin" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete customer record" })).toHaveCount(0);

    const csrf = await (await page.request.get("/api/auth/csrf")).json();
    const denied = await page.request.delete("/api/v1/customers/30000000-0000-4000-8000-000000000001", {
      headers: { "X-CSRF-Token": csrf.token }
    });
    expect(denied.status()).toBe(403);
  });
}

test("backend dependency conflict explains why no customer data was deleted", async ({ page }) => {
  await signIn(page, "admin-customer-delete-conflict", `/staff/customers/${customers.conflict}`);
  await submitConfirmedDelete(page, customers.conflict);

  await expect(page.locator(".error-box[role=alert]")).toContainText(/account or other dependent records remain/i);
  await expect(page.getByRole("heading", { name: "Casey Dependent" })).toBeVisible();
  const evidence = await backendRequests(page);
  expect(evidence.requests.filter((entry) => entry.method === "DELETE" && entry.path === `/api/v1/customers/${customers.conflict}`)).toHaveLength(1);
});

test("a changed record stops deletion and requires a fresh typed confirmation", async ({ page }) => {
  const path = `/api/v1/customers/${customers.stale}`;
  await signIn(page, "admin", `/staff/customers/${customers.stale}`);
  await expect(page.getByRole("heading", { name: "Ari Updated" })).toBeVisible();
  const dialog = await openConfirmation(page);
  await dialog.getByLabel("Type customer UUID to confirm").fill(customers.stale);

  const previous = await (await page.request.get(path)).json();
  const { token } = await (await page.request.get("/api/auth/csrf")).json();
  const update = await page.request.put("/api/v1/customers", {
    headers: { "X-CSRF-Token": token },
    data: { ...previous, firstName: "Aria" }
  });
  expect(update.status()).toBe(200);
  const { requests } = await backendRequests(page);
  await dialog.getByRole("button", { name: "Confirm customer deletion" }).click();

  await expect(page.getByRole("alert").filter({ hasText: /customer record changed/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aria Updated" })).toBeVisible();
  expect(await methodsSince(page, requests.length, customers.stale)).toEqual(["GET"]);
  const refreshedDialog = await openConfirmation(page);
  await expect(refreshedDialog.getByLabel("Type customer UUID to confirm")).toHaveValue("");
  await expect(refreshedDialog.getByRole("button", { name: "Confirm customer deletion" })).toBeDisabled();
  await refreshedDialog.getByRole("button", { name: "Cancel" }).click();
  expect(await methodsSince(page, requests.length, customers.stale)).toEqual(["GET"]);
});

test("an authoritative missing record before submission prevents a DELETE", async ({ page }) => {
  await signIn(page, "admin", `/staff/customers/${customers.absent}`);
  await expect(page.getByRole("heading", { name: "Sam Removed" })).toBeVisible();
  const { token } = await (await page.request.get("/api/auth/csrf")).json();
  const removed = await page.request.delete(`/api/v1/customers/${customers.absent}`, { headers: { "X-CSRF-Token": token } });
  expect(removed.status()).toBe(204);
  const { requests } = await backendRequests(page);

  await submitConfirmedDelete(page, customers.absent);

  await expect(page.getByRole("alert").filter({ hasText: /already absent from bank-core/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete customer record" })).toHaveCount(0);
  expect(await methodsSince(page, requests.length, customers.absent)).toEqual(["GET"]);
});

test("uncertain delete is reconciled as absent without resending DELETE", async ({ page }) => {
  await signIn(page, "admin-customer-delete-timeout-persisted", `/staff/customers/${customers.timeoutPersisted}`);
  await expect(page.getByRole("heading", { name: "Pat Persisted" })).toBeVisible();
  const { requests } = await backendRequests(page);
  await submitConfirmedDelete(page, customers.timeoutPersisted);

  await expect(page).toHaveURL(/\/staff\/customers$/);
  await expect(page.getByText("Ava Martin")).toBeVisible();
  await expect(page.getByText("Pat Persisted")).toHaveCount(0);
  expect(await methodsSince(page, requests.length, customers.timeoutPersisted)).toEqual(["GET", "DELETE", "GET"]);
});

test("uncertain delete with a present readback remains explicit and is not retried", async ({ page }) => {
  await signIn(page, "admin-customer-delete-timeout-present", `/staff/customers/${customers.timeoutPresent}`);
  await expect(page.getByRole("heading", { name: "Riley Uncertain" })).toBeVisible();
  const { requests } = await backendRequests(page);
  const response = page.waitForResponse((response) => response.request().method() === "DELETE" && response.url().endsWith(`/customers/${customers.timeoutPresent}`));
  await submitConfirmedDelete(page, customers.timeoutPresent);

  expect((await response).status()).toBe(504);
  await expect(page.getByRole("heading", { name: "Riley Uncertain" })).toBeVisible();
  await expect(page.locator(".error-box[role=alert]")).toContainText(/outcome is uncertain.*still present/i);
  await expect(page.getByRole("button", { name: "Delete customer record" })).toBeDisabled();
  expect(await methodsSince(page, requests.length, customers.timeoutPresent)).toEqual(["GET", "DELETE", "GET"]);
});
