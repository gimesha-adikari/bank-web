import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const onboarding = "/customer/onboarding";
const documents = ["ID front", "ID back", "Selfie", "Proof of address"];
const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 255]);

async function signIn(page: Page, username: string, path = "/customer") {
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  expect((await page.request.post("/api/v1/auth/login", {
    data: { username, password: "secret" },
    headers: { "X-CSRF-Token": csrf.token }
  })).status()).toBe(200);
  await page.goto(path);
}

async function upstreamCalls(request: APIRequestContext, path: string, method: string) {
  const { requests } = await (await request.get("http://127.0.0.1:38080/test/requests")).json() as {
    requests: { path: string; method: string }[];
  };
  return requests.filter((entry) => entry.path === path && entry.method === method).length;
}

async function uploadDocuments(page: Page) {
  for (const label of documents) {
    const section = page.getByRole("group", { name: label, exact: true });
    await section.getByLabel(label, { exact: true }).setInputFiles({
      name: "synthetic.png", mimeType: "image/png", buffer: image
    });
    await section.getByRole("button", { name: "Upload" }).click();
    await expect(section.getByText("Uploaded", { exact: true })).toBeVisible();
  }
}

test("a new customer verifies four documents, sees approval, and completes their customer record", async ({ page, request }) => {
  await signIn(page, "new-customer");
  await expect(page).toHaveURL(/\/customer\/onboarding$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Customer onboarding" })).toBeVisible();
  await expect(page.getByText("No verification case yet.")).toBeVisible();
  const uploadsBefore = await upstreamCalls(request, "/kyc/upload", "POST");
  const front = page.getByRole("group", { name: "ID front", exact: true }).getByLabel("ID front", { exact: true });
  await front.setInputFiles({ name: "synthetic.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
  await expect(page.getByText("Choose a JPEG, PNG, or WebP image.")).toBeVisible();
  await front.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(1024 * 1024 + 1) });
  await expect(page.getByText("Each file must be 1 MiB or smaller.")).toBeVisible();
  expect(await upstreamCalls(request, "/kyc/upload", "POST")).toBe(uploadsBefore);
  const frontUpload = page.getByRole("group", { name: "ID front", exact: true });
  await front.setInputFiles({ name: "unreadable.png", mimeType: "image/png", buffer: Buffer.from("unreadable") });
  await frontUpload.getByRole("button", { name: "Upload" }).click();
  await expect(frontUpload.getByRole("alert")).toContainText("Bank-core rejected this file.");
  await uploadDocuments(page);
  expect(await upstreamCalls(request, "/kyc/upload", "POST")).toBe(uploadsBefore + 5);

  const submit = page.getByRole("button", { name: "Submit verification" });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox", { name: /consent/i }).check();
  const before = await upstreamCalls(request, "/kyc/submit", "POST");
  await submit.evaluate((button) => {
    const form = (button as HTMLButtonElement).form!;
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  expect(await upstreamCalls(request, "/kyc/submit", "POST")).toBe(before + 1);
  await expect(page.getByRole("button", { name: "Save customer details" })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByText("FACE MATCH", { exact: true })).toBeVisible();

  const save = page.getByRole("button", { name: "Save customer details" });
  await expect(save).toBeVisible();
  await page.getByLabel("First name", { exact: true }).fill("   ");
  await page.getByLabel("Last name", { exact: true }).fill("Customer");
  await page.getByLabel("Gender", { exact: true }).selectOption("OTHER");
  await page.getByLabel("Phone", { exact: true }).fill("0712345678");
  await page.getByLabel("Date of birth", { exact: true }).fill("1990-05-01");
  await save.click();
  await expect(page.getByText("Enter your first name.")).toBeVisible();
  await page.getByLabel("First name", { exact: true }).fill("New");
  const recordReads = await upstreamCalls(request, "/api/v1/customers/me", "GET");
  await save.click();
  await expect(page.getByText("Customer details saved.")).toBeVisible();
  await expect(page.getByText("Onboarding complete", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open an account", exact: true })).toHaveAttribute("href", "/customer/accounts/new");
  await expect.poll(() => upstreamCalls(request, "/api/v1/customers/me", "GET")).toBe(recordReads + 1);
  await expect(save).toBeEnabled();
  await page.getByLabel("Phone", { exact: true }).fill("0712345679");
  await save.click();
  await expect(page.getByText("Customer details saved.")).toBeVisible();
  await expect(save).toBeEnabled();
  const refreshed = await page.request.get("/api/v1/customers/me");
  expect(await refreshed.json()).toMatchObject({ phone: "0712345679" });
  await page.getByRole("link", { name: "Go to dashboard" }).click();
  await expect(page).toHaveURL(/\/customer$/);
  await expect(page.getByText("Opening an account is your next step.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open an account", exact: true })).toHaveAttribute("href", "/customer/accounts/new");
});

test("a timeout checks for a persisted case without submitting again", async ({ page, request }, testInfo) => {
  const username = `timeout-customer-r${testInfo.repeatEachIndex}-t${testInfo.retry}`;
  await signIn(page, username, onboarding);
  await uploadDocuments(page);
  await page.getByRole("checkbox", { name: /consent/i }).check();
  const before = await upstreamCalls(request, "/kyc/submit", "POST");
  const timeout = page.waitForResponse((response) => response.url().endsWith("/api/kyc/submit") && response.status() === 504);
  await page.getByRole("button", { name: "Submit verification" }).click();
  await timeout;
  await expect(page.getByText("Under review", { exact: true })).toBeVisible();
  await expect(page.getByText(/automatic review is unavailable/i)).toBeVisible();
  expect(await upstreamCalls(request, "/kyc/submit", "POST")).toBe(before + 1);
  await expect(page.getByRole("button", { name: /retry.*submission/i })).toHaveCount(0);
});

test("an uncertain submission with no persisted case can only be retried deliberately with the same payload and key", async ({ page, request }) => {
  await signIn(page, "retry-customer", onboarding);
  await uploadDocuments(page);
  await page.getByRole("checkbox", { name: /consent/i }).check();
  const before = await upstreamCalls(request, "/kyc/submit", "POST");
  const initialReads = await upstreamCalls(request, "/kyc/me", "GET");
  await page.getByRole("button", { name: "Submit verification" }).click();
  const retry = page.getByRole("button", { name: "Check and retry same submission" });
  await expect(retry).toBeEnabled();
  expect(await upstreamCalls(request, "/kyc/submit", "POST")).toBe(before + 1);
  expect(await upstreamCalls(request, "/kyc/me", "GET")).toBe(initialReads + 1);
  await expect(page.getByLabel("ID front", { exact: true })).toBeDisabled();
  await retry.click();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  expect(await upstreamCalls(request, "/kyc/submit", "POST")).toBe(before + 2);
  expect(await upstreamCalls(request, "/kyc/me", "GET")).toBe(initialReads + 3);
});

test("needs-more-info explains the backend restriction and rejection allows a deliberate restart", async ({ page }) => {
  await signIn(page, "info-customer", onboarding);
  await expect(page.getByText("More information needed", { exact: true })).toBeVisible();
  await expect(page.getByText(/replacement documents cannot be submitted/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /submit verification/i })).toHaveCount(0);

  await signIn(page, "rejected-customer", onboarding);
  await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("Document could not be verified.")).toBeVisible();
  await page.getByRole("button", { name: "Start a new verification" }).click();
  await expect(page.getByRole("group", { name: "ID front", exact: true })).toBeVisible();
});

test("existing customers bypass onboarding", async ({ page }) => {
  await signIn(page, "customer");
  await expect(page.getByText("100.0000 LKR")).toBeVisible();
  await expect(page).toHaveURL(/\/customer$/);

});

for (const { username, message } of [
  { username: "lookup-error", message: /could not load your customer record/i },
  { username: "accounts-error", message: /accounts service unavailable/i }
]) {
  test(`the dashboard stays open after ${username}`, async ({ page }) => {
    await signIn(page, username);
    await expect(page.getByText(message)).toBeVisible();
    await expect(page).toHaveURL(/\/customer$/);
  });
}

test("backend denial cannot be mistaken for a missing case", async ({ page }) => {
  await signIn(page, "denied-customer", onboarding);
  await expect(page.getByText(/not allowed to view your verification/i)).toBeVisible();
  await expect(page).toHaveURL(/\/customer\/onboarding$/);
  await expect(page.getByRole("button", { name: /submit verification/i })).toHaveCount(0);
});

test("a non-customer cannot open the onboarding page", async ({ page }) => {
  await signIn(page, "teller", onboarding);
  await expect(page).toHaveURL(/\/unauthorized$/, { timeout: 15_000 });
});
