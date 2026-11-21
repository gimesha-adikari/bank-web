import { expect, test, type Page } from "@playwright/test";

const directory = "/staff/customers";

async function signIn(page: Page, username: string, path = directory) {
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
  return (await response.json()).requests as { method: string; path: string }[];
}

async function attemptCreateForUser(page: Page, query: string, optionLabel: string, expectedError: RegExp) {
  await page.getByLabel("Search existing customer logins").fill(query);
  const user = page.getByLabel("Existing customer login", { exact: true });
  await expect(user).toBeVisible();
  await user.selectOption({ label: optionLabel });
  await page.getByLabel("Gender").selectOption("OTHER");
  await page.getByLabel("Phone").fill("0755555555");
  await page.getByLabel("Date of birth").fill("1991-06-07");
  await page.getByLabel("Record status").selectOption("ACTIVE");
  await page.getByRole("button", { name: "Create customer record" }).click();
  await expect(page.locator(".error-box[role=alert]")).toHaveText(expectedError);
}

for (const username of ["teller", "manager", "admin"]) {
  test(`${username} can browse and inspect shared customer records`, async ({ page }) => {
    await signIn(page, username);
    await expect(page).toHaveURL(/\/staff\/customers$/);
    await expect(page.getByRole("heading", { name: "Customer directory" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Customers", exact: true })).toHaveAttribute("href", directory);
    await expect(page.getByText("Ava Martin")).toBeVisible();
    await expect(page.getByText("ava.martin@example.test")).toBeVisible();

    await page.getByRole("link", { name: "View details" }).first().click();
    await expect(page.getByRole("heading", { name: "Ava Martin" })).toBeVisible();
    await expect(page.getByText("Customer ID")).toBeVisible();
    await expect(page.getByText("Linked user ID")).toBeVisible();
    const customerId = await page.locator("dd").filter({ hasText: /^30000000-/ }).textContent();
    const userId = await page.locator("dd").filter({ hasText: /^0ce3cd10-/ }).textContent();
    expect(customerId).toMatch(/^30000000-/);
    expect(userId).toMatch(/^0ce3cd10-/);

    const tellerAction = page.getByRole("link", { name: "Open Teller account form" });
    if (username === "teller") {
      await tellerAction.click();
      await expect(page).toHaveURL(new RegExp(`/staff/accounts/new\\?customerUserId=${userId}`));
      await expect(page.getByLabel("Customer")).toHaveValue(userId!);
    } else {
      await expect(tellerAction).toHaveCount(0);
    }
  });
}

test("staff create and update existing customer records through the authenticated BFF", async ({ page }) => {
  await signIn(page, "manager");
  await page.getByRole("link", { name: "Create customer record" }).click();
  await expect(page).toHaveURL(/\/staff\/customers\/new$/);
  await page.getByLabel("Search existing customer logins").fill("Grace");
  await page.getByLabel("Existing customer login", { exact: true }).selectOption({ label: "Grace Hopper · grace.hopper@example.test" });
  await page.getByLabel("Gender").selectOption("OTHER");
  await page.getByLabel("Phone").fill("0733333333");
  await page.getByLabel("Date of birth").fill("1985-12-09");
  await page.getByLabel("Record status").selectOption("ACTIVE");
  await page.getByRole("button", { name: "Create customer record" }).click();
  await expect(page).toHaveURL(/\/staff\/customers\/[\da-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Grace Hopper" })).toBeVisible();

  const customerId = await page.locator("dd").filter({ hasText: /^[\da-f-]{36}$/ }).first().textContent();
  const userId = await page.locator("dd").filter({ hasText: /^0ce3cd10-/ }).textContent();
  expect(customerId).not.toBe(userId);
  await page.getByRole("button", { name: "Edit customer details" }).click();
  await page.getByLabel("Phone").fill("0744444444");
  await page.getByRole("button", { name: "Save customer details" }).click();
  await expect(page.getByText("Customer record updated by bank-core.")).toBeVisible();
  await expect(page.getByText("0744444444")).toBeVisible();
  await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();

  const requests = await backendRequests(page);
  expect(requests.some((entry) => entry.method === "GET" && entry.path === "/api/v1/customers")).toBe(true);
  expect(requests.some((entry) => entry.method === "GET" && entry.path === "/api/v1/users/all")).toBe(true);
  expect(requests.some((entry) => entry.method === "POST" && entry.path === "/api/v1/customers")).toBe(true);
  expect(requests.some((entry) => entry.method === "PUT" && entry.path === "/api/v1/customers")).toBe(true);
  expect(requests.some((entry) => entry.method === "GET" && entry.path === `/api/v1/customers/${customerId}`)).toBe(true);
});

test("customer search filters the loaded list without claiming server pagination", async ({ page }) => {
  await signIn(page, "teller");
  await page.getByLabel("Search customer records").fill("morgan.reed");
  await expect(page.getByText("Morgan Reed")).toBeVisible();
  await expect(page.getByText("Ava Martin")).toHaveCount(0);
  await expect(page.getByText(/complete list without pagination/i)).toBeVisible();
});

test("staff create flow excludes an already linked customer user", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/staff/customers/new");
  await page.getByLabel("Search existing customer logins").fill("ava.martin@example.test");
  await expect(page.getByText("No unlinked customer login matched that search.")).toBeVisible();
  await expect(page.getByLabel("Existing customer login", { exact: true })).toHaveCount(0);
});

test("staff create explains missing users, duplicate records and DTO validation failures", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/staff/customers/new");

  await attemptCreateForUser(page, "Vanishing", "Vanishing Identity · vanishing@example.test", /selected customer login could not be found/i);
  await attemptCreateForUser(page, "Duplicate", "Duplicate Identity · duplicate@example.test", /already has a customer record/i);
  await attemptCreateForUser(page, "invalid.details", "Invalid Details · invalid.details@example.test", /dateOfBirth: must be a valid date/i);
});

test("a customer is denied direct staff customer directory navigation", async ({ page }) => {
  await signIn(page, "customer");
  await expect(page).toHaveURL(/\/unauthorized$/);
  await expect(page.getByRole("heading", { name: /do not have access/i })).toBeVisible();
});

test("directory reports a backend forbidden response without redirecting a permitted staff session", async ({ page }) => {
  await signIn(page, "directory-forbidden");
  await expect(page.locator(".error-box[role=alert]")).toHaveText(/not permitted to view customer records/i);
  await expect(page).toHaveURL(/\/staff\/customers$/);
});

test("customer detail reports a missing record", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/staff/customers/30000000-0000-4000-8000-000000000099");
  await expect(page.locator(".error-box[role=alert]")).toHaveText(/customer record was not found/i);
});

test("an expired backend session clears access and returns to login", async ({ page }) => {
  await signIn(page, "directory-expired");
  await page.goto(directory);
  await expect(page).toHaveURL(/\/login/);
});

test("directory reports an upstream transport failure", async ({ page }) => {
  await signIn(page, "directory-network");
  await page.goto(directory);
  await expect(page.locator(".error-box[role=alert]")).toHaveText(/banking service could not be reached/i);
});
